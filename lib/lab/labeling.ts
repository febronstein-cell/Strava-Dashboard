import "server-only";
import { cacheLife, cacheTag } from "next/cache";
import { dbYear } from "@/lib/strava/db";
import { stravaGet, stravaPut } from "@/lib/strava/client";
import { getSupabase, hasSupabase } from "@/lib/supabase";
import type { Activity } from "@/lib/strava/types";
import { getLabData } from "./get-lab";
import { classify, type LabelInput, type LapIn } from "./label";
import { brickOf } from "./workout";
import { buildProfile, type Profile } from "./profile";

const brtYear = () => Number(new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo", year: "numeric" }).format(new Date()));

interface StreamSet {
  time?: { data: number[] };
  watts?: { data: number[] };
  velocity_smooth?: { data: number[] };
}
interface RawLap {
  distance: number;
  elapsed_time?: number;
  moving_time?: number;
  average_watts?: number;
}

/** Second-by-second data (bike, run) or laps (swim) of ONE activity: 1 Strava request. */
async function fetchInput(a: Activity): Promise<LabelInput> {
  const base: LabelInput = {
    sport: a.sport,
    indoor: !!a.indoor,
    race: !!a.race,
    movingTime: a.movingTime,
    distance: a.distance,
    hr: a.hr,
  };
  try {
    if (a.sport === "ride") {
      const s = await stravaGet<StreamSet>(`/activities/${a.id}/streams?keys=time,watts&key_by_type=true`);
      return { ...base, time: s.time?.data, watts: s.watts?.data };
    }
    if (a.sport === "run") {
      const s = await stravaGet<StreamSet>(`/activities/${a.id}/streams?keys=time,velocity_smooth&key_by_type=true`);
      return { ...base, time: s.time?.data, speed: s.velocity_smooth?.data };
    }
    if (a.sport === "swim") {
      const laps = await stravaGet<RawLap[]>(`/activities/${a.id}/laps`);
      const mapped: LapIn[] = laps.map((l) => ({ distance: l.distance, time: l.moving_time ?? l.elapsed_time ?? 0, watts: l.average_watts }));
      return { ...base, laps: mapped };
    }
  } catch (e) {
    // rate limit: let the caller stop; other errors (404, no data) just mean "name it from the summary"
    if (e instanceof Error && /429/.test(e.message)) throw e;
  }
  return base;
}

/** Shared context for naming several workouts: the history and the athlete's thresholds. */
export async function labelContext(): Promise<{ acts: Activity[]; profile: Profile }> {
  const year = brtYear();
  const acts = [...(await dbYear(year)), ...(await dbYear(year - 1))];
  const lab = await getLabData();
  return { acts, profile: buildProfile(lab.thresholds, acts, lab.power) };
}

/** Generic names that say nothing besides "easy-ish run": the brick name replaces them. */
const GENERIC = /^(Run|Easy run|Recovery run|Steady run|Tempo run|Short easy jog)$/;

/** Adds the brick / triathlon context to a name: "T2 brick run", "Triathlon bike"... */
export function applyBrick(label: string, a: Activity, all: Activity[]): string {
  const b = brickOf(a, all);
  if (!b) return label;
  if (b.kind === "triathlon") return `Triathlon ${b.role === "ride" ? "bike" : b.role}`;
  if (b.role === "run") return GENERIC.test(label) ? "T2 brick run" : `T2 · ${label}`;
  return `${label} (bike to run brick)`;
}

/** What the name WOULD be (nothing is saved or written): for checking the rules on real workouts. */
export async function previewLabel(id: number, ctx: { acts: Activity[]; profile: Profile }): Promise<{ label: string; basis: string } | null> {
  const a = ctx.acts.find((x) => x.id === id);
  const r = a ? classify(await fetchInput(a), ctx.profile) : null;
  return r && a ? { ...r, label: applyBrick(r.label, a, ctx.acts) } : r;
}

/** Writes the name back to Strava when STRAVA_LABEL_WRITE is "description" (default when set) or "title". */
async function writeToStrava(a: Activity, label: string): Promise<boolean> {
  const mode = process.env.STRAVA_LABEL_WRITE;
  if (!mode) return false;
  if (mode === "title") {
    if (a.name.includes(label)) return true;
    await stravaPut(`/activities/${a.id}`, { name: `${a.name} · ${label}` });
    return true;
  }
  const detail = await stravaGet<{ description?: string | null }>(`/activities/${a.id}`);
  const old = (detail.description ?? "").trim();
  if (/Workout type:/i.test(old)) return true;
  await stravaPut(`/activities/${a.id}`, { description: `${old ? `${old}\n\n` : ""}Workout type: ${label}` });
  return true;
}

/**
 * Names one workout and saves the name. Returns the name (or null when the sport has no rule).
 * `ctx` lets a batch reuse the history and thresholds instead of loading them for every workout.
 */
export async function labelAndStore(id: number, ctx?: { acts: Activity[]; profile: Profile }): Promise<string | null> {
  const { acts, profile } = ctx ?? (await labelContext());
  const a = acts.find((x) => x.id === id);
  if (!a) return null;
  const result = classify(await fetchInput(a), profile);
  if (!result) return null;
  result.label = applyBrick(result.label, a, acts);

  let written = false;
  try {
    written = await writeToStrava(a, result.label);
  } catch (e) {
    console.error("Could not write the workout type to Strava:", e);
  }
  const { error } = await getSupabase()
    .from("activity_labels")
    .upsert({ activity_id: id, label: result.label, basis: result.basis, written_to_strava: written }, { onConflict: "activity_id" });
  if (error) throw new Error(`Could not save the workout type: ${error.message}`);
  return result.label;
}

/** Workout type names by activity id (empty if the table does not exist yet). */
export async function getLabels(): Promise<Record<number, string>> {
  "use cache";
  cacheLife({ stale: 120, revalidate: 900, expire: 86400 });
  cacheTag("strava-live");

  if (!hasSupabase()) return {};
  try {
    const out: Record<number, string> = {};
    for (let from = 0; ; from += 1000) {
      const { data, error } = await getSupabase().from("activity_labels").select("activity_id,label").range(from, from + 999);
      if (error) return out;
      for (const r of data ?? []) out[Number(r.activity_id)] = String(r.label);
      if ((data ?? []).length < 1000) break;
    }
    return out;
  } catch {
    return {};
  }
}
