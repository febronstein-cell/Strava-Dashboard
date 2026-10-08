import { ALL_SPORTS, siteConfig, TRI_SPORTS, type SportKey } from "@/site.config";
import type { Activity } from "./strava/types";

export { ALL_SPORTS, TRI_SPORTS };

/**
 * Time conventions used across the site:
 *  - VOLUME and TOTALS (weekly/monthly/annual hours, totals, heatmap) use ELAPSED time.
 *  - PACE, SPEED, HEART RATE, CADENCE and the single-activity view use MOVING time.
 */

/** A specific year, the whole history, the last 12 weeks, or a custom date range. */
export type Period = number | "all" | "12w" | { from: string; to: string };

export interface Range {
  kind: "year" | "all" | "12w" | "custom";
  /** YYYY-MM-DD, inclusive */
  from: string;
  to: string;
  year?: number;
}

const zero = (): Record<SportKey, number> => ({ run: 0, ride: 0, swim: 0, strength: 0, other: 0 });
const dayMs = 86_400_000;
const parse = (iso: string) => new Date(iso.slice(0, 10) + "T00:00:00Z");
const isoDay = (d: Date) => d.toISOString().slice(0, 10);

/** Monday of the week of `d` (UTC). */
function weekStart(d: Date): Date {
  const dow = (d.getUTCDay() + 6) % 7; // Mon = 0
  return new Date(d.getTime() - dow * dayMs);
}

/** Turns a Period into concrete dates. `today` is the moment of the last sync. */
export function resolveRange(period: Period, firstYear: number, today: Date): Range {
  const todayKey = isoDay(today);
  if (typeof period === "number") return { kind: "year", from: `${period}-01-01`, to: `${period}-12-31`, year: period };
  if (period === "all") return { kind: "all", from: `${firstYear}-01-01`, to: todayKey };
  if (period === "12w") {
    return { kind: "12w", from: isoDay(new Date(weekStart(today).getTime() - 11 * 7 * dayMs)), to: todayKey };
  }
  const [from, to] = period.from <= period.to ? [period.from, period.to] : [period.to, period.from];
  return { kind: "custom", from, to };
}

export function inRange(acts: Activity[], r: Range): Activity[] {
  return acts.filter((a) => {
    const d = a.date.slice(0, 10);
    return d >= r.from && d <= r.to;
  });
}

// ---------------------------------------------------------------- totals

export interface Totals {
  /** meters; only swim/bike/run count */
  distance: number;
  /** seconds of movement (used for averages) */
  movingTime: number;
  /** seconds from start to finish (used for totals and volume) */
  elapsedTime: number;
  /** meters; only swim/bike/run count */
  elevation: number;
  count: number;
}

export function totals(acts: Activity[]): Totals {
  return acts.reduce<Totals>(
    (t, a) => {
      const tri = TRI_SPORTS.includes(a.sport);
      return {
        distance: t.distance + (tri ? a.distance : 0),
        movingTime: t.movingTime + a.movingTime,
        elapsedTime: t.elapsedTime + a.elapsedTime,
        elevation: t.elevation + (tri ? a.elevation : 0),
        count: t.count + 1,
      };
    },
    { distance: 0, movingTime: 0, elapsedTime: 0, elevation: 0, count: 0 },
  );
}

export interface SportStats extends Totals {
  sport: SportKey;
  /** average speed in m/s = distance / MOVING time */
  avgSpeed: number;
  /** the activity with the most moving time */
  longest: Activity | null;
}

export function sportStats(acts: Activity[], sport: SportKey): SportStats {
  const mine = acts.filter((a) => a.sport === sport);
  const t = totals(mine);
  const distance = mine.reduce((s, a) => s + a.distance, 0);
  const longest = mine.reduce<Activity | null>((best, a) => (!best || a.movingTime > best.movingTime ? a : best), null);
  return {
    sport,
    ...t,
    distance: TRI_SPORTS.includes(sport) ? distance : 0,
    avgSpeed: t.movingTime ? distance / t.movingTime : 0,
    longest,
  };
}

// ---------------------------------------------------------------- volume

export interface VolumePoint {
  key: string;
  /** ELAPSED seconds per sport */
  secs: Record<SportKey, number>;
  /** meters per sport */
  dist: Record<SportKey, number>;
  /** number of sessions per sport */
  count: Record<SportKey, number>;
}

