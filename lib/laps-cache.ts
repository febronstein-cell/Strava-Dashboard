import "server-only";
import type { Lap } from "@/lib/compliance";
import { stravaGet } from "@/lib/strava/client";
import { getSupabase } from "@/lib/supabase";

interface StravaLap {
  elapsed_time?: number;
  moving_time?: number;
  distance?: number;
  average_speed?: number;
  average_heartrate?: number;
  average_watts?: number;
}

const toLap = (l: StravaLap): Lap => ({
  elapsedS: l.elapsed_time ?? l.moving_time ?? 0,
  movingS: l.moving_time ?? l.elapsed_time ?? 0,
  distM: l.distance ?? 0,
  speed: l.average_speed ?? undefined,
  hr: l.average_heartrate ?? undefined,
  watts: l.average_watts ?? undefined,
});

/**
 * Laps of activities, from the activity_laps table; the ones not stored yet are fetched from Strava (at most
 * `maxFetch` per call, to stay far from the rate limit) and stored for good. Activities still missing are listed.
 */
export async function getLaps(ids: number[], maxFetch = 6): Promise<{ laps: Record<number, Lap[]>; pending: number[] }> {
  const laps: Record<number, Lap[]> = {};
  if (!ids.length) return { laps, pending: [] };
  const db = getSupabase();
  const { data, error } = await db.from("activity_laps").select("activity_id,laps").in("activity_id", ids);
  if (error) return { laps, pending: ids }; // table not created yet
  for (const r of data ?? []) laps[Number(r.activity_id)] = (r.laps as Lap[]) ?? [];

  const missing = ids.filter((id) => !(id in laps));
  const pending: number[] = [];
  for (const [i, id] of missing.entries()) {
    if (i >= maxFetch) {
      pending.push(id);
      continue;
    }
    try {
      const raw = await stravaGet<StravaLap[]>(`/activities/${id}/laps`);
      laps[id] = raw.map(toLap);
      await db.from("activity_laps").upsert({ activity_id: id, laps: laps[id], fetched_at: new Date().toISOString() }, { onConflict: "activity_id" });
    } catch {
      pending.push(id);
    }
  }
  return { laps, pending };
}

/** Manual re-matches of a week: activity id -> {day, slot} or null (unplanned). */
export async function getOverrides(weekStart: string): Promise<Record<number, { day: number; slot: number } | null>> {
  const { data, error } = await getSupabase().from("plan_matches").select("activity_id,day,slot").eq("week_start", weekStart);
  if (error) return {};
  return Object.fromEntries((data ?? []).map((r) => [Number(r.activity_id), r.slot == null || r.day == null ? null : { day: Number(r.day), slot: Number(r.slot) }]));
}
