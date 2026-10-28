/**
 * Daily check-in: a 20-second morning form plus what the watch measured overnight, turned into a readiness signal.
 * Pure (no database, no network): the server, the pages and the tests share it.
 */

export type Source = "garmin" | "intervals" | "manual";
export type Signal = "green" | "yellow" | "red";
export type HrvStatus = "balanced" | "unbalanced" | "low" | "poor";

export const PAIN_SPOTS = ["calf", "achilles", "shin", "knee", "hamstring", "hip", "back", "shoulder", "foot", "other"] as const;
export type PainSpot = (typeof PAIN_SPOTS)[number];

export interface Pain {
  location: PainSpot;
  /** 0 to 10 */
  score: number;
  /** the pain changes the running stride: always a red signal */
  stride?: boolean;
}

/** The fields that can come from a watch (import) or be typed (manual always wins). */
export const MEASURED = ["wakeTime", "sleepHours", "sleepScore", "restingHR", "hrv", "hrvStatus", "trainingReadiness"] as const;
export type MeasuredField = (typeof MEASURED)[number];

export interface Checkin {
  /** YYYY-MM-DD (America/Sao_Paulo) */
  day: string;
  wakeTime?: string;
  sleepHours?: number;
  sleepSource?: "watch" | "manual";
  sleepScore?: number;
  restingHR?: number;
  /** overnight average rMSSD, ms */
  hrv?: number;
  hrvStatus?: HrvStatus;
  trainingReadiness?: number;
  /** 1 to 5 */
  legs?: number;
  /** 1 to 5 */
  energy?: number;
  pain: Pain[];
  notes?: string;
  /** where each field came from */
  sources: Partial<Record<string, Source>>;
}

export interface Baseline {
  /** days with a value in the window (7 needed) */
  n: number;
  ready: boolean;
  mean: number;
  sd: number;
}

export interface Baselines {
  restingHR: Baseline | null;
  /** of ln(rMSSD) */
  lnHrv: Baseline | null;
}

/** One reason behind the signal, as an English template plus its values (the page translates it). */
export interface Reason {
  level: "flag" | "red";
  text: string;
  vars?: Record<string, string | number>;
}

export interface SignalResult {
  signal: Signal;
  reasons: Reason[];
  baselines: Baselines;
}

const DAY = 86_400_000;
const addDays = (key: string, n: number) => new Date(Date.parse(key + "T00:00:00Z") + n * DAY).toISOString().slice(0, 10);
export const BASELINE_DAYS = 7;

function stats(values: number[]): Baseline | null {
  if (values.length === 0) return null;
  const mean = values.reduce((s, x) => s + x, 0) / values.length;
  const sd = values.length > 1 ? Math.sqrt(values.reduce((s, x) => s + (x - mean) ** 2, 0) / (values.length - 1)) : 0;
  return { n: values.length, ready: values.length >= BASELINE_DAYS, mean, sd };
}

/**
 * Rolling baselines for a day: mean and standard deviation of resting HR and of ln(rMSSD) over the 7 days before it
 * (today excluded). "ready" only with all 7 days measured.
 */
export function baselines(history: Checkin[], day: string): Baselines {
  const from = addDays(day, -BASELINE_DAYS);
  const window = history.filter((c) => c.day >= from && c.day < day);
  return {
    restingHR: stats(window.map((c) => c.restingHR).filter((v): v is number => typeof v === "number" && v > 0)),
    lnHrv: stats(window.map((c) => c.hrv).filter((v): v is number => typeof v === "number" && v > 0).map(Math.log)),
  };
}

const fmtH = (h: number) => `${Math.floor(h)}h${String(Math.round((h % 1) * 60)).padStart(2, "0")}`;

