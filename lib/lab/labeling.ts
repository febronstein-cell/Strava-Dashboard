import "server-only";
import { cacheLife, cacheTag } from "next/cache";
import { dbYear } from "@/lib/strava/db";
import { stravaGet, stravaPut } from "@/lib/strava/client";
import { getSupabase, hasSupabase } from "@/lib/supabase";
import type { Activity } from "@/lib/strava/types";
import { getLabData } from "./get-lab";
import { classify, type LabelInput, type LapIn } from "./label";
import { isDefaultTitle } from "./titles";
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

/**
 * RULES for changing anything on Strava (set by the owner; they are the only code path that writes there):
 *  1. Never touch an activity whose title is not one Strava made up ("Morning Run", "Corrida da tarde"):
 *     a title the owner wrote is final, and then neither the title nor the description is changed.
 *  2. Only bike, run and gym (weight training) workouts: swims, "Workout" sessions (transition, cardio...)
 *     and everything else are left alone.
 *  3. Only workouts of more than 15 minutes of moving time.
 *  4. The new title names the TYPE of the session and its set ("VO2max Effort 5x4'", "Tempo Run"...); the
 *     description is a short summary plus the "Workout type" line. Nothing is ever added twice.
 * It runs only when STRAVA_LABEL_WRITE is set (any value; the old modes "title" and "description" are gone).
 * Needs the activity:write scope.
 */
const NAMEABLE = new Set(["Ride", "VirtualRide", "GravelRide", "MountainBikeRide", "EBikeRide", "EMountainBikeRide", "Run", "TrailRun", "VirtualRun", "WeightTraining"]);
const MIN_NAME_SECONDS = 15 * 60;

/** True when the workout may be named at all (sport and length), judged from our own data plus, for gym, the Strava type. */
export async function canName(a: { id: number; sport: string; movingMin: number }): Promise<boolean> {
  if (a.movingMin * 60 <= MIN_NAME_SECONDS) return false;
  if (a.sport === "ride" || a.sport === "run") return true;
  if (a.sport !== "strength") return false;
  // "strength" in our data also holds generic "Workout" sessions: only real weight training is named
  const detail = await stravaGet<{ sport_type?: string }>(`/activities/${a.id}`);
  return detail.sport_type === "WeightTraining";
}

/** Remembers what the last attempt to write to Strava did (and why), in sync_state: readable without the host's logs. */
export async function recordPublish(id: number, outcome: string): Promise<void> {
  try {
    await getSupabase()
      .from("sync_state")
      .upsert({ key: "publish_status", value: JSON.stringify({ at: new Date().toISOString(), activity: id, outcome }), updated_at: new Date().toISOString() }, { onConflict: "key" });
  } catch {
    /* a log must never break the work */
  }
}

export async function publishToStrava(a: { id: number; name: string }, parts: { label?: string; title?: string; blurb?: string }): Promise<boolean> {
  if (!process.env.STRAVA_LABEL_WRITE) {
    await recordPublish(a.id, "off: STRAVA_LABEL_WRITE is not set on this server");
    return false;
  }
  if (!parts.title) {
    await recordPublish(a.id, "skipped: no title");
    return false;
  }

  const detail = await stravaGet<{ name?: string; description?: string | null; sport_type?: string; moving_time?: number }>(`/activities/${a.id}`);
  const name = detail.name ?? a.name;
  if (!NAMEABLE.has(detail.sport_type ?? "")) return (await recordPublish(a.id, `skipped: type ${detail.sport_type} is not named`), false); // rule 2
  if ((detail.moving_time ?? 0) <= MIN_NAME_SECONDS) return (await recordPublish(a.id, "skipped: 15 minutes or less"), false); // rule 3
  if (!isDefaultTitle(name)) return (await recordPublish(a.id, `skipped: custom title "${name}"`), false); // rule 1: a title the owner wrote is never touched

  let label = parts.label;
  if (!label) {
    const { data } = await getSupabase().from("activity_labels").select("label").eq("activity_id", a.id).maybeSingle();
    label = data?.label ? String(data.label) : undefined;
  }

  const old = (detail.description ?? "").trim();
  const body: Record<string, string> = { name: parts.title };
  if (!/Workout type:/i.test(old)) {
    const added = [parts.blurb, label ? `Workout type: ${label}` : undefined].filter(Boolean).join("\n\n");
    if (added) body.description = old ? `${old}\n\n${added}` : added;
  }

  try {
    await stravaPut(`/activities/${a.id}`, body);
  } catch (e) {
    await recordPublish(a.id, `error: ${e instanceof Error ? e.message.slice(0, 200) : String(e)}`);
    throw e;
  }
  await getSupabase().from("activity_labels").update({ written_to_strava: true }).eq("activity_id", a.id);
  await recordPublish(a.id, `ok: renamed to "${parts.title}"`);
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
  // with an AI key the title and description come with the analysis, which publishes them
  if (process.env.STRAVA_LABEL_WRITE && !process.env.ANTHROPIC_API_KEY) {
    try {
      written = await publishToStrava(a, { label: result.label, title: result.label });
    } catch (e) {
      console.error("Could not write the workout type to Strava:", e);
    }
  }
  const { error } = await getSupabase()
    .from("activity_labels")
    .upsert({ activity_id: id, label: result.label, basis: result.basis, written_to_strava: written }, { onConflict: "activity_id" });
  if (error) throw new Error(`Could not save the workout type: ${error.message}`);
  return result.label;
}

/** Workout type names and cool titles by activity id (empty if the tables do not exist yet). */
export async function getLabelData(): Promise<{ labels: Record<number, string>; titles: Record<number, string> }> {
  "use cache";
  cacheLife({ stale: 120, revalidate: 900, expire: 86400 });
  cacheTag("strava-live");

  const labels: Record<number, string> = {};
  const titles: Record<number, string> = {};
  if (!hasSupabase()) return { labels, titles };
  try {
    const db = getSupabase();
    for (let from = 0; ; from += 1000) {
      const { data, error } = await db.from("activity_labels").select("activity_id,label").range(from, from + 999);
      if (error) break;
      for (const r of data ?? []) labels[Number(r.activity_id)] = String(r.label);
      if ((data ?? []).length < 1000) break;
    }
    for (let from = 0; ; from += 1000) {
      const { data, error } = await db.from("workout_analysis").select("activity_id,details").range(from, from + 999);
      if (error) break;
      for (const r of data ?? []) {
        const t = (r.details as { title?: string } | null)?.title;
        if (t) titles[Number(r.activity_id)] = t;
      }
      if ((data ?? []).length < 1000) break;
    }
  } catch {
    /* keep whatever was read */
  }
  return { labels, titles };
}

/** Workout type names by activity id. */
export async function getLabels(): Promise<Record<number, string>> {
  return (await getLabelData()).labels;
}
