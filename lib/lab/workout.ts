import { siteConfig, type SportKey } from "@/site.config";
import type { Activity } from "@/lib/strava/types";
import { efficiency, paceValue } from "@/lib/stats";
import { activityLoad, powerLooksValid, type LoadMethod } from "./load";
import type { Profile } from "./profile";

/** Everything measurable about one workout, plus how it compares with similar recent ones. Isomorphic. */
export interface WorkoutFacts {
  id: number;
  name: string;
  sport: SportKey;
  date: string;
  indoor: boolean;
  race: boolean;
  distanceKm: number;
  movingMin: number;
  elapsedMin: number;
  /** stopped share of the elapsed time, 0..1 */
  stoppedShare: number;
  elevation: number;
  /** run s/km, swim s/100m, ride km/h (null when not meaningful) */
  pace: number | null;
  hr: number | null;
  hrMax: number | null;
  /** average HR as % of LTHR (the sport-independent reference) */
  hrPctLthr: number | null;
  /** 0-based index of the configured HR zone of the average HR */
  hrZone: number | null;
  cadence: number | null;
  watts: number | null;
  np: number | null;
  /** variability index NP / average power (rides with a power meter) */
  vi: number | null;
  /** intensity factor NP / FTP */
  intensityFactor: number | null;
  /** normalized power is far above average power: probably a power-meter dropout */
  powerMismatch: boolean;
  /** bike efficiency factor NP / average HR */
  ef: number | null;
  load: number;
  loadMethod: LoadMethod;
  /** share of your last-120-day sessions of this sport with a lower load, 0..1 */
  loadPercentile: number | null;
  intensity: "recovery" | "easy" | "moderate" | "hard" | "very hard";
  /** comparison with sessions of the same sport and type, similar distance, in the 120 days before */
  similar: null | {
    n: number;
    distancePct: number;
    pacePct: number | null;
    hrDiff: number | null;
    efficiencyPct: number | null;
  };
}

const DAY = 86_400_000;
const dayMs = (iso: string) => Date.parse(iso.slice(0, 10) + "T00:00:00Z");

export function workoutFacts(a: Activity, all: Activity[], p: Profile): WorkoutFacts {
  const lthr = p.lthr?.value;
  const zones = siteConfig.heartRate.zones;
  const zoneIdx = a.hr ? Math.max(0, zones.findIndex((z) => a.hr! <= z.max)) : null;
  const { tss, method } = activityLoad(a, p);
  const ftp = p.ftp?.value;
  const rawVi = a.sport === "ride" && a.np && a.watts && a.deviceWatts ? a.np / a.watts : null;
  const validPower = a.sport === "ride" && powerLooksValid(a);
  const vi = validPower ? rawVi : null;
  const ifac = validPower && ftp ? a.np! / ftp : null;

  // intensity: power first, then HR zone
  let intensity: WorkoutFacts["intensity"] = "easy";
  if (ifac !== null) intensity = ifac < 0.55 ? "recovery" : ifac < 0.75 ? "easy" : ifac < 0.9 ? "moderate" : ifac < 1.05 ? "hard" : "very hard";
  else if (zoneIdx !== null) intensity = (["recovery", "easy", "moderate", "hard", "very hard"] as const)[Math.min(4, zoneIdx)];

  // comparison pool: same sport and environment, the 120 days before this session
  const t = dayMs(a.date);
  const pool = all.filter((b) => b.id !== a.id && b.sport === a.sport && !!b.indoor === !!a.indoor && !b.race && dayMs(b.date) < t && dayMs(b.date) >= t - 120 * DAY);
  const loads = pool.map((b) => activityLoad(b, p).tss);
  const loadPercentile = loads.length >= 5 ? loads.filter((x) => x < tss).length / loads.length : null;

  const similarPool = a.distance > 0 ? pool.filter((b) => b.distance >= a.distance * 0.75 && b.distance <= a.distance * 1.25) : [];
  let similar: WorkoutFacts["similar"] = null;
  if (similarPool.length >= 3) {
    const mean = (xs: number[]) => (xs.length ? xs.reduce((s, x) => s + x, 0) / xs.length : null);
    const myPace = paceValue(a);
    const pPaces = similarPool.map(paceValue).filter((v): v is number => v !== null);
    const pHr = similarPool.map((b) => b.hr).filter((v): v is number => !!v);
    const pEff = similarPool.map(efficiency).filter((v): v is number => v !== null);
    const mp = mean(pPaces);
    const mh = mean(pHr);
    const me = mean(pEff);
    const myEff = efficiency(a);
    similar = {
      n: similarPool.length,
      distancePct: Math.round(((a.distance - mean(similarPool.map((b) => b.distance))!) / mean(similarPool.map((b) => b.distance))!) * 100),
      // for run/swim a LOWER pace number is faster, for rides a higher speed is faster: report "faster" as positive
      pacePct: myPace !== null && mp ? Math.round((a.sport === "ride" ? (myPace - mp) / mp : (mp - myPace) / mp) * 100) : null,
      hrDiff: a.hr && mh ? Math.round(a.hr - mh) : null,
      efficiencyPct: myEff && me ? Math.round(((myEff - me) / me) * 100) : null,
    };
  }

  return {
    id: a.id,
    name: a.name,
    sport: a.sport,
    date: a.date,
    indoor: !!a.indoor,
    race: !!a.race,
    distanceKm: a.distance / 1000,
    movingMin: a.movingTime / 60,
    elapsedMin: a.elapsedTime / 60,
    stoppedShare: a.elapsedTime > 0 ? Math.max(0, 1 - a.movingTime / a.elapsedTime) : 0,
    elevation: a.elevation,
    pace: paceValue(a),
    hr: a.hr ?? null,
    hrMax: a.hrMax ?? null,
    hrPctLthr: a.hr && lthr ? (a.hr / lthr) * 100 : null,
    hrZone: zoneIdx,
    cadence: a.cad ?? null,
    watts: a.watts ?? null,
    np: a.np ?? null,
    vi,
    intensityFactor: ifac,
    ef: validPower && a.np && a.hr ? a.np / a.hr : null,
    powerMismatch: rawVi !== null && rawVi > 1.5,
    load: tss,
    loadMethod: method,
    loadPercentile,
    intensity,
    similar,
  };
}

