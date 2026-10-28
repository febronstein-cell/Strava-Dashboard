import type { SportKey } from "@/site.config";
import type { Activity } from "@/lib/strava/types";
import type { Profile } from "./profile";

/**
 * Training load in TSS-like points (100 = one hour at threshold). Uses MOVING time.
 *
 * Method per session, best signal first (Allen & Coggan, "Training and Racing with a Power Meter"):
 *  - bike with a power meter: TSS = hours × IF² × 100, IF = normalized power / FTP;
 *  - run and swim: pace against the threshold pace (rTSS: IF²) or the critical swim speed (sTSS: IF³,
 *    because water drag grows with the cube of speed); runs get a small credit for climbing;
 *  - heart rate (hrTSS): IF from the heart-rate reserve, with the threshold scaled per sport because
 *    the same effort gives a lower heart rate on the bike (~4%) and in the water (~10%) (Friel);
 *  - runs with both pace and heart rate use the average of the two, which cancels part of each error; swims with a
 *    distance use pace only (IF = CSS pace / average pace, IF³), because heart rate in the water reads low;
 *  - session RPE (Foster): IF from the 1-10 rating, load = hours × IF² × 100 (elapsed time for manual sessions);
 *  - no data: a flat points-per-hour guess by sport.
 * Order: power, then pace, then HR, then RPE, then flat duration.
 */
export type LoadMethod = "power" | "pace" | "hr" | "rpe" | "duration";

/** Estimated intensity factor of each session RPE (1 to 10). */
export const RPE_IF: Record<number, number> = { 1: 0.5, 2: 0.55, 3: 0.6, 4: 0.65, 5: 0.7, 6: 0.75, 7: 0.82, 8: 0.9, 9: 0.97, 10: 1.05 };

/** Load from a session RPE alone (100 = one hour at threshold). */
export function rpeLoad(hours: number, rpe: number): number {
  const f = RPE_IF[Math.round(Math.min(10, Math.max(1, rpe)))];
  return hours * f * f * 100;
}

const FLAT_PER_HOUR: Record<SportKey, number> = { run: 65, ride: 50, swim: 55, strength: 35, other: 35 };
/** Threshold heart rate of each sport relative to the running LTHR. */
const LTHR_SCALE: Record<SportKey, number> = { run: 1, ride: 0.96, swim: 0.9, strength: 1, other: 1 };
/** Metres of flat running that one metre of climbing is worth (approximation of the energy cost of uphill running). */
const CLIMB_METRES = 6;

/**
 * Power is trusted only when it comes from a power meter and normalized power is not absurdly above
 * average power (a ratio above 1.5 means dropouts or bad data, not a real ride).
 */
export function powerLooksValid(a: Activity): boolean {
  return !!a.np && !!a.deviceWatts && (!a.watts || a.np / a.watts <= 1.5);
}

export function activityLoad(a: Activity, p: Profile): { tss: number; method: LoadMethod; rpeTss?: number } {
  const hours = a.movingTime / 3600;
  // the RPE load is always computed when there is a rating, so it can be shown next to the measured one
  const rpeTss = a.rpe ? rpeLoad((a.manual ? a.elapsedTime : a.movingTime) / 3600, a.rpe) : undefined;
  const ftp = p.ftp?.value;

  if (a.sport === "ride" && a.np && ftp && powerLooksValid(a)) {
    const f = Math.min(1.5, a.np / ftp);
    return { tss: hours * f * f * 100, method: "power", rpeTss };
  }

  let paceTss: number | null = null;
  if (a.sport === "run" && p.run_threshold_pace && a.distance >= 1000 && a.movingTime >= 600) {
    const flat = a.distance + (a.indoor ? 0 : CLIMB_METRES * a.elevation);
    const f = Math.min(1.3, flat / a.movingTime / (1000 / p.run_threshold_pace.value));
    paceTss = hours * f * f * 100;
  } else if (a.sport === "swim" && p.css && a.distance >= 200 && a.movingTime >= 300) {
    // IF = CSS pace / average pace (the same as average speed / CSS speed), cubed
    const f = Math.min(1.3, a.distance / a.movingTime / (100 / p.css.value));
    return { tss: hours * f * f * f * 100, method: "pace", rpeTss };
  }

  let hrTss: number | null = null;
  const lthr = p.lthr?.value;
  const rest = p.resting_hr?.value;
  if (a.hr && lthr && rest) {
    const t = lthr * LTHR_SCALE[a.sport];
    if (t > rest) {
      const f = Math.min(1.2, Math.max(0, (a.hr - rest) / (t - rest)));
      hrTss = hours * f * f * 100;
    }
  }

  if (paceTss !== null && hrTss !== null) return { tss: (paceTss + hrTss) / 2, method: "pace", rpeTss };
  if (paceTss !== null) return { tss: paceTss, method: "pace", rpeTss };
  if (hrTss !== null) return { tss: hrTss, method: "hr", rpeTss };
  if (rpeTss !== undefined) return { tss: rpeTss, method: "rpe", rpeTss };
  return { tss: (a.manual ? a.elapsedTime / 3600 : hours) * FLAT_PER_HOUR[a.sport], method: "duration" };
}