const emptyPoint = (key: string): VolumePoint => ({ key, secs: zero(), dist: zero(), count: zero() });

function addTo(p: VolumePoint, a: Activity) {
  p.secs[a.sport] += a.elapsedTime;
  p.dist[a.sport] += a.distance;
  p.count[a.sport] += 1;
}

export const pointSeconds = (p: VolumePoint) => ALL_SPORTS.reduce((s, k) => s + p.secs[k], 0);
export const pointCount = (p: VolumePoint) => ALL_SPORTS.reduce((s, k) => s + p.count[k], 0);

/** Weeks (Mon–Sun) of a range. key = the Monday (YYYY-MM-DD). Always includes every sport. */
export function weeklyVolume(acts: Activity[], r: Range): VolumePoint[] {
  const points = new Map<string, VolumePoint>();
  const last = parse(r.to);
  for (let w = weekStart(parse(r.from)); w <= last; w = new Date(w.getTime() + 7 * dayMs)) {
    points.set(isoDay(w), emptyPoint(isoDay(w)));
  }
  for (const a of acts) {
    const d = a.date.slice(0, 10);
    if (d < r.from || d > r.to) continue;
    const p = points.get(isoDay(weekStart(parse(a.date))));
    if (p) addTo(p, a);
  }
  return [...points.values()];
}

/** Months of a range. key = YYYY-MM. */
export function monthlyVolume(acts: Activity[], r: Range): VolumePoint[] {
  const keys: string[] = [];
  const [fy, fm] = r.from.split("-").map(Number);
  const [ty, tm] = r.to.split("-").map(Number);
  for (let y = fy, m = fm; y < ty || (y === ty && m <= tm); ) {
    keys.push(`${y}-${String(m).padStart(2, "0")}`);
    if (m === 12) {
      y++;
      m = 1;
    } else m++;
  }
  const map = new Map(keys.map((k) => [k, emptyPoint(k)]));
  for (const a of acts) {
    const d = a.date.slice(0, 10);
    if (d < r.from || d > r.to) continue;
    const p = map.get(a.date.slice(0, 7));
    if (p) addTo(p, a);
  }
  return [...map.values()];
}

// --------------------------------------------------------------- heatmap

export interface HeatDay {
  date: string; // YYYY-MM-DD
  /** ELAPSED seconds trained that day */
  seconds: number;
  activities: Activity[];
  /** sport with the most elapsed time that day */
  dominant: SportKey | null;
  future: boolean;
  /** column (week) and row (0 = Monday) */
  col: number;
  row: number;
}

/** Days between `startKey` and `endKey` (inclusive), laid out in weeks. */
export function heatmapDays(acts: Activity[], startKey: string, endKey: string, todayKey: string): HeatDay[] {
  const byDay = new Map<string, Activity[]>();
  for (const a of acts) {
    const k = a.date.slice(0, 10);
    if (k < startKey || k > endKey) continue;
    const arr = byDay.get(k);
    if (arr) arr.push(a);
    else byDay.set(k, [a]);
  }

  const start = new Date(startKey + "T00:00:00Z");
  const end = new Date(endKey + "T00:00:00Z");
  const gridStart = weekStart(start);
  const days: HeatDay[] = [];

  for (let d = new Date(start); d <= end; d = new Date(d.getTime() + dayMs)) {
    const key = isoDay(d);
    const list = byDay.get(key) ?? [];
    const secs = zero();
    for (const a of list) secs[a.sport] += a.elapsedTime;
    const seconds = ALL_SPORTS.reduce((s, k) => s + secs[k], 0);
    const dominant =
      seconds > 0 ? ALL_SPORTS.reduce<SportKey>((best, s) => (secs[s] > secs[best] ? s : best), "run") : null;
    const offset = Math.round((d.getTime() - gridStart.getTime()) / dayMs);
    days.push({
      date: key,
      seconds,
      activities: list,
      dominant,
      future: key > todayKey,
      col: Math.floor(offset / 7),
      row: offset % 7,
    });
  }
  return days;
}

