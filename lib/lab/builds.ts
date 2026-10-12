import type { Activity } from "@/lib/strava/types";
import { K_ATL, K_CTL, type LoadDay } from "./load";
import { mondayOf } from "./progress";
import type { PlannedWeekRow } from "./types";

const DAY = 86_400_000;
const addDays = (key: string, n: number) => new Date(Date.parse(key + "T00:00:00Z") + n * DAY).toISOString().slice(0, 10);

export type Phase = "base" | "build" | "peak" | "taper" | "race";
export type WeekKind = "load" | "deload" | "taper" | "race" | "maintain" | "context";
export type RaceDistance = "full" | "half" | "short";

export interface BuildWeek {
  /** Monday, YYYY-MM-DD */
  start: string;
  phase: Phase | null;
  kind: WeekKind;
  /** planned ELAPSED hours (null for context weeks before the plan) */
  target: number | null;
  /** true when the target comes from the database (training_weeks) instead of the automatic plan */
  custom: boolean;
  title?: string;
  /** ELAPSED hours actually trained */
  actual: number;
  state: "past" | "current" | "future";
  /** false for the 4 context weeks shown before a cycle that has not started yet */
  inCycle: boolean;
}

export interface BuildPlan {
  weeks: BuildWeek[];
  weeksLeft: number;
  baseline: number;
  peak: number;
  taperWeeks: number;
  distance: RaceDistance;
  /** length of the preparation cycle in weeks and the Monday it starts */
  cycleWeeks: number;
  cycleStart: string;
  cycleStarted: boolean;
  /** true when the last 4 weeks are clearly above the 8 before (the cycle is then shortened) */
  volumeRising: boolean;
  /** true when the cycle start was fixed by hand (cycleStart in site.config.ts) instead of computed */
  cycleFixed: boolean;
  /** true when "baseline" is the average of the cycle weeks already done (the cycle is running) */
  baselineIsCycleAverage: boolean;
}

/** Long races need a longer taper. */
export function raceDistance(name: string): RaceDistance {
  if (/70\.3|half|meia/i.test(name)) return "half";
  if (/ironman|full|longa/i.test(name)) return "full";
  return "short";
}

/**
 * Length of the preparation cycle in weeks. The usual cycle is 12 weeks for a 70.3 and 16 for a
 * full Ironman; when volume is already rising the base work is partly done, so the cycle is shorter.
 */
const CYCLE: Record<RaceDistance, { normal: number; rising: number }> = {
  full: { normal: 16, rising: 12 },
  half: { normal: 12, rising: 8 },
  short: { normal: 8, rising: 6 },
};

/** Share of the peak week's hours for each week before the race week, in order. */
const TAPER: Record<RaceDistance, number[]> = {
  full: [0.8, 0.6, 0.45],
  half: [0.75, 0.55],
  short: [0.7],
};
/** The race week itself (the race is extra, so the training around it is light). */
const RACE_WEEK = 0.4;
/** The last 4 weeks must be at least this much above the 8 before to count as "rising". */
const RISING = 1.15;

/** Elapsed hours trained in each week (key = Monday). */
export function weeklyHours(acts: Activity[]): Map<string, number> {
  const m = new Map<string, number>();
  for (const a of acts) {
    const k = mondayOf(a.date);
    m.set(k, (m.get(k) ?? 0) + a.elapsedTime / 3600);
  }
  return m;
}

/** Mean weekly hours of `n` weeks ending the week before `before` (Monday key). */
function meanBefore(hours: Map<string, number>, before: string, n: number, skip = 0): number {
  let s = 0;
  for (let i = 1 + skip; i <= n + skip; i++) s += hours.get(addDays(before, -7 * i)) ?? 0;
  return s / n;
}

