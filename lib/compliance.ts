import type { Activity } from "@/lib/strava/types";
import type { PlanDay, PlanSlot, PlanSport, PlanStructure, PlanTarget, TargetType } from "@/lib/lab/types";

/**
 * Planned against done. Pure: the planner page and the AI week analysis use the same matching and scores.
 *
 * - Activities are matched to planned entries by date (the activity's local date, America/Sao_Paulo) and sport; with
 *   two entries of a sport on one day, by order (AM, then PM). A manual re-match overrides it.
 * - Planned time is compared with ELAPSED time (plans count total time, pauses included); paces and intensities use
 *   moving time.
 */

export type Color = "green" | "yellow" | "red" | "grey";
export type { TargetType };

/** A lap (or a detected work interval), already summarised. */
export interface Lap {
  elapsedS: number;
  movingS: number;
  distM: number;
  /** m/s */
  speed?: number;
  hr?: number;
  watts?: number;
}

/** Where a manually re-matched activity goes: a planned entry, or "unplanned" (null). */
export type Override = { day: number; slot: number } | null;

export interface MatchedEntry {
  day: number;
  /** index in the day's slots */
  slot: number;
  entry: PlanSlot;
  activity: Activity | null;
}

export interface DayMatch {
  day: number;
  date: string;
  rest: boolean;
  entries: MatchedEntry[];
  /** activities that match no planned entry */
  unplanned: Activity[];
}

const DAY = 86_400_000;
const addDays = (key: string, n: number) => new Date(Date.parse(key + "T00:00:00Z") + n * DAY).toISOString().slice(0, 10);
const used = (s: PlanSlot) => s.description.trim().length > 0 || (s.minutes ?? 0) > 0 || (s.km ?? 0) > 0;

/** Sport of an activity in planner terms (the keys are the same). */
const sportOf = (a: Activity): PlanSport => a.sport as PlanSport;

/** Short activities (a 3-minute walk to the pool) are not sessions. */
const MIN_ACTIVITY_S = 300;

export function matchWeek(days: PlanDay[], weekStart: string, acts: Activity[], overrides: Record<number, Override> = {}): DayMatch[] {
  const weekEnd = addDays(weekStart, 6);
  const inWeek = acts
    .filter((a) => a.date.slice(0, 10) >= weekStart && a.date.slice(0, 10) <= weekEnd && a.elapsedTime >= MIN_ACTIVITY_S)
    .sort((a, b) => (a.date < b.date ? -1 : 1));

  const out: DayMatch[] = days.map((d) => ({
    day: d.day,
    date: addDays(weekStart, d.day),
    rest: !!d.rest,
    entries: d.rest ? [] : d.slots.map((entry, slot) => ({ day: d.day, slot, entry, activity: null })).filter((e) => used(e.entry)),
    unplanned: [],
  }));

  // manual re-matches first
  const taken = new Set<number>();
  for (const a of inWeek) {
    if (!(a.id in overrides)) continue;
    const o = overrides[a.id];
    taken.add(a.id);
    if (o === null) {
      out[dayIndex(a, weekStart)]?.unplanned.push(a);
      continue;
    }
    const e = out[o.day]?.entries.find((x) => x.slot === o.slot);
    if (e && !e.activity) e.activity = a;
    else out[dayIndex(a, weekStart)]?.unplanned.push(a);
  }

  // then by date and sport, in order (AM, then PM)
  for (const d of out) {
    const todays = inWeek.filter((a) => !taken.has(a.id) && a.date.slice(0, 10) === d.date);
    const bySport = new Map<PlanSport, Activity[]>();
    for (const a of todays) bySport.set(sportOf(a), [...(bySport.get(sportOf(a)) ?? []), a]);
    for (const [sport, list] of bySport) {
      const open = d.entries.filter((e) => e.entry.sport === sport && !e.activity);
      list.forEach((a, i) => {
        if (open[i]) open[i].activity = a;
        else d.unplanned.push(a);
      });
    }
  }
  return out;
}

