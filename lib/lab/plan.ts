import type { PlanDay, PlanSlot, PlanSport, PlanStructure, PlanTarget } from "./types";

/** Helpers of the training planner. Pure: used by the page and by the server routes. */

export const DAY_NAMES = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"] as const;

/** The five slots of every day, in this order. "other" is for an extra sport on the same day. */
export const PLAN_SPORTS: readonly PlanSport[] = ["run", "ride", "swim", "strength", "other"];
/** The three main sports also take a distance. */
export const HAS_DISTANCE: Record<PlanSport, boolean> = { run: true, ride: true, swim: true, strength: false, other: false };
/** What each slot is called in the planner. */
export const SPORT_LABEL: Record<PlanSport, string> = { run: "Run", ride: "Bike", swim: "Swim", strength: "Strength", other: "Extra" };

const emptySlots = (): PlanSlot[] => PLAN_SPORTS.map((sport) => ({ sport, description: "", minutes: null, km: null }));
export const emptyDays = (): PlanDay[] => Array.from({ length: 7 }, (_, day) => ({ day, slots: emptySlots() }));

/** "1:30", "1h30", "90", "1.5h" -> minutes (null when empty or not understood). */
export function parseMinutes(text: string): number | null {
  const s = text.trim().toLowerCase().replace(",", ".");
  if (!s) return null;
  let m = s.match(/^(\d+):(\d{1,2})$/) ?? s.match(/^(\d+)\s*h\s*(\d{1,2})?\s*(?:min|m)?$/);
  if (m) return Number(m[1]) * 60 + Number(m[2] ?? 0);
  m = s.match(/^(\d+(?:\.\d+)?)\s*h$/);
  if (m) return Math.round(Number(m[1]) * 60);
  m = s.match(/^(\d+(?:\.\d+)?)\s*(?:min|m)?$/);
  return m ? Math.round(Number(m[1])) : null;
}

/** minutes -> "1:30" */
export const fmtMinutes = (min: number | null): string => (min == null ? "" : `${Math.floor(min / 60)}:${String(Math.round(min % 60)).padStart(2, "0")}`);

/** A slot counts when it has a description, a time or a distance. */
export const slotFilled = (s: PlanSlot): boolean => s.description.trim().length > 0 || !!s.name?.trim() || (s.minutes ?? 0) > 0 || (s.km ?? 0) > 0;
/** The key session among a day's sessions: the one flagged as key, otherwise the longest. */
export function keySession(slots: PlanSlot[]): PlanSlot | null {
  const used = slots.filter(slotFilled);
  return used.find((s) => s.key) ?? [...used].sort((a, b) => (b.minutes ?? 0) - (a.minutes ?? 0))[0] ?? null;
}

/** A day is filled in when it is marked as a rest day or at least one slot is used. */
export const dayFilled = (d: PlanDay): boolean => Boolean(d.rest) || d.slots.some(slotFilled);

/** A week is complete when each of the 7 days is filled in (or marked as a rest day). */
export const isComplete = (days: PlanDay[]): boolean => days.length === 7 && days.every(dayFilled);

export interface SportTotal {
  minutes: number;
  km: number;
  /** slots used in the week */
  sessions: number;
  /** distinct days with this sport */
  days: number;
}

export interface PlanTotals {
  hours: number;
  /** run + bike + swim */
  km: number;
  sessions: number;
  restDays: number;
  /** days with two or more sessions */
  doubleDays: number;
  bySport: Record<PlanSport, SportTotal>;
}

export function totals(days: PlanDay[]): PlanTotals {
  const bySport = Object.fromEntries(PLAN_SPORTS.map((s) => [s, { minutes: 0, km: 0, sessions: 0, days: 0 }])) as Record<PlanSport, SportTotal>;
  let restDays = 0;
  let doubleDays = 0;
  for (const d of days) {
    if (d.rest) {
      restDays++;
      continue;
    }
    let used = 0;
    const sportsToday = new Set<PlanSport>();
    for (const s of d.slots) {
      if (!slotFilled(s)) continue;
      const t = bySport[s.sport];
      t.minutes += s.minutes ?? 0;
      t.km += HAS_DISTANCE[s.sport] ? (s.km ?? 0) : 0;
      t.sessions++;
      if (!sportsToday.has(s.sport)) t.days++;
      sportsToday.add(s.sport);
      used++;
    }
    if (used >= 2) doubleDays++;
  }
  const all = Object.values(bySport);
  return {
    hours: all.reduce((s, x) => s + x.minutes, 0) / 60,
    km: all.reduce((s, x) => s + x.km, 0),
    sessions: all.reduce((s, x) => s + x.sessions, 0),
    restDays,
    doubleDays,
    bySport,
  };
}