export function streaks(days: HeatDay[]) {
  let longest = 0;
  let run = 0;
  let activeDays = 0;
  const past = days.filter((d) => !d.future);
  for (const d of past) {
    if (d.seconds > 0) {
      activeDays++;
      run++;
      longest = Math.max(longest, run);
    } else run = 0;
  }
  // current streak: walk backwards, tolerating "no workout yet today"
  let current = 0;
  for (let i = past.length - 1; i >= 0; i--) {
    if (past[i].seconds > 0) current++;
    else if (i === past.length - 1) continue;
    else break;
  }
  return { longest, current, activeDays, totalDays: past.length, restDays: past.length - activeDays };
}

// ------------------------------------------------------- extra statistics

export interface YearTotals {
  year: number;
  dist: Record<SportKey, number>;
  /** ELAPSED seconds */
  secs: Record<SportKey, number>;
  count: number;
}

export function annualTotals(acts: Activity[], firstYear: number, lastYear: number): YearTotals[] {
  const list: YearTotals[] = [];
  for (let y = firstYear; y <= lastYear; y++) list.push({ year: y, dist: zero(), secs: zero(), count: 0 });
  for (const a of acts) {
    const t = list[Number(a.date.slice(0, 4)) - firstYear];
    if (!t) continue;
    t.dist[a.sport] += a.distance;
    t.secs[a.sport] += a.elapsedTime;
    t.count++;
  }
  return list;
}

/** Number of activities per hour of the day (0–23). */
export function hourHistogram(acts: Activity[]): number[] {
  const h = Array<number>(24).fill(0);
  for (const a of acts) h[Number(a.date.slice(11, 13))]++;
  return h;
}

/** Average distance (m) per weekday (Mon…Sun), per week of the period. */
export function weekdayAverages(acts: Activity[]): number[] {
  if (acts.length === 0) return Array<number>(7).fill(0);
  const sums = Array<number>(7).fill(0);
  let min = Infinity;
  let max = -Infinity;
  for (const a of acts) {
    const d = parse(a.date);
    sums[(d.getUTCDay() + 6) % 7] += a.distance;
    min = Math.min(min, d.getTime());
    max = Math.max(max, d.getTime());
  }
  const weeks = Math.max(1, Math.round((max - min) / (7 * dayMs)) + 1);
  return sums.map((s) => s / weeks);
}

// ---------------------------------------------------------------- records

export function bestPace(acts: Activity[], sport: SportKey): Activity | null {
  const min = siteConfig.rules.minDistanceForBestPace[sport];
  return acts
    .filter((a) => a.sport === sport && a.distance >= min && a.movingTime > 0)
    .reduce<Activity | null>(
      (best, a) => (!best || a.distance / a.movingTime > best.distance / best.movingTime ? a : best),
      null,
    );
}

export function maxBy(acts: Activity[], pick: (a: Activity) => number, sport?: SportKey): Activity | null {
  return acts
    .filter((a) => !sport || a.sport === sport)
    .reduce<Activity | null>((best, a) => (!best || pick(a) > pick(best) ? a : best), null);
}

/** Heaviest point of a series (by elapsed time). */
export function peak(points: VolumePoint[]): { point: VolumePoint; seconds: number } | null {
  let best: { point: VolumePoint; seconds: number } | null = null;
  for (const p of points) {
    const seconds = pointSeconds(p);
    if (!best || seconds > best.seconds) best = { point: p, seconds };
  }
  return best && best.seconds > 0 ? best : null;
}

// ------------------------------------------- distributions and heart rate

/** Distance bands (km) for the distribution chart. */
const BINS: Record<SportKey, { label: string; max: number }[]> = {
  run: [
    { label: "< 5 km", max: 5 },
    { label: "5–10 km", max: 10 },
    { label: "10–15 km", max: 15 },
    { label: "15–21 km", max: 21.1 },
    { label: "21–30 km", max: 30 },
    { label: "30–42 km", max: 42.2 },
    { label: "42+ km", max: Infinity },
  ],
  ride: [
    { label: "< 20 km", max: 20 },
    { label: "20–40 km", max: 40 },
    { label: "40–60 km", max: 60 },
    { label: "60–90 km", max: 90 },
    { label: "90–120 km", max: 120 },
    { label: "120–160 km", max: 160 },
    { label: "160+ km", max: Infinity },
  ],
  swim: [
    { label: "< 1 km", max: 1 },
    { label: "1–1.5 km", max: 1.5 },
    { label: "1.5–2 km", max: 2 },
    { label: "2–3 km", max: 3 },
    { label: "3–4 km", max: 4 },
    { label: "4–5 km", max: 5 },
    { label: "5+ km", max: Infinity },
  ],
  strength: [],
  other: [],
};

