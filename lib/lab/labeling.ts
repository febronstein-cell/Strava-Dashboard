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
 * Sends the workout's name and description to Strava, according to STRAVA_LABEL_WRITE (nothing happens when unset):
 *   smart        (recommended) replaces the title ONLY when it is one Strava made up ("Morning Run", "Corrida da tarde");
 *                a title you wrote is kept. Adds the short description and the "Workout type" line to the description.
 *   description  only adds the "Workout type" line to the description.
 *   title        adds the workout type to the end of the title.
 * It never overwrites text you wrote and never adds the same line twice. Needs the activity:write scope.
 */
export async function publishToStrava(a: { id: number; name: string }, parts: { label?: string; title?: string; blurb?: string }): Promise<boolean> {
  const mode = process.env.STRAVA_LABEL_WRITE;
  if (!mode) return false;

  let label = parts.label;
  if (!label) {
    const { data } = await getSupabase().from("activity_labels").select("label").eq("activity_id", a.id).maybeSingle();
    label = data?.label ? String(data.label) : undefined;
  }

  const detail = await stravaGet<{ name?: string; description?: string | null }>(`/activities/${a.id}`);
  const name = detail.name ?? a.name;
  const old = (detail.description ?? "").trim();
  const body: Record<string, string> = {};

  if (mode === "title") {
    if (label && !name.includes(label)) body.name = `${name} · ${label}`;
  } else if (mode === "smart" && parts.title && isDefaultTitle(name)) {
    body.name = parts.title;
  }
  if (mode !== "title" && !/Workout type:/i.test(old)) {
    const added = [mode === "smart" ? parts.blurb : undefined, label ? `Workout type: ${label}` : undefined].filter(Boolean).join("\n\n");
    if (added) body.description = old ? `${old}\n\n${added}` : added;
  }
  if (Object.keys(body).length === 0) return false;

  await stravaPut(`/activities/${a.id}`, body);
  await getSupabase().from("activity_labels").update({ written_to_strava: true }).eq("activity_id", a.id);
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
  const mode = process.env.STRAVA_LABEL_WRITE;
  // in "smart" mode with an AI key the cool title and description come with the analysis, which publishes them
  if (mode && (mode !== "smart" || !process.env.ANTHROPIC_API_KEY)) {
    try {
      written = await publishToStrava(a, { label: result.label, title: mode === "smart" ? result.label : undefined });
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
