import type { Reason, Signal, SignalResult } from "@/lib/checkin";
import { CONTEXT_CONFIG, type EventType, type RedFlag } from "@/lib/context-config";

/**
 * The signal side of the Context Log. Pure: the server, the pages and the tests use the same rules.
 *
 * Open events and their follow-up answers can only KEEP or LOWER the signal of the check-in, never raise it: the
 * final signal is the worst of the check-in rules and the event rules. Every thing that lowers it comes with a
 * one-line reason. Thresholds live in lib/context-config.ts.
 */

export interface CtxEvent {
  id: number;
  type: EventType;
  bodyArea?: string;
  severity: number;
  /** only what the athlete said */
  causeStated?: string;
  tags: string[];
  /** YYYY-MM-DD of the day the event started */
  startDate: string;
  status: "open" | "closed";
}

export interface CtxFollowup {
  eventId: number;
  /** YYYY-MM-DD */
  date: string;
  score: number;
  trend: "worse" | "same" | "better";
  redFlags: RedFlag[];
}

/** A line that explains why the signal is what it is (an English template and its values: the page translates it). */
export interface CtxReason {
  /** "yellow" and "red" lowered the signal; "note" is information (a cap on intensity, a doctor prompt) */
  level: "yellow" | "red" | "note";
  text: string;
  vars?: Record<string, string | number>;
}

export interface EventSignal {
  /** the lowest signal the events ask for, or null when they ask for nothing */
  signal: Exclude<Signal, "green"> | "green" | null;
  reasons: CtxReason[];
  /** a red flag was checked: show the medical message */
  medical: boolean;
}

const DAY = 86_400_000;
const days = (a: string, b: string) => Math.round((Date.parse(b + "T00:00:00Z") - Date.parse(a + "T00:00:00Z")) / DAY);
const rank = (s: Signal | null) => (s === "red" ? 3 : s === "yellow" ? 2 : s === "green" ? 1 : 0);

/** The name of the thing that hurts, for the sentence: the body area, or the event type. */
export function eventLabel(e: Pick<CtxEvent, "bodyArea" | "type">): string {
  if (e.bodyArea && e.bodyArea !== "other") return e.bodyArea;
  return { GI: "stomach", illness: "illness", injury_pain: "pain", fatigue: "fatigue", sleep: "sleep", stress: "stress", travel: "travel", other: "event" }[e.type];
}

/** How many days the event has been open, counting the day it started (the day it started is day 1). */
export const openDays = (e: Pick<CtxEvent, "startDate">, day: string) => Math.max(1, days(e.startDate, day) + 1);

/** The signal one answer asks for. Above normalFrom and not worse: nothing. */
export function levelOfAnswer(score: number, trend: CtxFollowup["trend"], redFlags: RedFlag[]): { signal: Signal | null; cap: boolean } {
  const r = CONTEXT_CONFIG.recovery;
  if (redFlags.length > 0) return { signal: "red", cap: false };
  if (score < r.yellowFrom) return { signal: "red", cap: false };
  if (score < r.capFrom || trend === "worse") return { signal: "yellow", cap: false };
  if (score < r.normalFrom) return { signal: "green", cap: true };
  return { signal: null, cap: false };
}

/**
 * The signal the open events ask for on a day. Per event: the answer of that day, else the latest earlier answer,
 * else (no answer yet) the severity it was written with.
 */
