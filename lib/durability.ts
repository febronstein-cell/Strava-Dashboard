import type { Activity } from "@/lib/strava/types";
import type { Streams } from "@/lib/zones";

/**
 * Durability: holding pace and power when tired. Computed once from the streams (pure) and stored with the zones.
 *
 * - Aerobic decoupling (runs of 45 min or more, rides of 60 min or more, first 10 minutes left out): efficiency
 *   (speed / HR for runs, power / HR for rides) of the first half against the second half. Under 5% good,
 *   5 to 8% watch, over 8% poor. Interval sessions are read on their steady samples only (within 12% of the
 *   median); with too few of them there is no number.
 * - Second-half fade: pace (runs) or average power (rides), first half against second half of the distance/time.
 * - First km (runs of 5 km or more): km 1 against the average of km 2 to 5; more than 3% faster = "started too fast".
 * - Fatigue resistance (rides): best 20-minute power after 1,500 kJ and after 2,500 kJ of work, and the best of the
 *   whole ride (the "fresh" reference is the best 20 minutes of the last 90 days, worked out where it is shown).
 */

export interface Durability {
  /** % drop in efficiency from the first to the second half (positive = worse) */
  decoupling?: number;
  /** "steady" = whole session, "steady-parts" = only its steady samples (an interval session) */
  decouplingBasis?: "steady" | "steady-parts";
  /** % slower (runs) or % less power (rides) in the second half */
  fade?: number;
  /** runs: pace of km 1 and of km 2-5, s/km, and how much faster km 1 was (%, positive = faster) */
  firstKm?: { km1: number; km2to5: number; fasterPct: number };
  /** rides: best 20-minute average power, overall and after 1,500 / 2,500 kJ of work */
  best20?: number;
  best20After1500?: number;
  best20After2500?: number;
  /** total work, kJ */
  kj?: number;
}

const WARMUP_S = 600;
const median = (xs: number[]) => {
  const s = [...xs].sort((a, b) => a - b);
  return s.length ? s[Math.floor(s.length / 2)] : 0;
};

/** One value per second (forward-filled over short gaps, zero over pauses), plus the moving flag. */
function perSecond(time: number[], values: (number | undefined)[] | undefined, moving?: boolean[]) {
  const T = time.length ? time[time.length - 1] : 0;
  const v = new Array<number>(T + 1).fill(0);
  const m = new Array<boolean>(T + 1).fill(false);
  for (let i = 1; i < time.length; i++) {
    const dt = time[i] - time[i - 1];
    if (!(dt > 0 && dt <= 30)) continue;
    const mv = moving ? !!moving[i] : true;
    for (let t = time[i - 1] + 1; t <= time[i]; t++) {
      v[t] = values?.[i] ?? 0;
      m[t] = mv;
    }
  }
  return { v, m };
}

function bestAverage(p: number[], from: number, window: number): number | undefined {
  if (p.length - from < window) return undefined;
  let sum = 0;
  for (let t = from; t < from + window; t++) sum += p[t];
  let best = sum;
  for (let t = from + window; t < p.length; t++) {
    sum += p[t] - p[t - window];
    if (sum > best) best = sum;
  }
  return best / window;
}

