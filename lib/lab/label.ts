import type { SportKey } from "@/site.config";
import type { Profile } from "./profile";

/**
 * Names a workout by how it was done ("Sweet Spot 3x15'", "10x400m VO2", "Z2 endurance ride", "Long run"...),
 * always in English. It needs the second-by-second data (power, speed) or the laps, so it works on the
 * numbers fetched from Strava for ONE workout. Pure functions: no network here.
 */

export interface LapIn {
  /** metres */
  distance: number;
  /** seconds */
  time: number;
  watts?: number;
}

export interface LabelInput {
  sport: SportKey;
  indoor: boolean;
  race: boolean;
  /** seconds / metres of the whole activity */
  movingTime: number;
  distance: number;
  /** average heart rate, bpm */
  hr?: number;
  /** stream samples (any spacing); `time` in seconds from the start */
  time?: number[];
  watts?: number[];
  speed?: number[];
  laps?: LapIn[];
}

export interface Label {
  label: string;
  /** short technical reason, kept for debugging */
  basis: string;
}

/** Resamples a stream to one value per second (last known value). */
export function perSecond(time: number[], data: number[]): number[] {
  if (time.length === 0) return [];
  const n = Math.floor(time[time.length - 1]) + 1;
  const out = new Array<number>(n);
  let j = 0;
  for (let i = 0; i < n; i++) {
    while (j < time.length - 1 && time[j + 1] <= i) j++;
    out[i] = data[j] ?? 0;
  }
  return out;
}

/** Centered moving average. */
function smooth(x: number[], win: number): number[] {
  const out = new Array<number>(x.length);
  let sum = 0;
  const half = Math.floor(win / 2);
  const prefix = [0];
  for (const v of x) prefix.push(prefix[prefix.length - 1] + v);
  for (let i = 0; i < x.length; i++) {
    const a = Math.max(0, i - half);
    const b = Math.min(x.length, i + half + 1);
    sum = prefix[b] - prefix[a];
    out[i] = sum / (b - a);
  }
  return out;
}

interface Block {
  start: number;
  end: number;
}

/** Stretches where `x[i] >= level`, merging gaps up to `gap` seconds and keeping those of at least `min` seconds. */
function blocks(x: number[], level: number, min: number, gap: number): Block[] {
  const raw: Block[] = [];
  let start = -1;
  for (let i = 0; i <= x.length; i++) {
    const on = i < x.length && x[i] >= level;
    if (on && start < 0) start = i;
    if (!on && start >= 0) {
      raw.push({ start, end: i });
      start = -1;
    }
  }
  const merged: Block[] = [];
  for (const b of raw) {
    const last = merged[merged.length - 1];
    if (last && b.start - last.end <= gap) last.end = b.end;
    else merged.push({ ...b });
  }
  return merged.filter((b) => b.end - b.start >= min);
}

const mean = (x: number[]) => (x.length ? x.reduce((s, v) => s + v, 0) / x.length : 0);
const median = (x: number[]) => {
  const s = [...x].sort((a, b) => a - b);
  return s.length ? s[Math.floor(s.length / 2)] : 0;
};
const spread = (x: number[]) => {
  const m = mean(x);
  return m ? Math.sqrt(mean(x.map((v) => (v - m) ** 2))) / m : 0;
};

/** Rounds a duration in seconds to a tidy number of minutes ("3'", "8'", "15'", "20'"). */
function minutes(sec: number): number {
  const m = sec / 60;
  if (m < 10) return Math.max(1, Math.round(m));
  if (m < 30) return Math.round(m / 5) * 5 || 5;
  return Math.round(m / 10) * 10;
}

const REP_DISTANCES = [100, 150, 200, 300, 400, 500, 600, 800, 1000, 1200, 1500, 1600, 2000, 3000, 4000, 5000];
const repDistance = (m: number): number | null => {
  const best = REP_DISTANCES.reduce((a, b) => (Math.abs(b - m) < Math.abs(a - m) ? b : a));
  return Math.abs(best - m) / best <= 0.12 ? best : null;
};
const distText = (m: number) => (m >= 1000 ? `${m / 1000}km` : `${m}m`);

// -------------------------------------------------------------------- bike

