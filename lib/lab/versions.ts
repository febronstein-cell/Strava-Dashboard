import { HAS_DISTANCE, PLAN_SPORTS, emptyDays, slotFilled, totals } from "./plan";
import type { PlanDay, PlanSlot, PlanSport } from "./types";

/**
 * Plan A / B / C of a week. Plan A is the week as first designed; Plan B a deliberate change; Plan C a change forced
 * by something that happened (linked to a Log event). One version is active at a time and each switch has an
 * effective-from date: every day is judged against the version in force on that day (its plan of record). Pure.
 */

export type VersionLabel = "A" | "B" | "C";
export type VersionStatus = "draft" | "active" | "superseded";

export interface PlanVersion {
  id: number;
  weekStart: string;
  label: VersionLabel;
  status: VersionStatus;
  parentId: number | null;
  createdAt: string;
  activatedAt: string | null;
  effectiveFrom: string | null;
  reason: string | null;
  logEventId: number | null;
  weekLabel: string | null;
  targetHours: number | null;
  days: PlanDay[];
}

export interface SessionMove {
  id: number;
  versionId: number;
  sessionId: string;
  fromDate: string;
  toDate: string;
  createdAt: string;
}

export const addDays = (key: string, n: number) => new Date(Date.parse(key + "T00:00:00Z") + n * 86_400_000).toISOString().slice(0, 10);

/** Gives every filled session an id that is unique in the week (kept ids stay as they are). */
export function withIds(days: PlanDay[], prefix = "s"): PlanDay[] {
  const used = new Set<string>();
  for (const d of days) for (const s of d.slots) if (s.id) used.add(s.id);
  let n = 0;
  const next = () => {
    let id: string;
    do id = `${prefix}${d36(n++)}`;
    while (used.has(id));
    used.add(id);
    return id;
  };
  return days.map((d) => ({
    ...d,
    slots: d.slots.map((s) => {
      if (!slotFilled(s)) {
        const { id: _drop, ...rest } = s;
        void _drop;
        return rest;
      }
      return s.id ? s : { ...s, id: next() };
    }),
  }));
}
const d36 = (n: number) => n.toString(36);

/** The versions that were really in force at some point (drafts never count), in the order they were switched on. */
export function inForce(versions: PlanVersion[]): PlanVersion[] {
  return versions
    .filter((v) => v.status !== "draft" && v.activatedAt && v.effectiveFrom)
    .sort((a, b) => (a.activatedAt as string).localeCompare(b.activatedAt as string) || a.id - b.id);
}

/** The version of record for one day: the last one switched on whose effective-from date is on or before that day. */
export function versionOn(versions: PlanVersion[], date: string): PlanVersion | null {
  const list = inForce(versions);
  let out: PlanVersion | null = null;
  for (const v of list) if ((v.effectiveFrom as string) <= date) out = v;
  return out ?? list[0] ?? null;
}

export const activeVersion = (versions: PlanVersion[]): PlanVersion | null => versions.find((v) => v.status === "active") ?? null;

/**
 * The plan of record of the week: each day taken from the version in force on that day. Past days keep the plan they
 * were lived under; days ahead follow the active version. Also says which version each day comes from.
 */
export function recordDays(versions: PlanVersion[], weekStart: string): { days: PlanDay[]; from: (PlanVersion | null)[] } {
  const from = Array.from({ length: 7 }, (_, i) => versionOn(versions, addDays(weekStart, i)));
  const days = from.map((v, i) => (v?.days[i] ? { ...v.days[i], day: i } : emptyDays()[i]));
  return { days, from };
}

/** The name the tabs show: "A", "B", "C", and "B2", "C2"... when a label was used more than once. */
export function tabNames(versions: PlanVersion[]): Record<number, string> {
  const seen: Record<string, number> = {};
  const out: Record<number, string> = {};
  for (const v of [...versions].sort((a, b) => a.createdAt.localeCompare(b.createdAt) || a.id - b.id)) {
    seen[v.label] = (seen[v.label] ?? 0) + 1;
    out[v.id] = seen[v.label] > 1 ? `${v.label}${seen[v.label]}` : v.label;
  }
  return out;
}

// ---------------------------------------------------------------- changes inside a version