const dayIndex = (a: Activity, weekStart: string) => Math.round((Date.parse(a.date.slice(0, 10)) - Date.parse(weekStart)) / DAY);

/** Duration or distance against the plan: green 80-120%, yellow 50-79% or 121-150%, red otherwise, grey when missed. */
export function ratioColor(planned: number | null | undefined, actual: number | null | undefined): { pct: number | null; color: Color } {
  if (!planned || planned <= 0) return { pct: null, color: actual ? "green" : "grey" };
  if (actual == null || actual <= 0) return { pct: null, color: "grey" };
  const pct = (actual / planned) * 100;
  const color: Color = pct >= 80 && pct <= 120 ? "green" : (pct >= 50 && pct < 80) || (pct > 120 && pct <= 150) ? "yellow" : "red";
  return { pct, color };
}

export interface SessionCompliance {
  duration: { pct: number | null; color: Color };
  distance: { pct: number | null; color: Color };
  /** 0 to 1: green 1, yellow 0.5, red or missed 0 (duration decides; distance only when no time was planned) */
  score: number;
}

export function sessionCompliance(m: MatchedEntry): SessionCompliance {
  const a = m.activity;
  const duration = ratioColor(m.entry.minutes, a ? a.elapsedTime / 60 : null);
  const distance = ratioColor(m.entry.km, a ? a.distance / 1000 : null);
  const decide = m.entry.minutes ? duration.color : m.entry.km ? distance.color : a ? "green" : "grey";
  return { duration, distance, score: decide === "green" ? 1 : decide === "yellow" ? 0.5 : 0 };
}

// ------------------------------------------------------------------ intensity

export type Target = PlanTarget;
export type Structure = PlanStructure;

/** Share of moving time above an HR cap: from 1-second samples when available, otherwise from lap averages. Pass under 10%. */
export function hrCapCompliance(cap: number, src: { samples?: { hr: number; dt: number }[]; laps?: Lap[] }): { pctAbove: number; pass: boolean; from: "streams" | "laps" } | null {
  if (src.samples?.length) {
    const total = src.samples.reduce((s, x) => s + x.dt, 0);
    if (!total) return null;
    const above = src.samples.reduce((s, x) => s + (x.hr > cap ? x.dt : 0), 0);
    const pctAbove = (above / total) * 100;
    return { pctAbove, pass: pctAbove < 10, from: "streams" };
  }
  const laps = (src.laps ?? []).filter((l) => l.hr && l.movingS > 0);
  const total = laps.reduce((s, l) => s + l.movingS, 0);
  if (!total) return null;
  const pctAbove = (laps.reduce((s, l) => s + (l.hr! > cap ? l.movingS : 0), 0) / total) * 100;
  return { pctAbove, pass: pctAbove < 10, from: "laps" };
}

/** Pace of a lap in s/km (moving time). */
export const lapPace = (l: Lap) => (l.distM > 0 ? (l.movingS / l.distM) * 1000 : null);

export interface RepResult {
  n: number;
  value: number | null;
  /** inside the range, within 2% of it, or outside */
  verdict: "in" | "near" | "out";
  /** for pace: negative = faster than the range; for power: positive = above */
  offPct: number;
  durationS: number;
  distM: number;
  hr?: number;
}

/**
 * The work reps of a session, from its laps: the laps that look like work (closest to the planned rep length, the
 * hardest ones), in time order. When the plan has no structure, every lap of at least 1 minute counts.
 */
export function workReps(laps: Lap[], s: Structure | undefined, kind: "pace" | "power"): Lap[] {
  const intensity = (l: Lap) => (kind === "power" ? (l.watts ?? 0) : l.speed ?? (l.distM / Math.max(1, l.movingS)));
  let candidates = laps.map((l, i) => ({ l, i })).filter(({ l }) => l.movingS >= 30);
  if (s?.repSeconds) candidates = candidates.filter(({ l }) => Math.abs(l.movingS - s.repSeconds!) <= s.repSeconds! * 0.4);
  else if (s?.repMeters) candidates = candidates.filter(({ l }) => Math.abs(l.distM - s.repMeters!) <= s.repMeters! * 0.25);
  else if (!s?.reps) candidates = candidates.filter(({ l }) => l.movingS >= 60);
  if (s?.reps && candidates.length > s.reps) {
    candidates = [...candidates].sort((a, b) => intensity(b.l) - intensity(a.l)).slice(0, s.reps);
  }
  return candidates.sort((a, b) => a.i - b.i).map(({ l }) => l);
}

