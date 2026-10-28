/**
 * Time in zone from Strava streams. Pure.
 *
 * Each activity's streams are read once and reduced to histograms of MOVING samples: seconds at each bpm, in each
 * 5 W band and in each 5 s/km band. The zones are computed from those histograms with the thresholds of the moment, so
 * a new FTP, LTHR or zone table is applied at once to the whole history without fetching anything again.
 */

export interface Streams {
  time?: number[];
  heartrate?: number[];
  watts?: number[];
  velocity_smooth?: number[];
  moving?: boolean[];
  distance?: number[];
}

/** Histograms of one activity (keys are the band starts). */
export interface StreamSummary {
  v: number;
  movingS: number;
  /** seconds at each bpm */
  hr?: Record<string, number>;
  /** seconds in each 5 W band (key = band start) */
  power?: Record<string, number>;
  /** seconds in each 5 s/km band (key = band start); runs only */
  pace?: Record<string, number>;
}

export const SUMMARY_VERSION = 1;
const POWER_BIN = 5;
const PACE_BIN = 5;
/** Gaps longer than this are pauses, not samples. */
const MAX_DT = 30;

const add = (h: Record<string, number>, k: number, s: number) => {
  h[k] = (h[k] ?? 0) + s;
};

/** Reduces the streams to moving-time histograms. */
export function summarizeStreams(s: Streams, sport: string): StreamSummary {
  const time = s.time ?? [];
  const hr: Record<string, number> = {};
  const power: Record<string, number> = {};
  const pace: Record<string, number> = {};
  let movingS = 0;
  for (let i = 1; i < time.length; i++) {
    const dt = time[i] - time[i - 1];
    if (!(dt > 0 && dt <= MAX_DT)) continue;
    if (s.moving && !s.moving[i]) continue;
    movingS += dt;
    const h = s.heartrate?.[i];
    if (h && h > 30 && h < 230) add(hr, Math.round(h), dt);
    const w = s.watts?.[i];
    if (w != null && w >= 0 && w < 2500) add(power, Math.floor(w / POWER_BIN) * POWER_BIN, dt);
    const v = s.velocity_smooth?.[i];
    if (sport === "run" && v && v > 1) add(pace, Math.floor(1000 / v / PACE_BIN) * PACE_BIN, dt);
  }
  return {
    v: SUMMARY_VERSION,
    movingS,
    hr: Object.keys(hr).length ? hr : undefined,
    power: Object.keys(power).length ? power : undefined,
    pace: Object.keys(pace).length ? pace : undefined,
  };
}

/** Seconds per zone from a histogram and the zones' INCLUSIVE upper limits (last one Infinity). */
export function bucket(hist: Record<string, number> | undefined, maxes: number[]): number[] {
  const out = maxes.map(() => 0);
  if (!hist) return out;
  for (const [k, s] of Object.entries(hist)) {
    const v = Number(k);
    const i = maxes.findIndex((m) => v <= m);
    out[i === -1 ? maxes.length - 1 : i] += s;
  }
  return out;
}

/** Coggan power zones from FTP: <=55, 56-75, 76-90, 91-105, 106-120, 121-150, >150 % (bands of 5 W, by their start). */
export function powerZones(hist: Record<string, number> | undefined, ftp: number): number[] {
  const edges = [0.55, 0.75, 0.9, 1.05, 1.2, 1.5].map((f) => f * ftp);
  return bucket(hist, [...edges.map((e) => e - 0.0001), Infinity]);
}
export const POWER_ZONE_NAMES = ["Z1 Active recovery", "Z2 Endurance", "Z3 Tempo", "Z4 Threshold", "Z5 VO2max", "Z6 Anaerobic", "Z7 Neuromuscular"];

/**
 * Run pace zones from the threshold pace (s/km), slowest first: Z1 slower than 129% of the threshold time, Z2 114-129%,
 * Z3 106-113%, Z4 99-105%, Z5 faster than 99%.
 */
export function paceZones(hist: Record<string, number> | undefined, threshold: number): number[] {
  const out = [0, 0, 0, 0, 0];
  if (!hist) return out;
  for (const [k, s] of Object.entries(hist)) {
    const r = (Number(k) + PACE_BIN / 2) / threshold;
    out[r > 1.29 ? 0 : r > 1.13 ? 1 : r > 1.05 ? 2 : r >= 0.99 ? 3 : 4] += s;
  }
  return out;
}
export const PACE_ZONE_NAMES = ["Z1 Recovery", "Z2 Aerobic", "Z3 Tempo", "Z4 Threshold", "Z5 Above threshold"];

export interface ThreeZoneLimits {
  /** HR: zone 1 up to and including lt1Hr; zone 3 from lt2Hr */
  lt1Hr: number;
  lt2Hr: number;
  /** power cut-offs for rides with a power meter */
  lt1W?: number;
  lt2W?: number;
}

/**
 * The 3-zone model: zone 1 below LT1, zone 2 between LT1 and LT2, zone 3 at or above LT2. Rides with power use watts,
 * everything else heart rate. Null when the activity has neither.
 */
export function threeZone(sum: StreamSummary, sport: string, l: ThreeZoneLimits): [number, number, number] | null {
  if (sport === "ride" && sum.power && l.lt1W && l.lt2W) {
    const [a, b, c] = bucket(sum.power, [l.lt1W - 0.0001, l.lt2W - 0.0001, Infinity]);
    return [a, b, c];
  }
  if (sum.hr) {
    const [a, b, c] = bucket(sum.hr, [l.lt1Hr, l.lt2Hr - 1, Infinity]);
    return [a, b, c];
  }
  return null;
}

export type Distribution = "polarized" | "pyramidal" | "threshold" | "mixed";

/**
 * Polarization index (Treff et al. 2019): PI = log10((z1 / z2) × z3 × 100), with the zones as fractions of the time.
 * Polarized when z1 > z3 > z2 and PI > 2; pyramidal when z1 > z2 > z3; threshold-heavy when zone 2 is the biggest.
 * A zone 2 of zero is treated as 0.01 (as in the paper) so the index stays finite.
 */
export function polarization(z: [number, number, number]): { pi: number | null; label: Distribution; shares: [number, number, number] } {
  const total = z[0] + z[1] + z[2];
  if (!total) return { pi: null, label: "mixed", shares: [0, 0, 0] };
  const [f1, f2, f3] = z.map((x) => x / total) as [number, number, number];
  const pi = f3 > 0 ? Math.log10((f1 / Math.max(f2, 0.01)) * f3 * 100) : null;
  const label: Distribution =
    f2 >= f1 && f2 >= f3 ? "threshold" : f1 > f3 && f3 > f2 && (pi ?? 0) > 2 ? "polarized" : f1 > f2 && f2 >= f3 ? "pyramidal" : "mixed";
  return { pi, label, shares: [f1, f2, f3] };
}

/** Share of a histogram's time above a value (e.g. an HR cap): the samples above it, as a %. */
export function shareAbove(hist: Record<string, number> | undefined, cap: number): number | null {
  if (!hist) return null;
  let total = 0;
  let above = 0;
  for (const [k, s] of Object.entries(hist)) {
    total += s;
    if (Number(k) > cap) above += s;
  }
  return total ? (above / total) * 100 : null;
}
