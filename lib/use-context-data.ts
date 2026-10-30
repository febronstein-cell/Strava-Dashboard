"use client";

import { useCallback, useEffect, useState } from "react";
import type { NoteRow } from "@/lib/context-data";
import type { Pattern } from "@/lib/context-cost";
import type { CtxEvent, CtxFollowup } from "@/lib/context-signal";
import type { StatusRow } from "@/lib/session-status";

/** An event as the pages receive it (what /api/context returns). */
export type EventView = CtxEvent & {
  noteId: number;
  noteDate: string;
  startedAt?: string;
  closedReason?: string;
  followups: (CtxFollowup & { note?: string })[];
  openDays: number;
  cost: { sessionsLost: number; minutesLost: number; keySessionsLost: number; daysToRecover: number | null };
};

export interface ContextView {
  day: string;
  notes: NoteRow[];
  events: EventView[];
  statuses: StatusRow[];
  patterns: Pattern[];
  due: number[];
}

const EVENT = "context-changed";
/** Tells every component that reads the Context Log that something was saved. */
export const contextChanged = () => window.dispatchEvent(new Event(EVENT));

/**
 * The Context Log of this device: it is health data, so it is fetched only when editing is unlocked here (cookie),
 * never rendered into the public page.
 */
export function useContextData(unlocked: boolean, day: string, days = 30) {
  const [data, setData] = useState<ContextView | null>(null);
  const [version, setVersion] = useState(0);

  useEffect(() => {
    if (!unlocked) return;
    let alive = true;
    fetch(`/api/context?date=${day}&days=${days}`, { cache: "no-store" })
      .then(async (r) => {
        if (!r.ok) return null;
        return (await r.json()) as ContextView;
      })
      .then((d) => {
        if (!alive) return;
        setData(d);
      })
      .catch(() => undefined);
    const again = () => setVersion((v) => v + 1);
    window.addEventListener(EVENT, again);
    return () => {
      alive = false;
      window.removeEventListener(EVENT, again);
    };
  }, [unlocked, day, days, version]);

  const reload = useCallback(() => setVersion((v) => v + 1), []);
  return { data: unlocked ? data : null, reload };
}
