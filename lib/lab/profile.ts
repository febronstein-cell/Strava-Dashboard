import { siteConfig } from "@/site.config";
import type { Activity } from "@/lib/strava/types";
import { paceValue } from "@/lib/stats";
import type { ThresholdKind, ThresholdRow } from "./types";

/** Where a number comes from: a real test (database), an estimate from the data, or your zone settings. */
export type Source = "test" | "estimated" | "config";

export interface Metric {
  value: number;
  source: Source;
  /** test date (tests only) */
  date?: string;
  /** how an estimate was made (shown to the reader) */
  how?: string;
}

export type Profile = Partial<Record<ThresholdKind, Metric>>;

/** Latest test of each kind. */
function latestTests(rows: ThresholdRow[]): Profile {
  const out: Profile = {};
  for (const r of rows) {
    const cur = out[r.kind];
    if (!cur || (cur.date ?? "") < r.testDate) out[r.kind] = { value: r.value, source: "test", date: r.testDate };
  }
  return out;
}

/** Average pace (s/km) of outdoor runs between 40 and 75 min: a proxy for threshold pace. */
function bestSustainedRunPace(acts: Activity[]): number | null {
  let best: number | null = null;
  for (const a of acts) {
    if (a.sport !== "run" || a.indoor || a.movingTime < 2400 || a.movingTime > 4500) continue;
    const p = paceValue(a);
    if (p !== null && (best === null || p < best)) best = p;
  }
  return best;
}

/** Best average swim pace (s/100m) among swims of 1500 m or more: a proxy for critical swim speed. */
function bestLongSwimPace(acts: Activity[]): number | null {
  let best: number | null = null;
  for (const a of acts) {
    if (a.sport !== "swim" || a.distance < 1500) continue;
    const p = paceValue(a);
    if (p !== null && (best === null || p < best)) best = p;
  }
  return best;
}

/**
 * Real tests win; whatever is missing is estimated from the history (power curve, best efforts)
 * or taken from the zone ceilings in site.config.ts. Everything estimated is labelled as such.
 */
export function buildProfile(tests: ThresholdRow[], acts: Activity[], power: Record<string, number>): Profile {
  const p = latestTests(tests);
  const set = (k: ThresholdKind, m: Metric) => {
    if (!p[k]) p[k] = m;
  };

  const best20 = power["1200"];
  if (best20) set("ftp", { value: Math.round(best20 * 0.95), source: "estimated", how: "95% of your best 20 min power" });

  const maxSeen = acts.reduce((m, a) => Math.max(m, a.hrMax ?? 0), 0);
  if (maxSeen) set("max_hr", { value: maxSeen, source: "estimated", how: "highest heart rate in your history" });

  const z = siteConfig.heartRate.zones;
  if (Number.isFinite(z[1]?.max)) set("lt1_hr", { value: z[1].max, source: "config", how: "your zone 2 ceiling" });
  if (Number.isFinite(z[3]?.max)) {
    set("lt2_hr", { value: z[3].max, source: "config", how: "your zone 4 ceiling" });
    set("lthr", { value: z[3].max, source: "config", how: "your zone 4 ceiling" });
  }
  // ventilatory thresholds follow the lactate ones unless tested separately
  if (p.lt1_hr) set("vt1_hr", { ...p.lt1_hr, how: p.lt1_hr.source === "test" ? "same as LT1 (not tested)" : p.lt1_hr.how, source: p.lt1_hr.source === "test" ? "estimated" : p.lt1_hr.source });
  if (p.lt2_hr) set("vt2_hr", { ...p.lt2_hr, how: p.lt2_hr.source === "test" ? "same as LT2 (not tested)" : p.lt2_hr.how, source: p.lt2_hr.source === "test" ? "estimated" : p.lt2_hr.source });

  set("resting_hr", { value: siteConfig.lab.restHr, source: "config", how: "assumed in site.config.ts" });

  if (p.ftp) {
    set("lt2_power", { value: p.ftp.value, source: "estimated", how: "same as FTP" });
    set("lt1_power", { value: Math.round(p.ftp.value * 0.75), source: "estimated", how: "75% of FTP" });
  }

  const runPace = bestSustainedRunPace(acts);
  if (runPace) set("run_threshold_pace", { value: Math.round(runPace), source: "estimated", how: "your best 40–75 min outdoor run" });
  if (p.run_threshold_pace) {
    set("lt2_pace", { value: p.run_threshold_pace.value, source: "estimated", how: "same as threshold pace" });
    set("lt1_pace", { value: Math.round(p.run_threshold_pace.value / 0.8), source: "estimated", how: "80% of threshold speed" });
  }

  const swim = bestLongSwimPace(acts);
  if (swim) set("css", { value: Math.round(swim), source: "estimated", how: "your best swim of 1.5 km or more" });

  return p;
}

// ------------------------------------------------------------------ zones

export interface Zone {
  name: string;
  /** inclusive lower and upper limits (null = open) in the unit of the table */
  from: number | null;
  to: number | null;
  color: string;
}

const PALETTE = ["#2bd4ff", "#1fe08a", "#c6f432", "#ffb020", "#ff5a1f", "#ff4d8d", "#b06bff"];

/** Heart-rate zones exactly as set in site.config.ts. */
export function hrZones(): Zone[] {
  const z = siteConfig.heartRate.zones;
  return z.map((zone, i) => ({
    name: zone.name,
    from: i === 0 ? null : z[i - 1].max + 1,
    to: Number.isFinite(zone.max) ? zone.max : null,
    color: zone.color,
  }));
}

/** Coggan power zones from FTP. */
export function powerZones(ftp: number): Zone[] {
  const names = ["Z1 · Active recovery", "Z2 · Endurance", "Z3 · Tempo", "Z4 · Threshold", "Z5 · VO2max", "Z6 · Anaerobic", "Z7 · Neuromuscular"];
  const cuts = [0.55, 0.75, 0.9, 1.05, 1.2, 1.5];
  return names.map((name, i) => ({
    name,
    from: i === 0 ? null : Math.round(ftp * cuts[i - 1]) + 1,
    to: i === cuts.length ? null : Math.round(ftp * cuts[i]),
    color: PALETTE[i],
  }));
}

/**
 * Run pace zones (s/km) from the threshold pace. For paces a bigger number is SLOWER, so here
 * `from` is the slow limit and `to` the fast limit (Z1 has no slow limit, Z5 no fast limit).
 */
export function runPaceZones(thresholdPace: number): Zone[] {
  const names = ["Z1 · Recovery", "Z2 · Aerobic", "Z3 · Tempo", "Z4 · Threshold", "Z5 · VO2max"];
  // share of threshold speed where each zone starts (and the next one ends)
  const speedCuts = [0.78, 0.88, 0.95, 1.02];
  const paceAt = (share: number) => Math.round(thresholdPace / share);
  return names.map((name, i) => ({
    name,
    from: i === 0 ? null : paceAt(speedCuts[i - 1]),
    to: i === speedCuts.length ? null : paceAt(speedCuts[i]),
    color: PALETTE[i],
  }));
}