/**
 * Each rep against a pace or power range. Passes when most reps are inside the range or within 2% of it.
 * The first rep is reported apart (it is often too fast).
 */
export function rangeCompliance(reps: Lap[], target: Target): { reps: RepResult[]; first: RepResult | null; pass: boolean; inOrNear: number } | null {
  if (!reps.length || (target.type !== "pace-range" && target.type !== "power-range" && target.type !== "hr-range")) return null;
  const lo = target.min ?? -Infinity;
  const hi = target.max ?? Infinity;
  const results: RepResult[] = reps.map((l, i) => {
    const value = target.type === "pace-range" ? lapPace(l) : target.type === "power-range" ? (l.watts ?? null) : (l.hr ?? null);
    let verdict: RepResult["verdict"] = "out";
    let offPct = 0;
    if (value != null) {
      if (value >= lo && value <= hi) verdict = "in";
      else {
        const edge = value < lo ? lo : hi;
        offPct = ((value - edge) / edge) * 100;
        verdict = Math.abs(offPct) <= 2 ? "near" : "out";
      }
    }
    return { n: i + 1, value, verdict, offPct, durationS: l.movingS, distM: l.distM, hr: l.hr };
  });
  const inOrNear = results.filter((r) => r.verdict !== "out").length;
  return { reps: results, first: results[0] ?? null, pass: inOrNear > results.length / 2, inOrNear };
}

// ------------------------------------------------------------------ week

export interface SportSum {
  plannedH: number;
  doneH: number;
  plannedKm: number;
  doneKm: number;
}

export interface WeekCompliance {
  bySport: Record<string, SportSum>;
  planned: number;
  done: number;
  missed: number;
  unplanned: number;
  unplannedOnRest: number;
  keyPlanned: number;
  keyDone: number;
  /** 0 to 100: mean of the session scores, missed sessions count 0 */
  score: number | null;
}

/** Summary of a week (only days up to `untilDate` count, so a week in progress is not marked as missed ahead of time). */
export function weekCompliance(days: DayMatch[], untilDate: string): WeekCompliance {
  const bySport: Record<string, SportSum> = {};
  const sum = (sport: string) => (bySport[sport] ??= { plannedH: 0, doneH: 0, plannedKm: 0, doneKm: 0 });
  let planned = 0;
  let done = 0;
  let missed = 0;
  let unplanned = 0;
  let unplannedOnRest = 0;
  let keyPlanned = 0;
  let keyDone = 0;
  let scoreSum = 0;
  for (const d of days) {
    if (d.date > untilDate) continue;
    for (const e of d.entries) {
      const s = sum(e.entry.sport);
      s.plannedH += (e.entry.minutes ?? 0) / 60;
      s.plannedKm += e.entry.km ?? 0;
      planned++;
      if (e.entry.key) keyPlanned++;
      if (e.activity) {
        done++;
        if (e.entry.key) keyDone++;
        s.doneH += e.activity.elapsedTime / 3600;
        s.doneKm += e.activity.distance / 1000;
      } else missed++;
      scoreSum += sessionCompliance(e).score;
    }
    for (const a of d.unplanned) {
      const s = sum(a.sport);
      s.doneH += a.elapsedTime / 3600;
      s.doneKm += a.distance / 1000;
      unplanned++;
      if (d.rest) unplannedOnRest++;
    }
  }
  return { bySport, planned, done, missed, unplanned, unplannedOnRest, keyPlanned, keyDone, score: planned ? Math.round((scoreSum / planned) * 100) : null };
}
