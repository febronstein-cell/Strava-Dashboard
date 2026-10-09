import type { SportKey } from "@/site.config";
import type { Activity } from "@/lib/strava/types";
import type { Profile } from "./profile";

/**
 * Training load in TSS-like points (100 = one hour at threshold). Uses MOVING time.
 *  - bike with a power meter: TSS from normalized power and FTP;
 *  - anything with heart rate: hrTSS from average HR between resting HR and LTHR;
 *  - otherwise: a flat points-per-hour guess by sport (so strength and untracked sessions still count a little).
 */
export type LoadMethod = "power" | "hr" | "duration";

const FLAT_PER_HOUR: Record<SportKey, number> = { run: 65, ride: 50, swim: 55, strength: 35, other: 35 };

export function activityLoad(a: Activity, p: Profile): { tss: number; method: LoadMethod } {
  const hours = a.movingTime / 3600;
  const ftp = p.ftp?.value;
  if (a.sport === "ride" && a.np && a.deviceWatts && ftp) {
    const f = a.np / ftp;
    return { tss: hours * f * f * 100, method: "power" };
  }
  const lthr = p.lthr?.value;
  const rest = p.resting_hr?.value;
  if (a.hr && lthr && rest && lthr > rest) {
    const f = Math.min(1.2, Math.max(0, (a.hr - rest) / (lthr - rest)));
    return { tss: hours * f * f * 100, method: "hr" };
  }
  return { tss: hours * FLAT_PER_HOUR[a.sport], method: "duration" };
}

export interface LoadDay {
  /** YYYY-MM-DD */
  date: string;
  tss: number;
  /** fitness: 42-day exponential average of the load */
  ctl: number;
  /** fatigue: 7-day exponential average of the load */
  atl: number;
  /** form: yesterday's fitness minus yesterday's fatigue */
  tsb: number;
}

const DAY = 86_400_000;
const day = (iso: string) => iso.slice(0, 10);

/** One row per calendar day from the first activity to `endKey`. */
export function loadSeries(acts: Activity[], p: Profile, endKey: string): LoadDay[] {
  if (acts.length === 0) return [];
  const perDay = new Map<string, number>();
  let first = day(acts[0].date);
  for (const a of acts) {
    const k = day(a.date);
    if (k < first) first = k;
    perDay.set(k, (perDay.get(k) ?? 0) + activityLoad(a, p).tss);
  }
  const kCtl = 1 - Math.exp(-1 / 42);
  const kAtl = 1 - Math.exp(-1 / 7);
  const out: LoadDay[] = [];
  let ctl = 0;
  let atl = 0;
  for (let t = Date.parse(first + "T00:00:00Z"); t <= Date.parse(endKey + "T00:00:00Z"); t += DAY) {
    const key = new Date(t).toISOString().slice(0, 10);
    const tss = perDay.get(key) ?? 0;
    const tsb = ctl - atl;
    ctl += (tss - ctl) * kCtl;
    atl += (tss - atl) * kAtl;
    out.push({ date: key, tss, ctl, atl, tsb });
  }
  return out;
}

export type FormState = "fresh" | "neutral" | "productive" | "overreaching";

/** Reading of the form (TSB) in plain categories. */
export function formState(tsb: number): FormState {
  if (tsb > 15) return "fresh";
  if (tsb > -10) return "neutral";
  if (tsb > -30) return "productive";
  return "overreaching";
}

/** How many points CTL changed over the last `weeks` weeks (positive = building). */
export function rampRate(series: LoadDay[], weeks = 4): number | null {
  const n = series.length;
  const back = weeks * 7;
  if (n <= back) return null;
  return (series[n - 1].ctl - series[n - 1 - back].ctl) / weeks;
}
