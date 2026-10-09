import type { Activity } from "@/lib/strava/types";
import { mondayOf } from "./progress";
import type { PlannedWeekRow } from "./types";

const DAY = 86_400_000;
const addDays = (key: string, n: number) => new Date(Date.parse(key + "T00:00:00Z") + n * DAY).toISOString().slice(0, 10);

export type Phase = "base" | "build" | "peak" | "taper" | "race";
export type WeekKind = "load" | "deload" | "taper" | "race" | "past";
export type RaceDistance = "full" | "half" | "short";

export interface BuildWeek {
  /** Monday, YYYY-MM-DD */
  start: string;
  phase: Phase | null;
  kind: WeekKind;
  /** planned ELAPSED hours (null for weeks already finished before the plan) */
  target: number | null;
  /** true when the target comes from the database (training_weeks) instead of the automatic plan */
  custom: boolean;
  title?: string;
  /** ELAPSED hours actually trained */
  actual: number;
  state: "past" | "current" | "future";
}

export interface BuildPlan {
  weeks: BuildWeek[];
  weeksLeft: number;
  baseline: number;
  peak: number;
  taperWeeks: number;
  distance: RaceDistance;
}

/** Long races need a longer taper. */
export function raceDistance(name: string): RaceDistance {
  if (/70\.3|half|meia/i.test(name)) return "half";
  if (/ironman|full|longa/i.test(name)) return "full";
  return "short";
}

/** Share of the peak week's hours for each week before the race week, in order. */
const TAPER: Record<RaceDistance, number[]> = {
  full: [0.8, 0.6, 0.45],
  half: [0.75, 0.55],
  short: [0.7],
};
/** The race week itself (the race is extra, so the training around it is light). */
const RACE_WEEK = 0.4;

/** Elapsed hours trained in each week (key = Monday). */
export function weeklyHours(acts: Activity[]): Map<string, number> {
  const m = new Map<string, number>();
  for (const a of acts) {
    const k = mondayOf(a.date);
    m.set(k, (m.get(k) ?? 0) + a.elapsedTime / 3600);
  }
  return m;
}

/**
 * Automatic build for a race: a 3:1 load/deload rhythm that grows from your recent weekly
 * volume to a peak, then a taper sized for the race distance. Weeks in the `training_weeks`
 * table (your own plan) replace the automatic target of the same week.
 */
export function buildPlan(
  raceName: string,
  raceDate: string,
  hoursByWeek: Map<string, number>,
  todayKey: string,
  planned: PlannedWeekRow[],
): BuildPlan | null {
  const current = mondayOf(todayKey);
  const raceWeek = mondayOf(raceDate);
  if (raceWeek < current) return null;

  const weeksToRace = Math.round((Date.parse(raceWeek) - Date.parse(current)) / (7 * DAY)) + 1; // includes the current and race weeks
  const distance = raceDistance(raceName);

  // baseline: the last 6 finished weeks
  const recent: number[] = [];
  for (let i = 1; i <= 6; i++) recent.push(hoursByWeek.get(addDays(current, -7 * i)) ?? 0);
  const baseline = Math.max(3, recent.reduce((s, h) => s + h, 0) / recent.length);
  const peak = Math.max(baseline, Math.min(baseline * 1.3, baseline + 5));

  const taperWeeks = Math.min(TAPER[distance].length, Math.max(0, weeksToRace - 1));
  const taperFactors = TAPER[distance].slice(TAPER[distance].length - taperWeeks);
  const loadWeeks = Math.max(0, weeksToRace - 1 - taperWeeks);

  // targets of the load/deload weeks
  const isDeload = (i: number) => (i + 1) % 4 === 0 && i !== loadWeeks - 1 && loadWeeks > 3;
  const loadCount = Array.from({ length: loadWeeks }, (_, i) => i).filter((i) => !isDeload(i)).length;
  const targets: number[] = [];
  let k = 0;
  let lastLoad = baseline;
  for (let i = 0; i < loadWeeks; i++) {
    if (isDeload(i)) targets.push(lastLoad * 0.7);
    else {
      lastLoad = baseline + (peak - baseline) * (loadCount > 1 ? k / (loadCount - 1) : 1);
      targets.push(lastLoad);
      k++;
    }
  }

  const planByWeek = new Map(planned.map((p) => [p.weekStart, p]));
  const weeks: BuildWeek[] = [];

  // context: the 4 weeks before the current one, actual only
  for (let i = 4; i >= 1; i--) {
    const start = addDays(current, -7 * i);
    weeks.push({ start, phase: null, kind: "past", target: planByWeek.get(start)?.plannedHours ?? null, custom: planByWeek.has(start), title: planByWeek.get(start)?.title, actual: hoursByWeek.get(start) ?? 0, state: "past" });
  }

  for (let i = 0; i < weeksToRace; i++) {
    const start = addDays(current, 7 * i);
    let phase: Phase;
    let kind: WeekKind;
    let target: number;
    if (i < loadWeeks) {
      phase = i < loadWeeks * 0.4 ? "base" : i < loadWeeks * 0.8 ? "build" : "peak";
      kind = isDeload(i) ? "deload" : "load";
      target = targets[i];
    } else if (i < loadWeeks + taperWeeks) {
      phase = "taper";
      kind = "taper";
      target = peak * taperFactors[i - loadWeeks];
    } else {
      phase = "race";
      kind = "race";
      target = peak * RACE_WEEK;
    }
    const own = planByWeek.get(start);
    weeks.push({
      start,
      phase,
      kind,
      target: own?.plannedHours ?? target,
      custom: own?.plannedHours !== undefined,
      title: own?.title,
      actual: hoursByWeek.get(start) ?? 0,
      state: i === 0 ? "current" : "future",
    });
  }

  return { weeks, weeksLeft: weeksToRace - 1, baseline, peak, taperWeeks, distance };
}