/** Moves one session to another day of the same version. Returns null when the session is not found. */
export function moveSession(days: PlanDay[], sessionId: string, toDay: number): { days: PlanDay[]; fromDay: number } | null {
  let fromDay = -1;
  let moved: PlanSlot | null = null;
  const out = days.map((d) => ({ ...d, slots: d.slots.map((s) => ({ ...s })) }));
  for (const d of out) {
    const i = d.slots.findIndex((s) => s.id === sessionId);
    if (i < 0) continue;
    moved = d.slots[i];
    fromDay = d.day;
    // the five fixed slots stay (emptied); a second session of a sport (a double) is taken out
    const fixed = d.slots.findIndex((s) => s.sport === moved?.sport) === i;
    if (fixed) d.slots[i] = { sport: moved.sport, description: "", minutes: null, km: null };
    else d.slots.splice(i, 1);
  }
  if (!moved || fromDay === toDay || toDay < 0 || toDay > 6) return null;
  const target = out[toDay];
  target.rest = undefined;
  const free = target.slots.findIndex((s) => s.sport === moved.sport && !slotFilled(s));
  if (free >= 0) target.slots[free] = moved;
  else if (target.slots.length < 10) target.slots.push(moved);
  else return null;
  return { days: out, fromDay };
}

/** Swaps two whole days of a version. Returns the sessions that changed day. */
export function swapDays(days: PlanDay[], a: number, b: number): { days: PlanDay[]; moved: { sessionId: string; from: number; to: number }[] } {
  const out = days.map((d) => ({ ...d }));
  const da = { ...days[a], day: b };
  const db = { ...days[b], day: a };
  out[a] = db;
  out[b] = da;
  const ids = (d: PlanDay) => d.slots.filter((s) => s.id && slotFilled(s)).map((s) => s.id as string);
  return { days: out, moved: [...ids(days[a]).map((sessionId) => ({ sessionId, from: a, to: b })), ...ids(days[b]).map((sessionId) => ({ sessionId, from: b, to: a }))] };
}

const INTENSITY = /\b(test|tests|ftp|css|vo2|threshold|tempo|interval|intervals|sweet|race pace|brick|strong|sprint|hill|hills|repeats|fartlek|3k|5k|10k|z4|z5|limiar|tiro|tiros)\b|\d+\s*x\s*\d/i;

/** A session counts as intensity when it is flagged as key or its name or description reads like hard work. */
export const isIntensity = (s: PlanSlot): boolean => slotFilled(s) && (Boolean(s.key) || INTENSITY.test(`${s.name ?? ""} ${s.description}`));

/**
 * The "Convert intensity to Z1" helper of a draft: from that day on, every key or intensity session becomes an easy
 * session of the chosen length (same sport, distance cleared). Only a suggestion: the draft can still be edited.
 */
export function intensityToEasy(days: PlanDay[], fromDay: number, minutes: number): { days: PlanDay[]; changed: number } {
  let changed = 0;
  const out = days.map((d) =>
    d.day < fromDay
      ? d
      : {
          ...d,
          slots: d.slots.map((s) => {
            if (!isIntensity(s)) return s;
            changed++;
            const easy: PlanSlot = { id: s.id, sport: s.sport, name: `Easy Z1 ${minutes}'`, description: `Easy Z1, conversational. Replaces: ${s.name || s.description.slice(0, 60)}`, minutes, km: null };
            return easy;
          }),
        },
  );
  return { days: out, changed };
}

// ---------------------------------------------------------------- change from Plan A

export interface SessionChange {
  id: string;
  sport: PlanSport;
  name: string;
  key: boolean;
  /** day in Plan A (0 = Monday) and day in the plan of record (null when removed) */
  dayA: number;
  dayNow: number | null;
  minutesA: number;
  minutesNow: number;
  kmA: number;
  kmNow: number;
  kind: "removed" | "changed" | "moved";
}

export interface ChangeFromA {
  /** false when the week never left Plan A */
  changed: boolean;
  hoursA: number;
  hoursNow: number;
  kmA: number;
  kmNow: number;
  bySport: Record<PlanSport, { minutesA: number; minutesNow: number; kmA: number; kmNow: number }>;
  sessions: SessionChange[];
  /** sessions that are only in the plan of record */
  added: { id: string; sport: PlanSport; name: string; day: number; minutes: number }[];
  switches: { versionId: number; label: VersionLabel; effectiveFrom: string; reason: string | null; logEventId: number | null }[];
}