/** HRV below the normal range: ln(rMSSD) under the baseline mean minus one standard deviation. */
function hrvLow(c: Checkin | undefined, b: Baseline | null): boolean {
  return !!c?.hrv && !!b?.ready && Math.log(c.hrv) < b.mean - b.sd;
}
function rhrDelta(c: Checkin | undefined, b: Baseline | null): number | null {
  return c?.restingHR && b?.ready ? c.restingHR - b.mean : null;
}

/**
 * The readiness signal of a day.
 * Green: HRV in range, resting HR at most +3 over baseline, 8 h of sleep or more, legs 3 or more, no pain of 4 or more.
 * Yellow: exactly one flag (resting HR +4 to +6, HRV below range for one day, sleep 6.5 to 8 h, legs 2, energy 2,
 * pain 3 to 4). Red: two or more flags, resting HR +7 or more two days in a row, HRV below range two days in a row,
 * sleep under 6.5 h, legs 1, pain 5 or more, or a pain that changes the stride.
 * Returns null when nothing was measured or typed for the day.
 */
export function readiness(today: Checkin, history: Checkin[]): SignalResult | null {
  const hasData =
    today.restingHR != null || today.hrv != null || today.sleepHours != null || today.legs != null || today.energy != null || today.pain.length > 0;
  if (!hasData) return null;

  const b = baselines(history, today.day);
  const yesterday = history.find((c) => c.day === addDays(today.day, -1));
  const bYesterday = baselines(history, addDays(today.day, -1));
  const reasons: Reason[] = [];
  const flag = (text: string, vars?: Reason["vars"]) => reasons.push({ level: "flag", text, vars });
  const red = (text: string, vars?: Reason["vars"]) => reasons.push({ level: "red", text, vars });

  // resting heart rate against the baseline
  const d = rhrDelta(today, b.restingHR);
  if (d !== null) {
    const vars = { bpm: Math.round(today.restingHR!), delta: Math.round(d) };
    const dy = rhrDelta(yesterday, bYesterday.restingHR);
    if (d >= 7 && dy !== null && dy >= 7) red("Resting HR {bpm} (+{delta} vs baseline) for 2 days in a row", vars);
    else if (d >= 4) flag("Resting HR {bpm} (+{delta} vs baseline)", vars);
  }

  // HRV against its normal range
  if (hrvLow(today, b.lnHrv)) {
    const vars = { ms: Math.round(today.hrv!) };
    if (hrvLow(yesterday, bYesterday.lnHrv)) red("HRV {ms} ms below your normal range 2 days in a row", vars);
    else flag("HRV {ms} ms below your normal range", vars);
  }

  // sleep
  if (today.sleepHours != null) {
    const vars = { sleep: fmtH(today.sleepHours) };
    if (today.sleepHours < 6.5) red("Sleep {sleep}", vars);
    else if (today.sleepHours < 8) flag("Sleep {sleep}", vars);
  }

  // how the body feels
  if (today.legs === 1) red("Legs 1 of 5");
  else if (today.legs === 2) flag("Legs 2 of 5");
  if (today.energy != null && today.energy <= 2) flag("Energy {n} of 5", { n: today.energy });

  // pain: the worst spot decides
  for (const p of today.pain) {
    const vars = { spot: p.location, score: p.score };
    if (p.stride) red("Pain in the {spot} changes your stride", vars);
    else if (p.score >= 5) red("Pain {score}/10 in the {spot}", vars);
    else if (p.score >= 3) flag("Pain {score}/10 in the {spot}", vars);
  }

  const reds = reasons.filter((r) => r.level === "red").length;
  const flags = reasons.filter((r) => r.level === "flag").length;
  const signal: Signal = reds > 0 || flags >= 2 ? "red" : flags === 1 ? "yellow" : "green";
  return { signal, reasons, baselines: b };
}

export const ACTION: Record<Signal, string> = {
  green: "Train as planned.",
  yellow: "Key session at the low end of targets, shorter sauna, nap if you can.",
  red: "Swap the key session for easy, or rest. Missed easy work is never made up.",
};