export function distanceDistribution(acts: Activity[], sport: SportKey): { label: string; count: number }[] {
  const bins = BINS[sport].map((b) => ({ label: b.label, count: 0 }));
  for (const a of acts) {
    if (a.sport !== sport || a.distance <= 0) continue;
    const km = a.distance / 1000;
    const i = BINS[sport].findIndex((b) => km < b.max);
    if (i >= 0) bins[i].count++;
  }
  return bins;
}

/** Minimum distance (m) and plausible range for an activity to enter the pace charts. */
const PACE_RULES: Record<SportKey, { minDist: number; lo: number; hi: number }> = {
  run: { minDist: 2000, lo: 150, hi: 600 }, // s/km
  ride: { minDist: 5000, lo: 10, hi: 50 }, // km/h
  swim: { minDist: 200, lo: 60, hi: 220 }, // s/100m
  strength: { minDist: Infinity, lo: 0, hi: 0 },
  other: { minDist: Infinity, lo: 0, hi: 0 },
};

/** Pace/speed of an activity in its sport unit (run s/km, ride km/h, swim s/100m). Uses MOVING time. */
export function paceValue(a: Activity): number | null {
  if (a.movingTime <= 0 || a.distance <= 0) return null;
  const v =
    a.sport === "run"
      ? a.movingTime / (a.distance / 1000)
      : a.sport === "swim"
        ? a.movingTime / (a.distance / 100)
        : (a.distance / a.movingTime) * 3.6;
  const r = PACE_RULES[a.sport];
  return a.distance >= r.minDist && v >= r.lo && v <= r.hi ? v : null;
}

export function paceValues(acts: Activity[], sport: SportKey): number[] {
  return acts
    .filter((a) => a.sport === sport)
    .map(paceValue)
    .filter((v): v is number => v !== null);
}

/** Activities that have an average HR. */
export const withHr = (acts: Activity[]) => acts.filter((a): a is Activity & { hr: number } => !!a.hr);

/**
 * Time spent (MOVING seconds) at each average-HR band of `bin` bpm. Each activity's
 * moving time goes into the band of its average HR.
 */
export function hrTimeHistogram(acts: Activity[], bin = 5): { from: number; seconds: number; count: number }[] {
  const list = withHr(acts);
  if (list.length === 0) return [];
  const lo = Math.floor(Math.min(...list.map((a) => a.hr)) / bin) * bin;
  const hi = Math.floor(Math.max(...list.map((a) => a.hr)) / bin) * bin;
  const bins = Array.from({ length: (hi - lo) / bin + 1 }, (_, i) => ({ from: lo + i * bin, seconds: 0, count: 0 }));
  for (const a of list) {
    const b = bins[Math.floor((a.hr - lo) / bin)];
    b.seconds += a.movingTime;
    b.count++;
  }
  return bins;
}

/** Aerobic efficiency: meters covered per heartbeat (higher = better). Uses MOVING time. */
export function efficiency(a: Activity): number | null {
  if (!a.hr || a.movingTime <= 0 || a.distance <= 0) return null;
  return ((a.distance / a.movingTime) * 60) / a.hr;
}

export interface MonthPoint {
  key: string; // YYYY-MM
  hr: number | null;
  eff: number | null;
}

/** Monthly average HR (weighted by moving time) and efficiency for one sport. */
export function monthlyHr(acts: Activity[], sport: SportKey, r: Range): MonthPoint[] {
  const keys = monthlyVolume([], r).map((p) => p.key);
  const acc = new Map(keys.map((k) => [k, { hr: 0, hrW: 0, eff: 0, effN: 0 }]));
  const minDist = siteConfig.rules.minDistanceForBestPace[sport];
  for (const a of acts) {
    if (a.sport !== sport || !a.hr) continue;
    const o = acc.get(a.date.slice(0, 7));
    if (!o) continue;
    o.hr += a.hr * a.movingTime;
    o.hrW += a.movingTime;
    const e = efficiency(a);
    if (e && a.distance >= minDist) {
      o.eff += e;
      o.effN++;
    }
  }
  return keys.map((key) => {
    const o = acc.get(key)!;
    return { key, hr: o.hrW ? o.hr / o.hrW : null, eff: o.effN ? o.eff / o.effN : null };
  });
}
