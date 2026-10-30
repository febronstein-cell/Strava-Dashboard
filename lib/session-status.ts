import type { DayMatch, MatchedEntry } from "@/lib/compliance";
import type { ReasonTag } from "@/lib/context-config";
import type { Activity } from "@/lib/strava/types";

/**
 * The status of each planned session: done, partial, skipped or changed, with the percent done, a reason tag and a
 * note. It starts from Strava (planned against actual elapsed time) and can be overridden by hand or by the Context
 * Log. Pure. A missed easy session is shown as lost and never as something to make up.
 */

export type SessionState = "done" | "partial" | "skipped" | "changed";
export type EffectiveState = SessionState | "pending";

/** A stored override (session_status table). */
export interface StatusRow {
  plannedRef: string;
  date: string;
  sport: string;
  status: SessionState;
  percentDone: number | null;
  reasonTag?: ReasonTag | string;
  note?: string;
  eventId?: number | null;
  source: "manual" | "ai";
}

export const plannedRef = (week: string, day: number, slot: number) => `${week}:${day}:${slot}`;

/** At or above this share of the planned time, a session with an activity counts as done. */
export const DONE_FROM_PCT = 85;

export interface ReviewSession {
  ref: string;
  day: number;
  date: string;
  slot: number;
  entry: MatchedEntry["entry"];
  activity: Activity | null;
  state: EffectiveState;
  /** 0 to 100, null while the session is still ahead */
  percent: number | null;
  reasonTag?: string;
  note?: string;
  eventId?: number | null;
  /** where the state came from: Strava, typed by hand, or the Context Log */
  source: "strava" | "manual" | "ai";
  plannedMin: number;
  /** minutes of the plan that were lost (partial and skipped sessions only) */
  lostMin: number;
  key: boolean;
}

/** The state Strava alone gives: the matched activity against the planned time, or nothing done. */
export function autoState(e: MatchedEntry, date: string, todayKey: string): { state: EffectiveState; percent: number | null } {
  if (e.activity) {
    const planned = e.entry.minutes ?? 0;
    const pct = planned > 0 ? Math.min(100, Math.round((e.activity.elapsedTime / 60 / planned) * 100)) : 100;
    return { state: pct >= DONE_FROM_PCT ? "done" : "partial", percent: pct };
  }
  if (date > todayKey) return { state: "pending", percent: null };
  if (date === todayKey) return { state: "pending", percent: null };
  return { state: "skipped", percent: 0 };
}

export interface WeekReviewSummary {
  planned: number;
  done: number;
  partial: number;
  skipped: number;
  changed: number;
  pending: number;
  lostMin: number;
  plannedMin: number;
  /** key sessions: planned, how many were fully done, and the minutes lost in them */
  keyPlanned: number;
  keyDone: number;
  keyLostMin: number;
  keyLostSessions: number;
  /** 0 to 100: the mean percent done over the sessions already due */
  score: number | null;
}

/** The week as a list of sessions with their effective state, the activities that matched nothing, and a summary. */
export function reviewWeek(matched: DayMatch[], statuses: Record<string, StatusRow>, weekStart: string, todayKey: string): { sessions: ReviewSession[]; unplanned: { day: number; date: string; rest: boolean; activity: Activity }[]; summary: WeekReviewSummary } {
  const sessions: ReviewSession[] = [];
  const unplanned: { day: number; date: string; rest: boolean; activity: Activity }[] = [];
  for (const d of matched) {
    for (const e of d.entries) {
      const ref = plannedRef(weekStart, e.day, e.slot);
      const auto = autoState(e, d.date, todayKey);
      const o = statuses[ref];
      const state: EffectiveState = o ? o.status : auto.state;
      const percent = o ? (o.percentDone ?? (o.status === "skipped" ? 0 : o.status === "done" || o.status === "changed" ? 100 : (auto.percent ?? 50))) : auto.percent;
      const plannedMin = e.entry.minutes ?? 0;
      const lost = state === "partial" || state === "skipped" ? plannedMin * (1 - (percent ?? 0) / 100) : 0;
      sessions.push({
        ref,
        day: e.day,
        date: d.date,
        slot: e.slot,
        entry: e.entry,
        activity: e.activity,
        state,
        percent,
        reasonTag: o?.reasonTag,
        note: o?.note,
        eventId: o?.eventId ?? null,
        source: o ? o.source : "strava",
        plannedMin,
        lostMin: Math.round(lost),
        key: !!e.entry.key,
      });
    }
    for (const a of d.unplanned) unplanned.push({ day: d.day, date: d.date, rest: d.rest, activity: a });
  }

  const due = sessions.filter((s) => s.state !== "pending");
  const keys = sessions.filter((s) => s.key && s.state !== "pending");
  const summary: WeekReviewSummary = {
    planned: sessions.length,
    done: sessions.filter((s) => s.state === "done").length,
    partial: sessions.filter((s) => s.state === "partial").length,
    skipped: sessions.filter((s) => s.state === "skipped").length,
    changed: sessions.filter((s) => s.state === "changed").length,
    pending: sessions.filter((s) => s.state === "pending").length,
    lostMin: sessions.reduce((n, s) => n + s.lostMin, 0),
    plannedMin: sessions.reduce((n, s) => n + s.plannedMin, 0),
    keyPlanned: sessions.filter((s) => s.key).length,
    keyDone: keys.filter((s) => s.state === "done" || s.state === "changed").length,
    keyLostMin: keys.reduce((n, s) => n + s.lostMin, 0),
    keyLostSessions: keys.filter((s) => s.state === "partial" || s.state === "skipped").length,
    score: due.length ? Math.round(due.reduce((n, s) => n + (s.percent ?? 0), 0) / due.length) : null,
  };
  return { sessions, unplanned, summary };
}

/** The sessions that lost volume, biggest loss first: what the "lost" list shows, each with its reason. */
export const lostSessions = (sessions: ReviewSession[]) => sessions.filter((s) => s.lostMin > 0).sort((a, b) => b.lostMin - a.lostMin);

/** Which planned entry of a day an event impact belongs to: the first not yet taken with the same sport, else the closest planned time. */
export function pickPlannedRef(day: DayMatch, sport: string, plannedMinutes: number | null | undefined, taken: Set<string>, weekStart: string): string | null {
  const same = day.entries.filter((e) => e.entry.sport === sport && !taken.has(plannedRef(weekStart, e.day, e.slot)));
  if (!same.length) return null;
  if (plannedMinutes && same.length > 1) {
    same.sort((a, b) => Math.abs((a.entry.minutes ?? 0) - plannedMinutes) - Math.abs((b.entry.minutes ?? 0) - plannedMinutes));
  }
  return plannedRef(weekStart, same[0].day, same[0].slot);
}
