import "server-only";
import { getSupabase, hasSupabase } from "@/lib/supabase";
import { normalize } from "./client";
import { simplifyRoute } from "./route";
import type { Activity, GeoActivity, RawActivity } from "./types";

/** One row of the `activities` table (see supabase/schema.sql). */
export interface ActivityRow {
  id: number;
  name: string;
  sport: Activity["sport"];
  start_local: string;
  distance: number;
  moving_time: number;
  elapsed_time: number;
  elevation: number;
  race: boolean;
  indoor: boolean;
  hr: number | null;
  hr_max: number | null;
  cad: number | null;
  watts: number | null;
  np: number | null;
  device_watts: boolean | null;
  start_lat: number | null;
  start_lng: number | null;
  polyline: string | null;
  synced_at: string;
}

/** Columns the page needs (no route: it is large and only the map uses it). */
const ACTIVITY_COLS =
  "id,name,sport,start_local,distance,moving_time,elapsed_time,elevation,race,indoor,hr,hr_max,cad,watts,np,device_watts";
const PAGE = 1000; // PostgREST returns at most 1000 rows per request

// ---------------------------------------------------------------- mapping

/**
 * Strava activity -> database row. Uses the same normalization as the direct path
 * (client.ts), so numbers are identical whichever source feeds the page.
 * NOTE: scripts/strava-backfill.mjs repeats this mapping in plain JS; keep both in sync.
 */
export function toRow(raw: RawActivity): ActivityRow | null {
  const a = normalize(raw);
  if (!a) return null;
  return {
    id: a.id,
    name: a.name,
    sport: a.sport,
    start_local: a.date,
    distance: a.distance,
    moving_time: a.movingTime,
    elapsed_time: a.elapsedTime,
    elevation: a.elevation,
    race: !!a.race,
    indoor: !!a.indoor,
    hr: a.hr ?? null,
    hr_max: a.hrMax ?? null,
    cad: a.cad ?? null,
    watts: a.watts ?? null,
    np: a.np ?? null,
    device_watts: a.deviceWatts ?? null,
    start_lat: raw.start_latlng?.[0] ?? null,
    start_lng: raw.start_latlng?.[1] ?? null,
    polyline: raw.map?.summary_polyline ?? null,
    synced_at: new Date().toISOString(),
  };
}

type ActivityCols = Pick<
  ActivityRow,
  | "id" | "name" | "sport" | "start_local" | "distance" | "moving_time" | "elapsed_time" | "elevation"
  | "race" | "indoor" | "hr" | "hr_max" | "cad" | "watts" | "np" | "device_watts"
>;

export function rowToActivity(r: ActivityCols): Activity {
  return {
    id: Number(r.id),
    name: r.name,
    sport: r.sport,
    date: r.start_local.slice(0, 19),
    distance: r.distance,
    movingTime: r.moving_time,
    elapsedTime: r.elapsed_time,
    elevation: r.elevation,
    ...(r.race ? { race: true } : {}),
    ...(r.indoor ? { indoor: true } : {}),
    ...(r.hr != null ? { hr: r.hr } : {}),
    ...(r.hr_max != null ? { hrMax: r.hr_max } : {}),
    ...(r.cad != null ? { cad: r.cad } : {}),
    ...(r.watts != null ? { watts: r.watts, deviceWatts: !!r.device_watts } : {}),
    ...(r.np != null ? { np: r.np } : {}),
  };
}

// ------------------------------------------------------------------ state

export async function getState(key: string): Promise<string | null> {
  const { data, error } = await getSupabase().from("sync_state").select("value").eq("key", key).maybeSingle();
  if (error) throw new Error(`Supabase sync_state: ${error.message}`);
  return data?.value ?? null;
}

export async function setState(key: string, value: string): Promise<void> {
  const { error } = await getSupabase()
    .from("sync_state")
    .upsert({ key, value, updated_at: new Date().toISOString() }, { onConflict: "key" });
  if (error) throw new Error(`Supabase sync_state: ${error.message}`);
}

/** True once the first full import (scripts/strava-backfill.mjs) has finished. */
export async function dbBackfilled(): Promise<boolean> {
  if (!hasSupabase()) return false;
  try {
    return (await getState("backfill_done")) !== null;
  } catch (e) {
    console.error("Supabase unavailable, falling back to the Strava API:", e);
    return false;
  }
}

export interface DbAthlete {
  id: number;
  name: string;
  avatar?: string;
  createdYear: number;
}

export async function dbAthlete(): Promise<DbAthlete | null> {
  const raw = await getState("athlete");
  if (!raw) return null;
  try {
    return JSON.parse(raw) as DbAthlete;
  } catch {
    return null;
  }
}

// ------------------------------------------------------------------ writes

export async function upsertRows(rows: ActivityRow[]): Promise<void> {
  for (let i = 0; i < rows.length; i += 500) {
    const { error } = await getSupabase()
      .from("activities")
      .upsert(rows.slice(i, i + 500), { onConflict: "id" });
    if (error) throw new Error(`Supabase activities upsert: ${error.message}`);
  }
}

export async function deleteById(id: number): Promise<void> {
  const { error } = await getSupabase().from("activities").delete().eq("id", id);
  if (error) throw new Error(`Supabase activities delete: ${error.message}`);
}

// ------------------------------------------------------------------- reads

/** All activities of one calendar year, newest first. */
export async function dbYear(year: number): Promise<Activity[]> {
  const out: Activity[] = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await getSupabase()
      .from("activities")
      .select(ACTIVITY_COLS)
      .gte("start_local", `${year}-01-01T00:00:00`)
      .lt("start_local", `${year + 1}-01-01T00:00:00`)
      .order("start_local", { ascending: false })
      .range(from, from + PAGE - 1);
    if (error) throw new Error(`Supabase activities: ${error.message}`);
    out.push(...(data as ActivityCols[]).map(rowToActivity));
    if (!data || data.length < PAGE) break;
  }
  return out;
}

/** Routes for the map: outdoor activities with GPS, already simplified. */
export async function dbRoutes(): Promise<GeoActivity[]> {
  const out: GeoActivity[] = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await getSupabase()
      .from("activities")
      .select("id,sport,start_local,distance,polyline")
      .not("polyline", "is", null)
      .eq("indoor", false)
      .neq("sport", "strength")
      .order("start_local", { ascending: false })
      .range(from, from + PAGE - 1);
    if (error) throw new Error(`Supabase routes: ${error.message}`);
    for (const r of data ?? []) {
      const route = simplifyRoute(r.polyline as string);
      if (!route) continue;
      const date = (r.start_local as string).slice(0, 19);
      out.push({
        id: Number(r.id),
        sport: r.sport as GeoActivity["sport"],
        year: Number(date.slice(0, 4)),
        date,
        distance: r.distance as number,
        lat: route.lat,
        lng: route.lng,
        line: route.line,
      });
    }
    if (!data || data.length < PAGE) break;
  }
  return out;
}