const nameOf = (s: PlanSlot) => s.name?.trim() || s.description.trim().slice(0, 60) || s.sport;
const filled = (days: PlanDay[]) => days.flatMap((d) => d.slots.filter(slotFilled).map((s) => ({ s, day: d.day })));

/** What the plan of record lost or changed compared with Plan A: hours, km, sessions, and each switch with its reason. */
export function changeFromA(versions: PlanVersion[], weekStart: string): ChangeFromA {
  const list = inForce(versions);
  const a = versions.find((v) => v.label === "A" && v.status !== "draft") ?? list[0] ?? null;
  const now = recordDays(versions, weekStart).days;
  const daysA = a?.days ?? now;
  const tA = totals(daysA);
  const tN = totals(now);
  const bySport = Object.fromEntries(
    PLAN_SPORTS.map((sp) => [sp, { minutesA: tA.bySport[sp].minutes, minutesNow: tN.bySport[sp].minutes, kmA: tA.bySport[sp].km, kmNow: tN.bySport[sp].km }]),
  ) as ChangeFromA["bySport"];

  const nowById = new Map(filled(now).filter((x) => x.s.id).map((x) => [x.s.id as string, x]));
  const sessions: SessionChange[] = [];
  for (const { s, day } of filled(daysA)) {
    const hit = s.id ? nowById.get(s.id) : undefined;
    const base = { id: s.id ?? `${day}-${s.sport}`, sport: s.sport, name: nameOf(s), key: Boolean(s.key) || isIntensity(s), dayA: day, minutesA: s.minutes ?? 0, kmA: HAS_DISTANCE[s.sport] ? (s.km ?? 0) : 0 };
    if (!hit) {
      sessions.push({ ...base, dayNow: null, minutesNow: 0, kmNow: 0, kind: "removed" });
      continue;
    }
    nowById.delete(s.id as string);
    const n = hit.s;
    const same = (n.minutes ?? 0) === (s.minutes ?? 0) && (n.km ?? 0) === (s.km ?? 0) && nameOf(n) === nameOf(s) && n.description.trim() === s.description.trim();
    if (!same) sessions.push({ ...base, dayNow: hit.day, minutesNow: n.minutes ?? 0, kmNow: HAS_DISTANCE[n.sport] ? (n.km ?? 0) : 0, name: nameOf(s), kind: "changed" });
    else if (hit.day !== day) sessions.push({ ...base, dayNow: hit.day, minutesNow: n.minutes ?? 0, kmNow: base.kmA, kind: "moved" });
  }
  const added = [...nowById.values()].map(({ s, day }) => ({ id: s.id as string, sport: s.sport, name: nameOf(s), day, minutes: s.minutes ?? 0 }));
  // new sessions typed in a version without an id are matched by nothing: list them too
  for (const { s, day } of filled(now)) if (!s.id) added.push({ id: `${day}-${s.sport}`, sport: s.sport, name: nameOf(s), day, minutes: s.minutes ?? 0 });

  const switches = list
    .filter((v) => v.id !== a?.id)
    .map((v) => ({ versionId: v.id, label: v.label, effectiveFrom: v.effectiveFrom as string, reason: v.reason, logEventId: v.logEventId }));
  return {
    changed: switches.length > 0 || sessions.length > 0 || added.length > 0,
    hoursA: tA.hours,
    hoursNow: tN.hours,
    kmA: tA.km,
    kmNow: tN.km,
    bySport,
    sessions,
    added,
    switches,
  };
}

/** Plan A of a week that has no versions yet: the days as they are, with session ids. */
export function firstVersionDays(days: PlanDay[]): PlanDay[] {
  return withIds(days, "a");
}

/** A Log event behind a Plan C, with the note in the athlete's own words. */
export interface LinkedEvent {
  id: number;
  type: string;
  status: string;
  severity: number;
  causeStated: string | null;
  note: string | null;
  noteDate: string | null;
}

/** Where the planner should open (set by "Create Plan C from this event" in the Log). */
export const OPEN_WEEK_KEY = "tef_plan_open";