function labelRide(i: LabelInput, p: Profile): Label | null {
  const ftp = p.ftp?.value;
  const hours = i.movingTime / 3600;
  const durText = hours >= 2.5 ? "long " : "";

  if (i.race) return { label: "Race", basis: "marked as a race" };

  if (ftp && i.watts && i.time && i.watts.length > 600) {
    const w = perSecond(i.time, i.watts);
    const f60 = smooth(w, 60);
    const f20 = smooth(w, 20);
    const avg = mean(w.filter((v) => v > 0));
    if (avg > 0) {
      const sweet = blocks(f60, 0.85 * ftp, 240, 60);
      if (sweet.length > 0) {
        const ratios = sweet.map((b) => mean(w.slice(b.start, b.end)) / ftp);
        const r = mean(ratios);
        const dur = minutes(median(sweet.map((b) => b.end - b.start)));
        const type = r >= 1.06 ? "VO2max" : r >= 0.95 ? "Threshold" : "Sweet Spot";
        const n = sweet.length;
        return { label: n > 1 ? `${type} ${n}x${dur}'` : `${type} ${dur}'`, basis: `${n} block(s) at ${(r * 100).toFixed(0)}% of FTP` };
      }
      const bursts = blocks(f20, 1.2 * ftp, 20, 15);
      if (bursts.length >= 5) return { label: `Anaerobic ${bursts.length}x${minutes(median(bursts.map((b) => b.end - b.start))) || 1}'`, basis: `${bursts.length} efforts above 120% of FTP` };

      // steady ride: normalized power over FTP
      const np = Math.pow(mean(smooth(w, 30).map((v) => v ** 4)), 0.25);
      const f = np / ftp;
      if (f < 0.55) return { label: "Recovery spin", basis: `IF ${f.toFixed(2)}` };
      if (f < 0.76) return { label: hours >= 2.5 ? "Long Z2 ride" : hours < 0.75 ? "Easy spin" : "Z2 endurance ride", basis: `IF ${f.toFixed(2)}` };
      if (f < 0.88) return { label: `${hours >= 2 ? "Long " : ""}Tempo ride`.replace(/^Long Tempo/, "Long tempo"), basis: `IF ${f.toFixed(2)}` };
      if (f < 0.95) return { label: "Sweet Spot ride", basis: `IF ${f.toFixed(2)}` };
      return { label: "Threshold ride", basis: `IF ${f.toFixed(2)}` };
    }
  }

  // no usable power: heart rate decides
  const lthr = p.lthr?.value;
  if (i.hr && lthr) {
    const r = i.hr / (lthr * 0.96);
    if (r < 0.8) return { label: i.movingTime < 2700 ? "Easy spin" : `${durText}Z2 endurance ride`.trim(), basis: `HR ${(r * 100).toFixed(0)}% of bike LTHR` };
    if (r < 0.92) return { label: "Tempo ride", basis: `HR ${(r * 100).toFixed(0)}% of bike LTHR` };
    return { label: "Hard ride", basis: `HR ${(r * 100).toFixed(0)}% of bike LTHR` };
  }
  return { label: hours >= 2.5 ? "Long ride" : "Ride", basis: "no power or heart rate" };
}

// --------------------------------------------------------------------- run