export interface LoadDay {
  /** YYYY-MM-DD */
  date: string;
  tss: number;
  /** fitness: 42-day exponential average of the load (after this day) */
  ctl: number;
  /** fatigue: 7-day exponential average of the load (after this day) */
  atl: number;
  /** form: the morning's fitness minus fatigue, before this day's load */
  tsb: number;
}

const DAY = 86_400_000;
const day = (iso: string) => iso.slice(0, 10);
export const K_CTL = 1 - Math.exp(-1 / 42);
export const K_ATL = 1 - Math.exp(-1 / 7);

function loadPerDay(acts: Activity[], p: Profile): { perDay: Map<string, number>; first: string } {
  const perDay = new Map<string, number>();
  let first = day(acts[0].date);
  for (const a of acts) {
    const k = day(a.date);
    if (k < first) first = k;
    perDay.set(k, (perDay.get(k) ?? 0) + activityLoad(a, p).tss);
  }
  return { perDay, first };
}

/** One row per calendar day from the first activity to `endKey` (Banister impulse-response model, 42/7-day constants). */
export function loadSeries(acts: Activity[], p: Profile, endKey: string): LoadDay[] {
  if (acts.length === 0) return [];
  const { perDay, first } = loadPerDay(acts, p);
  const out: LoadDay[] = [];
  let ctl = 0;
  let atl = 0;
  for (let t = Date.parse(first + "T00:00:00Z"); t <= Date.parse(endKey + "T00:00:00Z"); t += DAY) {
    const key = new Date(t).toISOString().slice(0, 10);
    const tss = perDay.get(key) ?? 0;
    const tsb = ctl - atl;
    ctl += (tss - ctl) * K_CTL;
    atl += (tss - atl) * K_ATL;
    out.push({ date: key, tss, ctl, atl, tsb });
  }
  return out;
}

/**
 * Fitness (42-day load) of each sport at `endKey`: how much of the current fitness comes from swim, bike and run.
 * Strength counts toward fatigue and the load ratio (in the total), but not toward the fitness of any single sport.
 */
export function sportFitness(acts: Activity[], p: Profile, endKey: string): Record<SportKey, number> {
  const out: Record<SportKey, number> = { run: 0, ride: 0, swim: 0, strength: 0, other: 0 };
  for (const sport of Object.keys(out) as SportKey[]) {
    if (sport === "strength") continue;
    const mine = acts.filter((a) => a.sport === sport);
    if (mine.length === 0) continue;
    const { perDay, first } = loadPerDay(mine, p);
    let ctl = 0;
    for (let t = Date.parse(first + "T00:00:00Z"); t <= Date.parse(endKey + "T00:00:00Z"); t += DAY) {
      ctl += ((perDay.get(new Date(t).toISOString().slice(0, 10)) ?? 0) - ctl) * K_CTL;
    }
    out[sport] = ctl;
  }
  return out;
}

export type FormState = "transition" | "fresh" | "neutral" | "productive" | "overreaching";

/** Reading of the form (TSB). Bands follow Coggan / Friel: +5 to +25 is the usual race window. */
export function formState(tsb: number): FormState {
  if (tsb > 25) return "transition";
  if (tsb >= 5) return "fresh";
  if (tsb > -10) return "neutral";
  if (tsb >= -30) return "productive";
  return "overreaching";
}

/** How many points CTL changed per week over the last `weeks` weeks (positive = building). Above ~+7/week is a steep ramp. */
export function rampRate(series: LoadDay[], weeks = 4): number | null {
  const n = series.length;
  const back = weeks * 7;
  if (n <= back) return null;
  return (series[n - 1].ctl - series[n - 1 - back].ctl) / weeks;
}

export type AcwrState = "low" | "sweet" | "caution" | "high";

/**
 * Acute:chronic workload ratio with exponentially weighted averages of 7 and 28 days
 * (Williams et al. 2017). 0.8–1.3 is the "sweet spot" and above 1.5 the risk rises (Gabbett 2016);
 * it is a rough guide, not a prediction (Impellizzeri et al. 2020).
 */
export function acwr(series: LoadDay[]): { ratio: number; state: AcwrState } | null {
  if (series.length < 35) return null;
  const la = 2 / (7 + 1);
  const lc = 2 / (28 + 1);
  let a = series[0].tss;
  let c = series[0].tss;
  for (const d of series) {
    a = d.tss * la + (1 - la) * a;
    c = d.tss * lc + (1 - lc) * c;
  }
  if (c <= 0) return null;
  const ratio = a / c;
  return { ratio, state: ratio < 0.8 ? "low" : ratio <= 1.3 ? "sweet" : ratio <= 1.5 ? "caution" : "high" };
}

/**
 * Foster's monotony (mean daily load of the last 7 days divided by its standard deviation) and
 * strain (week load × monotony). Monotony above ~2 with a high strain was linked to illness
 * and overtraining (Foster 1998).
 */
export function monotonyStrain(series: LoadDay[]): { monotony: number; strain: number; week: number } | null {
  const last = series.slice(-7).map((d) => d.tss);
  if (last.length < 7) return null;
  const mean = last.reduce((s, x) => s + x, 0) / 7;
  const sd = Math.sqrt(last.reduce((s, x) => s + (x - mean) ** 2, 0) / 7);
  const monotony = sd < 1e-6 ? 10 : Math.min(10, mean / sd);
  return { monotony, strain: mean * 7 * monotony, week: mean * 7 };
}
