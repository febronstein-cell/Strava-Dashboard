import type { CtxEvent, CtxFollowup } from "@/lib/context-signal";
import type { StatusRow } from "@/lib/session-status";

/** What an event cost, and the patterns across events. Pure. Patterns are phrased as questions, never conclusions. */

export interface EventCost {
  sessionsLost: number;
  minutesLost: number;
  keySessionsLost: number;
  /** days from the start to the first day of the recovery that closed it (null while it is open) */
  daysToRecover: number | null;
}

const DAY = 86_400_000;
const gap = (a: string, b: string) => Math.round((Date.parse(b + "T00:00:00Z") - Date.parse(a + "T00:00:00Z")) / DAY);

/**
 * `plannedMinutes` and `keyRefs` come from the plan (planned_ref -> minutes, and the refs that were key sessions).
 * A session counts as lost when its status is partial or skipped and it is linked to the event.
 */
export function eventCost(event: CtxEvent, followups: CtxFollowup[], statuses: StatusRow[], plannedMinutes: Record<string, number>, keyRefs: Set<string>): EventCost {
  const mine = statuses.filter((s) => s.eventId === event.id && (s.status === "partial" || s.status === "skipped"));
  let minutesLost = 0;
  for (const s of mine) minutesLost += Math.round((plannedMinutes[s.plannedRef] ?? 0) * (1 - (s.percentDone ?? 0) / 100));
  const done = followups
    .filter((f) => f.eventId === event.id && f.score >= 9 && f.redFlags.length === 0)
    .map((f) => f.date)
    .sort()[0];
  return {
    sessionsLost: mine.length,
    minutesLost,
    keySessionsLost: mine.filter((s) => keyRefs.has(s.plannedRef)).length,
    daysToRecover: event.status === "closed" && done ? Math.max(1, gap(event.startDate, done)) : null,
  };
}

export interface Pattern {
  type: string;
  tag: string;
  /** the event ids that share it */
  eventIds: number[];
  dates: string[];
}

/**
 * A pattern needs at least 2 events of the same type that share a context tag (for example two GI events tagged
 * "post-gym"). It is only a question for the athlete: the page words it as one.
 */
export function findPatterns(events: CtxEvent[]): Pattern[] {
  const by = new Map<string, CtxEvent[]>();
  for (const e of events) for (const tag of new Set(e.tags)) by.set(`${e.type}|${tag}`, [...(by.get(`${e.type}|${tag}`) ?? []), e]);
  const out: Pattern[] = [];
  for (const [key, list] of by) {
    if (list.length < 2) continue;
    const [type, tag] = key.split("|");
    out.push({ type, tag, eventIds: list.map((e) => e.id), dates: list.map((e) => e.startDate).sort() });
  }
  return out.sort((a, b) => b.eventIds.length - a.eventIds.length);
}