function labelRun(i: LabelInput, p: Profile): Label | null {
  const thr = p.run_threshold_pace?.value; // s/km
  const km = i.distance / 1000;
  if (km < 0.5) return null;

  if (i.race) {
    const names: [number, number, string][] = [[4.6, 5.5, "5K"], [9.3, 10.8, "10K"], [20.5, 22, "Half marathon"], [41, 43.5, "Marathon"]];
    const hit = names.find(([a, b]) => km >= a && km <= b);
    return { label: hit ? `${hit[2]} race` : "Race", basis: "marked as a race" };
  }

  const avgSpeed = i.distance / Math.max(1, i.movingTime);
  const vt = thr ? 1000 / thr : null;

  if (vt && i.speed && i.time && i.speed.length > 300) {
    const v = smooth(perSecond(i.time, i.speed), 15);
    const reps = blocks(v, 0.95 * vt, 25, 8);
    if (reps.length >= 1) {
      const dist = reps.map((b) => v.slice(b.start, b.end).reduce((s, x) => s + x, 0));
      const dur = reps.map((b) => b.end - b.start);
      const rv = mean(reps.map((b, k) => dist[k] / dur[k])) / vt;
      const same = reps.length >= 3 && spread(dist) < 0.3;
      const longBlock = Math.max(...dur) >= 12 * 60;
      const tag = rv >= 1.12 ? "Speed" : rv >= 1.04 ? "VO2" : rv >= 0.98 ? "Threshold" : "Tempo";
      if (same && !longBlock) {
        const rd = repDistance(median(dist));
        const n = reps.length;
        return { label: rd ? `${n}x${distText(rd)} ${tag}` : `${n}x${minutes(median(dur))}' ${tag}`, basis: `${n} reps at ${(rv * 100).toFixed(0)}% of threshold speed` };
      }
      if (longBlock) {
        const longTag = rv < 0.98 ? "Tempo" : rv <= 1.05 ? "Threshold" : "Hard steady";
        return { label: `${longTag} ${minutes(Math.max(...dur))}'`, basis: `continuous block at ${(rv * 100).toFixed(0)}% of threshold speed` };
      }
      if (reps.length >= 2 && same === false && spread(dur) < 0.5) return { label: `${reps.length}x${minutes(median(dur))}' ${tag}`, basis: `${reps.length} similar-length efforts` };
    }
  }

  if (i.laps && i.laps.length >= 5 && vt) {
    const fast = i.laps.filter((l) => l.distance >= 150 && l.time > 0 && l.distance / l.time >= 1.0 * vt);
    if (fast.length >= 3 && spread(fast.map((l) => l.distance)) < 0.15) {
      const rd = repDistance(median(fast.map((l) => l.distance)));
      const rv = mean(fast.map((l) => l.distance / l.time)) / vt;
      const tag = rv >= 1.12 ? "Speed" : rv >= 1.04 ? "VO2" : "Threshold";
      if (rd) return { label: `${fast.length}x${distText(rd)} ${tag}`, basis: `${fast.length} fast laps` };
    }
  }

  // steady run
  const r = vt ? avgSpeed / vt : null;
  if (km >= 18 || i.movingTime >= 90 * 60) return { label: "Long run", basis: `${km.toFixed(1)} km` };
  if (i.movingTime < 15 * 60 && (r === null || r < 0.9)) return { label: "Short easy jog", basis: "under 15 minutes" };
  if (r === null) return { label: "Run", basis: "no threshold pace" };
  if (r < 0.78) return { label: "Recovery run", basis: `${(r * 100).toFixed(0)}% of threshold speed` };
  if (r < 0.9) return { label: "Easy run", basis: `${(r * 100).toFixed(0)}% of threshold speed` };
  if (r < 0.96) return { label: "Steady run", basis: `${(r * 100).toFixed(0)}% of threshold speed` };
  return { label: "Tempo run", basis: `${(r * 100).toFixed(0)}% of threshold speed` };
}

// -------------------------------------------------------------------- swim

function labelSwim(i: LabelInput, p: Profile): Label | null {
  const css = p.css?.value; // s/100m
  const vcss = css ? 100 / css : null;
  if (i.distance < 200) return null;
  if (i.race) return { label: "Open-water race", basis: "marked as a race" };

  const laps = (i.laps ?? []).filter((l) => l.distance >= 25 && l.time > 0);
  if (laps.length >= 5) {
    // the most common rounded distance
    const counts = new Map<number, LapIn[]>();
    for (const l of laps) {
      const d = Math.round(l.distance / 25) * 25;
      counts.set(d, [...(counts.get(d) ?? []), l]);
    }
    const [d, group] = [...counts.entries()].sort((a, b) => b[1].length - a[1].length || b[0] - a[0])[0];
    if (group.length >= 4 && d >= 50 && group.length * d >= 0.4 * i.distance) {
      const v = mean(group.map((l) => l.distance / l.time));
      const r = vcss ? v / vcss : null;
      const tag = r === null ? "" : r >= 1.06 ? " Speed" : r >= 1.0 ? " CSS" : r >= 0.9 ? " Threshold-" : " Aerobic";
      return { label: `${group.length}x${distText(d)}${tag}`.replace("Threshold-", "Steady"), basis: `${group.length} laps of ~${d} m` };
    }
  }

  const km = i.distance / 1000;
  const v = i.distance / Math.max(1, i.movingTime);
  const r = vcss ? v / vcss : null;
  if (km >= 3) return { label: "Long endurance swim", basis: `${km.toFixed(1)} km` };
  if (r !== null && r >= 0.97) return { label: "Hard swim", basis: `${(r * 100).toFixed(0)}% of CSS` };
  return { label: km < 1.2 ? "Easy swim" : "Endurance swim", basis: `${km.toFixed(1)} km` };
}

export function classify(input: LabelInput, profile: Profile): Label | null {
  switch (input.sport) {
    case "ride":
      return labelRide(input, profile);
    case "run":
      return labelRun(input, profile);
    case "swim":
      return labelSwim(input, profile);
    case "strength":
      return { label: "Strength", basis: "strength session" };
    default:
      return null;
  }
}