export interface Finding {
  id: string;
  tone: "good" | "warn" | "info";
  /** English text with {vars}; translated by the page */
  text: string;
  vars: Record<string, string | number>;
}

/** Rule-based reading of a workout, using widely accepted sports-science rules of thumb. */
export function workoutFindings(f: WorkoutFacts): Finding[] {
  const out: Finding[] = [];
  const add = (x: Finding) => out.push(x);

  if (f.intensityFactor !== null) {
    add({ id: "intensity", tone: "info", text: "Intensity: {level}. Intensity factor {if} (normalized power over FTP).", vars: { level: f.intensity, if: f.intensityFactor.toFixed(2) } });
  } else if (f.hr) {
    add(
      f.hrPctLthr
        ? { id: "intensity", tone: "info", text: "Intensity: {level}. Average heart rate {hr} bpm, {pct}% of LTHR.", vars: { level: f.intensity, hr: Math.round(f.hr), pct: Math.round(f.hrPctLthr) } }
        : { id: "intensity", tone: "info", text: "Intensity: {level}. Average heart rate {hr} bpm.", vars: { level: f.intensity, hr: Math.round(f.hr) } },
    );
  } else {
    add({ id: "intensity", tone: "info", text: "Intensity not rated: no heart rate or power in this session.", vars: {} });
  }

  add({
    id: "load",
    tone: f.load > 150 ? "warn" : "info",
    text:
      f.loadPercentile === null
        ? "Estimated training load: {load} points."
        : "Estimated training load: {load} points, heavier than {pct}% of your recent sessions of this sport.",
    vars: { load: Math.round(f.load), pct: Math.round((f.loadPercentile ?? 0) * 100) },
  });

  if (f.similar) {
    const s = f.similar;
    if (s.pacePct !== null && s.hrDiff !== null) {
      const faster = s.pacePct >= 1;
      const slower = s.pacePct <= -1;
      const hrLower = s.hrDiff <= -2;
      const hrHigher = s.hrDiff >= 2;
      if (faster && !hrHigher) add({ id: "vs-fit", tone: "good", text: "Compared with {n} similar sessions you were {pct}% faster with a similar or lower heart rate ({hr} bpm): a sign of better aerobic fitness.", vars: { n: s.n, pct: s.pacePct, hr: `${s.hrDiff > 0 ? "+" : ""}${s.hrDiff}` } });
      else if (slower && hrHigher) add({ id: "vs-fatigue", tone: "warn", text: "Compared with {n} similar sessions you were {pct}% slower with a higher heart rate ({hr} bpm): heat, fatigue or poor recovery are common causes.", vars: { n: s.n, pct: Math.abs(s.pacePct), hr: `+${s.hrDiff}` } });
      else if (slower && hrLower) add({ id: "vs-easy", tone: "info", text: "Compared with {n} similar sessions you went {pct}% slower at a lower heart rate ({hr} bpm): consistent with an easier, controlled session.", vars: { n: s.n, pct: Math.abs(s.pacePct), hr: String(s.hrDiff) } });
      else if (faster && hrHigher) add({ id: "vs-push", tone: "info", text: "Compared with {n} similar sessions you were {pct}% faster but with a higher heart rate ({hr} bpm): you pushed harder than usual.", vars: { n: s.n, pct: s.pacePct, hr: `+${s.hrDiff}` } });
      else add({ id: "vs-same", tone: "info", text: "Pace and heart rate are in line with {n} similar sessions.", vars: { n: s.n } });
    }
    if (s.efficiencyPct !== null && Math.abs(s.efficiencyPct) >= 3) {
      add({ id: "vs-eff", tone: s.efficiencyPct > 0 ? "good" : "info", text: s.efficiencyPct > 0 ? "Efficiency (distance per heartbeat) was {pct}% better than in similar sessions." : "Efficiency (distance per heartbeat) was {pct}% lower than in similar sessions.", vars: { pct: Math.abs(s.efficiencyPct) } });
    }
  }

  if (f.powerMismatch) {
    add({ id: "power-data", tone: "warn", text: "The power numbers do not add up (normalized power is far above average power): probably a power-meter dropout, so power figures are ignored and heart rate is used instead.", vars: {} });
  }

  if (f.vi !== null) {
    add(
      f.vi <= 1.05
        ? { id: "vi", tone: "good", text: "Very even power (variability index {vi}): ideal for time trials and the 70.3 or Ironman bike leg.", vars: { vi: f.vi.toFixed(2) } }
        : f.vi <= 1.12
          ? { id: "vi", tone: "info", text: "Moderately variable power (variability index {vi}).", vars: { vi: f.vi.toFixed(2) } }
          : { id: "vi", tone: "warn", text: "Very variable power (variability index {vi}): many surges cost more energy than the average suggests.", vars: { vi: f.vi.toFixed(2) } },
    );
  }

  if (f.sport === "ride" && f.indoor && f.hr && f.hrPctLthr && f.hrPctLthr >= 92 && f.movingMin >= 40) {
    add({ id: "indoor-heat", tone: "warn", text: "Indoor sessions raise heart rate by roughly 5–10 bpm without strong cooling: use a fan so the effort is comparable with outdoor rides.", vars: {} });
  }

  if (f.hrPctLthr && f.hrPctLthr >= 95 && f.movingMin >= 60 && !f.race) {
    add({ id: "hard-long", tone: "warn", text: "More than an hour near threshold heart rate is a lot of stress: protect the next 24–48 hours.", vars: {} });
  }

  if (f.movingMin >= 120) {
    add({ id: "fuel", tone: "info", text: "Sessions over 2 hours benefit from 60–90 g of carbohydrate per hour (Jeukendrup 2014).", vars: {} });
  }

  if (f.stoppedShare >= 0.2 && f.sport !== "swim" && f.sport !== "strength" && f.elapsedMin >= 30) {
    add({ id: "stops", tone: "info", text: "{pct}% of the time was stopped: elapsed time counts for volume, moving time for pace and heart rate.", vars: { pct: Math.round(f.stoppedShare * 100) } });
  }

  add(
    f.load >= 150 || f.intensity === "very hard"
      ? { id: "recover", tone: "info", text: "After a session this demanding, keep the next day easy or off and wait about 48 hours before another hard one.", vars: {} }
      : f.load >= 90 || f.intensity === "hard"
        ? { id: "recover", tone: "info", text: "A solid session: an easy day or a different sport next is enough to absorb it.", vars: {} }
        : { id: "recover", tone: "info", text: "Light enough that it should not limit tomorrow's training.", vars: {} },
  );

  return out;
}