/**
 * Automatic build for a race, inside a preparation cycle (12 weeks for a 70.3, 16 for a full
 * Ironman, shorter when volume is already rising): a 3:1 load/recovery rhythm that grows from the
 * level before the cycle to a peak, then a taper sized for the distance. Weeks you add to the
 * `training_weeks` table replace the automatic target of the same week.
 */
export function buildPlan(
  raceName: string,
  raceDate: string,
  hoursByWeek: Map<string, number>,
  todayKey: string,
  planned: PlannedWeekRow[],
  /** Monday (or any day of the week) when the volume increase of this cycle began; overrides the automatic cycle length */
  cycleStartOverride?: string,
): BuildPlan | null {
  const current = mondayOf(todayKey);
  const raceWeek = mondayOf(raceDate);
  if (raceWeek < current) return null;

  const weeksToRace = Math.round((Date.parse(raceWeek) - Date.parse(current)) / (7 * DAY)) + 1; // includes the current and race weeks
  const distance = raceDistance(raceName);

  // is volume already rising? (last 4 finished weeks against the 8 before them)
  const last4 = meanBefore(hoursByWeek, current, 4);
  const prev8 = meanBefore(hoursByWeek, current, 8, 4);
  const volumeRising = prev8 > 0 && last4 >= prev8 * RISING && last4 >= 5;

  const fixed = cycleStartOverride ? mondayOf(cycleStartOverride) : null;
  const cycleFixed = fixed !== null && fixed <= raceWeek;
  const cycleWeeks = cycleFixed
    ? Math.round((Date.parse(raceWeek) - Date.parse(fixed as string)) / (7 * DAY)) + 1
    : volumeRising
      ? CYCLE[distance].rising
      : CYCLE[distance].normal;
  const cycleStart = cycleFixed ? (fixed as string) : addDays(raceWeek, -7 * (cycleWeeks - 1));
  const cycleStarted = cycleStart <= current;

  // level the cycle starts from: the 6 weeks before it (or before today, if it has not started)
  let baseline = meanBefore(hoursByWeek, cycleStarted ? cycleStart : current, 6);
  if (!cycleStarted && volumeRising) baseline = Math.max(baseline, last4);
  baseline = Math.max(3, baseline);
  let peak = Math.max(baseline, Math.min(baseline * 1.3, baseline + 5));
  // a cycle that is already running is anchored to what was really trained lately
  if (cycleStarted) peak = Math.max(peak, last4);

  // ... and, with at least 3 finished weeks, to the cycle itself: average of those weeks and the best 3-week stretch
  let baselineIsCycleAverage = false;
  if (cycleStarted) {
    const done: number[] = [];
    for (let s = cycleStart; s < current; s = addDays(s, 7)) done.push(hoursByWeek.get(s) ?? 0);
    if (done.length >= 3) {
      baseline = Math.max(3, done.reduce((x, y) => x + y, 0) / done.length);
      let best3 = 0;
      for (let i = 0; i + 3 <= done.length; i++) best3 = Math.max(best3, (done[i] + done[i + 1] + done[i + 2]) / 3);
      peak = Math.max(baseline, best3, last4);
      baselineIsCycleAverage = true;
    }
  }

  const taperWeeks = Math.min(TAPER[distance].length, cycleWeeks - 1);
  const taperFactors = TAPER[distance].slice(TAPER[distance].length - taperWeeks);
  const loadWeeks = cycleWeeks - 1 - taperWeeks;

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
  const baseShare = volumeRising ? 0.3 : 0.4;

  const planByWeek = new Map(planned.map((p) => [p.weekStart, p]));
  const stateOf = (start: string): BuildWeek["state"] => (start < current ? "past" : start === current ? "current" : "future");
  const weeks: BuildWeek[] = [];

  const push = (w: Omit<BuildWeek, "custom" | "title" | "actual" | "state"> & { target: number | null }) => {
    const own = planByWeek.get(w.start);
    // weeks already finished before today show only what was done (no invented plan), unless you saved one
    const pastWeek = w.start < current;
    weeks.push({
      ...w,
      target: own?.plannedHours ?? (pastWeek ? null : w.target),
      custom: own?.plannedHours !== undefined,
      title: own?.title,
      actual: hoursByWeek.get(w.start) ?? 0,
      state: stateOf(w.start),
    });
  };

  if (!cycleStarted) {
    // the 4 weeks before today, for context, then maintenance until the cycle starts
    for (let i = 4; i >= 1; i--) push({ start: addDays(current, -7 * i), phase: null, kind: "context", target: null, inCycle: false });
    for (let s = current; s < cycleStart; s = addDays(s, 7)) push({ start: s, phase: null, kind: "maintain", target: baseline, inCycle: false });
  }

  for (let i = 0; i < cycleWeeks; i++) {
    const start = addDays(cycleStart, 7 * i);
    if (i < loadWeeks) {
      push({
        start,
        phase: i < loadWeeks * baseShare ? "base" : i < loadWeeks * 0.8 ? "build" : "peak",
        kind: isDeload(i) ? "deload" : "load",
        target: targets[i],
        inCycle: true,
      });
    } else if (i < loadWeeks + taperWeeks) {
      push({ start, phase: "taper", kind: "taper", target: peak * taperFactors[i - loadWeeks], inCycle: true });
    } else {
      push({ start, phase: "race", kind: "race", target: peak * RACE_WEEK, inCycle: true });
    }
  }

  return { weeks, weeksLeft: weeksToRace - 1, baseline, peak, taperWeeks, distance, cycleWeeks, cycleStart, cycleStarted, volumeRising, cycleFixed, baselineIsCycleAverage };
}