/**
 * Merges imported values into the stored check-in: a field typed by hand is never overwritten.
 * `imported` holds the values from one provider.
 */
export function mergeImport(stored: Checkin | null, day: string, imported: Partial<Record<MeasuredField, unknown>>, source: Exclude<Source, "manual">): Checkin {
  const base: Checkin = stored ?? { day, pain: [], sources: {} };
  const next: Checkin = { ...base, sources: { ...base.sources } };
  for (const f of MEASURED) {
    const v = imported[f];
    if (v === undefined || v === null || v === "") continue;
    if (base.sources[f] === "manual") continue;
    (next as unknown as Record<string, unknown>)[f] = v;
    next.sources[f] = source;
  }
  if (next.sources.sleepHours && next.sources.sleepHours !== "manual") next.sleepSource = "watch";
  return next;
}

const clampInt = (v: unknown, lo: number, hi: number) => (v == null || v === "" ? undefined : Number.isInteger(Number(v)) && Number(v) >= lo && Number(v) <= hi ? Number(v) : NaN);
const clampNum = (v: unknown, lo: number, hi: number) => (v == null || v === "" ? undefined : Number(v) >= lo && Number(v) <= hi ? Number(v) : NaN);

/**
 * Cleans what the page sends. Every field present in `input` counts as typed by hand (source "manual");
 * fields left out keep their stored value and source. Returns null when a value is out of range.
 */
export function applyManual(stored: Checkin | null, day: string, input: Record<string, unknown>): Checkin | null {
  const next: Checkin = { ...(stored ?? { day, pain: [], sources: {} }), day };
  next.sources = { ...next.sources };
  const set = (field: keyof Checkin, value: unknown) => {
    if (value === undefined) return true;
    if (typeof value === "number" && Number.isNaN(value)) return false;
    (next as unknown as Record<string, unknown>)[field] = value;
    next.sources[field] = "manual";
    return true;
  };
  const ok = [
    !("wakeTime" in input) || (typeof input.wakeTime === "string" && /^\d{1,2}:\d{2}$/.test(input.wakeTime) ? set("wakeTime", input.wakeTime) : input.wakeTime === null ? set("wakeTime", undefined) : false),
    !("sleepHours" in input) || set("sleepHours", clampNum(input.sleepHours, 0, 16)),
    !("sleepScore" in input) || set("sleepScore", clampNum(input.sleepScore, 0, 100)),
    !("restingHR" in input) || set("restingHR", clampNum(input.restingHR, 25, 120)),
    !("hrv" in input) || set("hrv", clampNum(input.hrv, 5, 300)),
    !("hrvStatus" in input) || (input.hrvStatus == null || ["balanced", "unbalanced", "low", "poor"].includes(String(input.hrvStatus)) ? set("hrvStatus", input.hrvStatus ?? undefined) : false),
    !("trainingReadiness" in input) || set("trainingReadiness", clampNum(input.trainingReadiness, 0, 100)),
    !("legs" in input) || set("legs", clampInt(input.legs, 1, 5)),
    !("energy" in input) || set("energy", clampInt(input.energy, 1, 5)),
  ];
  if (ok.includes(false)) return null;
  if ("sleepHours" in input) next.sleepSource = "manual";
  if ("pain" in input) {
    if (!Array.isArray(input.pain)) return null;
    const pain: Pain[] = [];
    for (const p of input.pain as Partial<Pain>[]) {
      if (!PAIN_SPOTS.includes(p?.location as PainSpot)) return null;
      const score = Number(p.score);
      if (!(score >= 0 && score <= 10)) return null;
      pain.push({ location: p.location as PainSpot, score: Math.round(score), stride: p.stride ? true : undefined });
    }
    next.pain = pain;
    next.sources.pain = "manual";
  }
  if ("notes" in input) next.notes = typeof input.notes === "string" && input.notes.trim() ? input.notes.trim().slice(0, 1000) : undefined;
  return next;
}