/** Fingerprint of the days: tells whether a written analysis still matches what is planned. */
export function planHash(days: PlanDay[]): string {
  const raw = days
    .map((d) => `${d.day}|${d.rest ? "R" : ""}|${d.slots.map((s) => `${s.sport}:${s.description.trim()}:${s.minutes ?? ""}:${s.km ?? ""}${s.name ? `:N${s.name.trim()}` : ""}${s.key ? ":K" : ""}${s.target ? `:${JSON.stringify(s.target)}` : ""}${s.structure ? `:${JSON.stringify(s.structure)}` : ""}`).join(";")}`)
    .join("§");
  let h = 5381;
  for (let i = 0; i < raw.length; i++) h = ((h << 5) + h + raw.charCodeAt(i)) | 0;
  return (h >>> 0).toString(36);
}

const num = (v: unknown): number | null => (v == null || v === "" ? null : Number(v));

/** Five fixed slots plus room for doubles. */
const MAX_SLOTS = 10;
const TARGETS = ["hr-cap", "hr-range", "pace-range", "power-range"];
const pos = (v: unknown, max: number) => (v == null || v === "" ? undefined : Number(v) > 0 && Number(v) <= max ? Number(v) : undefined);

function cleanTarget(t: unknown): PlanTarget | undefined {
  const x = t as Partial<PlanTarget> | null;
  if (!x || !TARGETS.includes(x.type as string)) return undefined;
  const max = x.type === "pace-range" ? 1200 : 3000;
  const out: PlanTarget = { type: x.type as PlanTarget["type"], min: pos(x.min, max), max: pos(x.max, max) };
  if (out.min != null && out.max != null && out.min > out.max) [out.min, out.max] = [out.max, out.min];
  return out.min != null || out.max != null ? out : undefined;
}

function cleanStructure(s: unknown): PlanStructure | undefined {
  const x = s as Partial<PlanStructure> | null;
  if (!x) return undefined;
  const out: PlanStructure = { reps: pos(x.reps, 100), repSeconds: pos(x.repSeconds, 7200), repMeters: pos(x.repMeters, 100000), recoverySeconds: pos(x.recoverySeconds, 3600) };
  if (out.reps != null) out.reps = Math.round(out.reps);
  return Object.values(out).some((v) => v != null) ? out : undefined;
}

/**
 * Reads the days stored in the database (or sent by the browser) into the current shape: 7 days with the 5 slots each.
 * The first version of the planner stored one description/time/distance per day: those become the "extra" slot.
 * Returns null when something is invalid.
 */
export function sanitizeDays(input: unknown): PlanDay[] | null {
  if (!Array.isArray(input) || input.length !== 7) return null;
  const out: PlanDay[] = [];
  for (let i = 0; i < 7; i++) {
    const raw = input[i] as { rest?: unknown; slots?: unknown; description?: unknown; minutes?: unknown; km?: unknown } | null;
    const slots = emptySlots();
    if (Array.isArray(raw?.slots)) {
      const seen = new Set<PlanSport>();
      for (const s of raw.slots as Partial<PlanSlot>[]) {
        if (!PLAN_SPORTS.includes(s?.sport as PlanSport)) continue;
        const sport = s.sport as PlanSport;
        // the first entry of a sport fills its fixed slot; a second one (a double, AM and PM) is added after the five
        let slot = seen.has(sport) ? null : slots.find((x) => x.sport === sport) ?? null;
        if (!slot) {
          if (slots.length >= MAX_SLOTS) continue;
          slot = { sport, description: "", minutes: null, km: null };
          slots.push(slot);
        }
        seen.add(sport);
        const minutes = num(s.minutes);
        const km = HAS_DISTANCE[slot.sport] ? num(s.km) : null;
        if ((minutes !== null && !(minutes >= 0 && minutes <= 1440)) || (km !== null && !(km >= 0 && km <= 1000))) return null;
        slot.description = String(s.description ?? "").slice(0, 600);
        slot.minutes = minutes;
        slot.km = km;
        if (typeof s.name === "string" && s.name.trim()) slot.name = s.name.trim().slice(0, 80);
        if (s.key) slot.key = true;
        const target = cleanTarget(s.target);
        if (target) slot.target = target;
        const structure = cleanStructure(s.structure);
        if (structure) slot.structure = structure;
      }
    } else if (raw && (raw.description || raw.minutes || raw.km)) {
      const extra = slots[slots.length - 1];
      extra.description = String(raw.description ?? "").slice(0, 600);
      extra.minutes = num(raw.minutes);
      extra.km = null;
    }
    out.push({ day: i, rest: raw?.rest ? true : undefined, slots });
  }
  return out;
}