/** Points of load per elapsed hour over the last 8 finished weeks (used to turn planned hours into load). */
export function tssPerHour(series: LoadDay[], hoursByWeek: Map<string, number>, todayKey: string): number {
  const current = mondayOf(todayKey);
  const from = addDays(current, -56);
  let tss = 0;
  for (const d of series) if (d.date >= from && d.date < current) tss += d.tss;
  let hours = 0;
  for (let i = 1; i <= 8; i++) hours += hoursByWeek.get(addDays(current, -7 * i)) ?? 0;
  return hours > 5 && tss > 0 ? tss / hours : 55;
}

export interface RaceForecast {
  ctl: number;
  atl: number;
  /** form on the morning of the race, before the race itself */
  tsb: number;
}

/**
 * Projects fitness, fatigue and form to the morning of the race by following the planned weekly
 * hours day by day (same 42/7-day model as the Form & Load tab). The remaining days of the current
 * week share what is still missing from its target.
 */
export function forecastRaceDay(plan: BuildPlan, series: LoadDay[], perHour: number, todayKey: string, raceDate: string): RaceForecast | null {
  const last = series[series.length - 1];
  if (!last) return null;
  let ctl = last.ctl;
  let atl = last.atl;
  const byWeek = new Map(plan.weeks.map((w) => [w.start, w]));
  const current = mondayOf(todayKey);
  const todayIdx = (new Date(todayKey + "T00:00:00Z").getUTCDay() + 6) % 7;
  for (let t = Date.parse(todayKey + "T00:00:00Z") + DAY; t <= Date.parse(raceDate + "T00:00:00Z"); t += DAY) {
    const key = new Date(t).toISOString().slice(0, 10);
    if (key === raceDate) break;
    const w = byWeek.get(mondayOf(key));
    let hours = (w?.target ?? plan.baseline) / 7;
    if (w && w.start === current) {
      const remaining = 6 - todayIdx;
      hours = remaining > 0 ? Math.max(0, (w.target ?? 0) - w.actual) / remaining : 0;
    }
    const load = hours * perHour;
    ctl += (load - ctl) * K_CTL;
    atl += (load - atl) * K_ATL;
  }
  return { ctl, atl, tsb: ctl - atl };
}