export function eventSignal(events: CtxEvent[], followups: CtxFollowup[], day: string): EventSignal {
  let worst: Signal | null = null;
  const reasons: CtxReason[] = [];
  let medical = false;

  for (const e of events) {
    if (e.status !== "open" || e.startDate > day) continue;
    const label = eventLabel(e);
    const mine = followups.filter((f) => f.eventId === e.id && f.date <= day).sort((a, b) => (a.date < b.date ? -1 : 1));
    const last = mine[mine.length - 1];
    let level: Signal | null = null;
    let cap = false;

    if (last) {
      const l = levelOfAnswer(last.score, last.trend, last.redFlags);
      level = l.signal;
      cap = l.cap;
      if (last.redFlags.length > 0) medical = true;
      if (level === "yellow" || level === "red") {
        reasons.push({ level, text: last.redFlags.length ? "{area} red flag checked after the {date} event" : "{area} recovery is {score}/10 after the {date} event", vars: { area: label, score: last.score, date: e.startDate } });
      } else if (cap) {
        reasons.push({ level: "note", text: "{area} recovery is {score}/10: cap the intensity of the next key session", vars: { area: label, score: last.score } });
      }
    } else {
      const s = CONTEXT_CONFIG.severityBeforeFirstAnswer[e.severity] ?? null;
      if (s) {
        level = s;
        reasons.push({ level: s, text: "{area} event of {date} (severity {sev}/5), no follow-up answer yet", vars: { area: label, date: e.startDate, sev: e.severity } });
      }
    }
    if (rank(level) > rank(worst)) worst = level;

    if (openDays(e, day) >= CONTEXT_CONFIG.doctorAfterOpenDays) {
      reasons.push({ level: "note", text: "{area} has been open for {n} days: consider seeing a doctor", vars: { area: label, n: openDays(e, day) } });
    }
  }
  return { signal: worst, reasons, medical };
}

/**
 * The final signal: the worst of the check-in and the events, never better than the check-in. `base` is the result
 * of the existing check-in rules (null when nothing was entered).
 */
export function finalSignal(base: SignalResult | null, ev: EventSignal): { signal: Signal | null; reasons: Reason[]; ctxReasons: CtxReason[]; medical: boolean; lowered: boolean } {
  const b = base?.signal ?? null;
  const e = ev.signal;
  const signal = rank(e) > rank(b) ? e : b;
  const lowered = rank(e) > rank(b);
  // an event with nothing to say about the day leaves a missing check-in as it is
  return { signal: signal ?? null, reasons: base?.reasons ?? [], ctxReasons: ev.reasons, medical: ev.medical, lowered };
}

/** The open events that still need an answer today (none was given for `day`), oldest first. */
export function dueFollowups(events: CtxEvent[], followups: CtxFollowup[], day: string): CtxEvent[] {
  return events
    // the question is for the NEXT morning: the day of the event itself is covered by its severity
    .filter((e) => e.status === "open" && e.startDate < day)
    .filter((e) => !followups.some((f) => f.eventId === e.id && f.date === day))
    .sort((a, b) => (a.startDate < b.startDate ? -1 : 1));
}

/**
 * Whether the event closes by itself: the score at or above closeAtScore on `closeAfterConsecutiveDays` consecutive
 * days (calendar days, none missing), with no red flag and no worsening trend.
 */
export function shouldClose(followups: CtxFollowup[]): boolean {
  const need = CONTEXT_CONFIG.closeAfterConsecutiveDays;
  const good = followups
    .filter((f) => f.score >= CONTEXT_CONFIG.closeAtScore && f.trend !== "worse" && f.redFlags.length === 0)
    .map((f) => f.date)
    .sort();
  for (let i = good.length - 1; i >= need - 1; i--) {
    let ok = true;
    for (let k = 1; k < need; k++) if (days(good[i - k], good[i - k + 1]) !== 1) ok = false;
    if (ok) return true;
  }
  return false;
}

/** The one line that says why the signal is lowered, e.g. "Yellow because stomach recovery is 6/10 after the 2026-10-30 event." */
export function reasonLine(t: (k: string, v?: Record<string, string | number>) => string, signal: Signal, r: CtxReason, dateLabel?: (iso: string) => string): string {
  const level = t(signal === "green" ? "Green" : signal === "yellow" ? "Yellow" : "Red");
  const vars = { ...r.vars } as Record<string, string | number>;
  if (vars.area !== undefined) vars.area = t(String(vars.area));
  if (typeof vars.date === "string" && dateLabel) vars.date = dateLabel(vars.date);
  const why = t(r.text, vars);
  return t("{level} because {why}.", { level, why });
}