export function durabilityOf(s: Streams, a: Pick<Activity, "sport" | "movingTime" | "distance">): Durability | undefined {
  const time = s.time ?? [];
  if (time.length < 60 || (a.sport !== "run" && a.sport !== "ride")) return undefined;
  const out: Durability = {};

  // ---- decoupling, on moving samples after the first 10 minutes
  const long = a.sport === "run" ? a.movingTime >= 45 * 60 : a.movingTime >= 60 * 60;
  const effSamples: { t: number; out: number; hr: number }[] = [];
  for (let i = 1; i < time.length; i++) {
    if (time[i] < WARMUP_S || (s.moving && !s.moving[i])) continue;
    const hr = s.heartrate?.[i];
    const o = a.sport === "run" ? s.velocity_smooth?.[i] : s.watts?.[i];
    if (hr && hr > 60 && o != null && o > 0) effSamples.push({ t: time[i], out: o, hr });
  }
  if (long && effSamples.length > 600) {
    const med = median(effSamples.map((x) => x.out));
    const steady = effSamples.filter((x) => Math.abs(x.out - med) <= med * 0.12);
    const variable = steady.length < effSamples.length * 0.75;
    const use = variable ? steady : effSamples;
    if (use.length >= effSamples.length * 0.4 && use.length > 600) {
      const half = Math.floor(use.length / 2);
      const ef = (xs: typeof use) => xs.reduce((sum, x) => sum + x.out, 0) / xs.reduce((sum, x) => sum + x.hr, 0);
      const e1 = ef(use.slice(0, half));
      const e2 = ef(use.slice(half));
      out.decoupling = ((e1 - e2) / e1) * 100;
      out.decouplingBasis = variable ? "steady-parts" : "steady";
    }
  }

  // ---- second-half fade
  if (a.sport === "run" && s.distance?.length === time.length) {
    const total = s.distance[s.distance.length - 1];
    const i = s.distance.findIndex((d) => d >= total / 2);
    if (total > 3000 && i > 0) {
      const t1 = movingBetween(time, s.moving, 0, i);
      const t2 = movingBetween(time, s.moving, i, time.length - 1);
      const p1 = t1 / (s.distance[i] / 1000);
      const p2 = t2 / ((total - s.distance[i]) / 1000);
      if (p1 > 0 && p2 > 0) out.fade = ((p2 - p1) / p1) * 100;
    }
  } else if (a.sport === "ride" && s.watts?.length) {
    const { v, m } = perSecond(time, s.watts, s.moving);
    const moving = v.filter((_, t) => m[t]);
    if (moving.length > 1200) {
      const half = Math.floor(moving.length / 2);
      const avg = (xs: number[]) => xs.reduce((x, y) => x + y, 0) / xs.length;
      const p1 = avg(moving.slice(0, half));
      const p2 = avg(moving.slice(half));
      if (p1 > 0) out.fade = ((p1 - p2) / p1) * 100;
    }
  }

  // ---- first km against km 2-5
  if (a.sport === "run" && s.distance?.length === time.length && (s.distance[s.distance.length - 1] ?? 0) >= 5000) {
    const at = (d: number) => s.distance!.findIndex((x) => x >= d);
    const idx = [0, at(1000), at(2000), at(3000), at(4000), at(5000)];
    if (idx.every((x) => x >= 0)) {
      const km1 = movingBetween(time, s.moving, idx[0], idx[1]);
      const rest = movingBetween(time, s.moving, idx[1], idx[5]) / 4;
      if (km1 > 0 && rest > 0) out.firstKm = { km1, km2to5: rest, fasterPct: ((rest - km1) / rest) * 100 };
    }
  }

  // ---- fatigue resistance: best 20 minutes after 1,500 and 2,500 kJ
  if (a.sport === "ride" && s.watts?.length) {
    const { v } = perSecond(time, s.watts);
    let kj = 0;
    let at1500: number | undefined;
    let at2500: number | undefined;
    for (let t = 0; t < v.length; t++) {
      kj += v[t] / 1000;
      if (at1500 === undefined && kj >= 1500) at1500 = t;
      if (at2500 === undefined && kj >= 2500) at2500 = t;
    }
    out.kj = Math.round(kj);
    out.best20 = bestAverage(v, 0, 1200);
    if (at1500 !== undefined) out.best20After1500 = bestAverage(v, at1500, 1200);
    if (at2500 !== undefined) out.best20After2500 = bestAverage(v, at2500, 1200);
  }

  return Object.keys(out).length ? out : undefined;
}

/** Moving seconds between two sample indexes. */
function movingBetween(time: number[], moving: boolean[] | undefined, from: number, to: number): number {
  let s = 0;
  for (let i = Math.max(1, from + 1); i <= to; i++) {
    const dt = time[i] - time[i - 1];
    if (dt > 0 && dt <= 30 && (!moving || moving[i])) s += dt;
  }
  return s;
}

export type DriftBand = "good" | "watch" | "poor";
export const driftBand = (d: number): DriftBand => (d < 5 ? "good" : d <= 8 ? "watch" : "poor");

/** A run that starts within 20 minutes of the end of a ride: a brick. */
export function isBrick(run: Pick<Activity, "date" | "sport">, all: Pick<Activity, "date" | "sport" | "elapsedTime">[]): boolean {
  if (run.sport !== "run") return false;
  const start = Date.parse(run.date + "Z");
  return all.some((r) => {
    if (r.sport !== "ride") return false;
    const end = Date.parse(r.date + "Z") + r.elapsedTime * 1000;
    return start >= end - 60_000 && start - end <= 20 * 60_000;
  });
}
