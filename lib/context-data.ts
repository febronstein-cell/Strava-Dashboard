import "server-only";
import { cacheLife, cacheTag } from "next/cache";
import { matchWeek } from "@/lib/compliance";
import { readCheckins } from "@/lib/checkin-data";
import { readiness } from "@/lib/checkin";
import { eventCost, findPatterns, type EventCost, type Pattern } from "@/lib/context-cost";
import { REASON_TAGS, type EventType, type RedFlag } from "@/lib/context-config";
import { sanitizeDraft, type Draft } from "@/lib/context-interpret";
import { eventSignal, finalSignal, shouldClose, dueFollowups, openDays, type CtxEvent, type CtxFollowup } from "@/lib/context-signal";
import { labelContext } from "@/lib/lab/labeling";
import { sanitizeDays } from "@/lib/lab/plan";
import { mondayOf } from "@/lib/lab/progress";
import { pickPlannedRef, plannedRef, type SessionState, type StatusRow } from "@/lib/session-status";
import { getSupabase, hasSupabase } from "@/lib/supabase";

export interface NoteRow {
  id: number;
  createdAt: string;
  date: string;
  text: string;
  confirmed: boolean;
}

export interface EventFull extends CtxEvent {
  noteId: number;
  noteDate: string;
  summary?: string;
  startedAt?: string;
  endedAt?: string;
  closedReason?: string;
  followups: (CtxFollowup & { note?: string })[];
  openDays: number;
  cost: EventCost;
}

const str = (v: unknown) => (v === null || v === undefined || v === "" ? undefined : String(v));

/** Raw rows of the last `days` days (and every event still open, however old). Empty before the migration. */
export async function readContext(days = 30): Promise<{ notes: NoteRow[]; events: EventFull[]; statuses: StatusRow[] }> {
  if (!hasSupabase()) return { notes: [], events: [], statuses: [] };
  const db = getSupabase();
  const from = new Date(Date.now() - days * 86_400_000).toISOString().slice(0, 10);
  const [n, e, s] = await Promise.all([
    db.from("context_notes").select("*").order("note_date", { ascending: false }),
    db.from("context_events").select("*").order("created_at", { ascending: false }),
    db.from("session_status").select("*").gte("status_date", from),
  ]);
  if (n.error || e.error) return { notes: [], events: [], statuses: [] };

  const notes: NoteRow[] = (n.data ?? []).map((r) => ({ id: Number(r.id), createdAt: String(r.created_at), date: String(r.note_date).slice(0, 10), text: String(r.text), confirmed: r.confirmed !== false }));
  const noteById = new Map(notes.map((x) => [x.id, x]));
  const evRows = (e.data ?? []).filter((r) => r.status === "open" || (noteById.get(Number(r.note_id))?.date ?? "0") >= from);
  const ids = evRows.map((r) => Number(r.id));
  const f = ids.length ? await db.from("event_followups").select("*").in("event_id", ids).order("followup_date", { ascending: true }) : { data: [] as Record<string, unknown>[] };
  const statuses: StatusRow[] = (s.error ? [] : (s.data ?? [])).map(statusFromRow);

  const events: EventFull[] = evRows.map((r) => {
    const note = noteById.get(Number(r.note_id));
    const startedAt = str(r.started_at);
    const startDate = (startedAt ?? note?.date ?? "").slice(0, 10) || (note?.date ?? "");
    const followups = ((f.data ?? []) as Record<string, unknown>[])
      .filter((x) => Number(x.event_id) === Number(r.id))
      .map((x) => ({ eventId: Number(x.event_id), date: String(x.followup_date).slice(0, 10), score: Number(x.recovery_score), trend: x.trend as CtxFollowup["trend"], redFlags: (Array.isArray(x.red_flags) ? x.red_flags : []) as RedFlag[], note: str(x.note) }));
    return {
      id: Number(r.id),
      type: r.type as EventType,
      bodyArea: str(r.body_area),
      severity: Number(r.severity),
      causeStated: str(r.cause_stated),
      tags: (r.tags as string[]) ?? [],
      startDate,
      status: r.status as "open" | "closed",
      noteId: Number(r.note_id),
      noteDate: note?.date ?? startDate,
      startedAt,
      endedAt: str(r.ended_at),
      closedReason: str(r.closed_reason),
      followups,
      openDays: 1,
      cost: { sessionsLost: 0, minutesLost: 0, keySessionsLost: 0, daysToRecover: null },
    };
  });
  return { notes, events, statuses };
}

export function statusFromRow(r: Record<string, unknown>): StatusRow {
  return {
    plannedRef: String(r.planned_ref),
    date: String(r.status_date).slice(0, 10),
    sport: String(r.sport),
    status: r.status as SessionState,
    percentDone: r.percent_done == null ? null : Number(r.percent_done),
    reasonTag: str(r.reason_tag),
    note: str(r.note),
    eventId: r.event_id == null ? null : Number(r.event_id),
    source: r.source === "ai" ? "ai" : "manual",
  };
}

/** Planned minutes and key flags of the planned sessions of some weeks, by planned reference. */
async function plannedIndex(weeks: string[]): Promise<{ minutes: Record<string, number>; keys: Set<string> }> {
  const minutes: Record<string, number> = {};
  const keys = new Set<string>();
  if (!weeks.length) return { minutes, keys };
  const { data } = await getSupabase().from("training_weeks").select("week_start,planned_sessions").in("week_start", weeks);
  for (const r of data ?? []) {
    const week = String(r.week_start).slice(0, 10);
    const days = sanitizeDays(r.planned_sessions);
    days?.forEach((d) => d.slots.forEach((s, i) => {
      minutes[plannedRef(week, d.day, i)] = s.minutes ?? 0;
      if (s.key) keys.add(plannedRef(week, d.day, i));
    }));
  }
  return { minutes, keys };
}

export interface ContextSnapshot {
  day: string;
  notes: NoteRow[];
  events: EventFull[];
  statuses: StatusRow[];
  patterns: Pattern[];
  /** the signal of the day: the check-in rules, the event rules and the worst of both, each with its reasons */
  signal: { checkin: string | null; events: string | null; final: string | null; lowered: boolean; medical: boolean; eventReasons: unknown[]; checkinReasons: unknown[] };
  /** open events that still need an answer on `day` */
  due: number[];
}

/** Everything the pages and the nightly review read, with the derived parts (cost, signal, patterns). */
export async function contextSnapshot(day: string, days = 30): Promise<ContextSnapshot> {
  const { notes, events, statuses } = await readContext(days);
  const weeks = [...new Set(statuses.map((s) => mondayOf(s.date)))];
  const idx = await plannedIndex(weeks);
  for (const e of events) {
    e.openDays = openDays(e, day);
    e.cost = eventCost(e, e.followups, statuses, idx.minutes, idx.keys);
  }
  const allFollowups = events.flatMap((e) => e.followups);
  const ev = eventSignal(events, allFollowups, day);
  const checkins = await readCheckins(30);
  const today = checkins.find((c) => c.day === day);
  const base = today ? readiness(today, checkins.filter((c) => c.day !== day)) : null;
  const fin = finalSignal(base, ev);
  return {
    day,
    notes,
    events,
    statuses,
    patterns: findPatterns(events),
    signal: { checkin: base?.signal ?? null, events: ev.signal, final: fin.signal, lowered: fin.lowered, medical: fin.medical, eventReasons: ev.reasons, checkinReasons: base?.reasons ?? [] },
    due: dueFollowups(events, allFollowups, day).map((e) => e.id),
  };
}

/** How many events are open (a number only: the neutral badge of the public dashboard). Cached with the rest. */
export async function getOpenEventCount(): Promise<number> {
  "use cache";
  cacheLife({ stale: 60, revalidate: 300, expire: 86400 });
  cacheTag("strava-live");
  if (!hasSupabase()) return 0;
  const { count, error } = await getSupabase().from("context_events").select("id", { count: "exact", head: true }).eq("status", "open");
  return error ? 0 : (count ?? 0);
}

export interface SaveNoteInput {
  date: string;
  text: string;
  draft: Draft;
  /** false when the draft was not confirmed by the athlete (entered through the API with auto-confirm) */
  confirmed: boolean;
}

/** Stores a note with its events and its session impacts. The caller already cleaned the draft (sanitizeDraft). */
export async function saveNote(input: SaveNoteInput): Promise<{ noteId: number; eventIds: number[]; statuses: number }> {
  const db = getSupabase();
  const { data: note, error } = await db.from("context_notes").insert({ note_date: input.date, text: input.text, confirmed: input.confirmed }).select("id").single();
  if (error) throw new Error(error.message);
  const noteId = Number(note.id);

  const eventIds: number[] = [];
  for (const e of input.draft.events) {
    const { data, error: ee } = await db
      .from("context_events")
      .insert({
        note_id: noteId,
        type: e.type,
        body_area: e.bodyArea || null,
        severity: e.severity,
        cause_stated: e.causeStated || null,
        tags: e.tags,
        started_at: e.onset || `${input.date}T12:00`,
        ended_at: e.end || null,
      })
      .select("id")
      .single();
    if (ee) throw new Error(ee.message);
    eventIds.push(Number(data.id));
  }

  // session impacts: onto the planned entry of that day (by its reference, else by sport)
  let statuses = 0;
  if (input.draft.impacts.length) {
    const week = mondayOf(input.date);
    const [{ acts }, { data: row }] = await Promise.all([labelContext(), db.from("training_weeks").select("planned_sessions").eq("week_start", week).maybeSingle()]);
    const days = sanitizeDays(row?.planned_sessions);
    const day = days ? matchWeek(days, week, acts).find((d) => d.date === input.date) : undefined;
    const taken = new Set<string>(input.draft.impacts.map((i) => i.plannedRef).filter(Boolean));
    for (const i of input.draft.impacts) {
      const ref = i.plannedRef || (day ? pickPlannedRef(day, i.sport, i.plannedMinutes, taken, week) : null);
      if (!ref) continue; // not in the plan: nothing to attach it to
      taken.add(ref);
      const reason = (REASON_TAGS as readonly string[]).includes(i.reasonTag) ? i.reasonTag : "other";
      const { error: se } = await db.from("session_status").upsert(
        { status_date: input.date, sport: i.sport, planned_ref: ref, status: i.status, percent_done: i.percentDone, reason_tag: reason, note: i.note || null, event_id: eventIds[i.eventIndex] ?? eventIds[0] ?? null, source: input.confirmed ? "manual" : "ai", updated_at: new Date().toISOString() },
        { onConflict: "planned_ref" },
      );
      if (se) throw new Error(se.message);
      statuses++;
    }
  }
  return { noteId, eventIds, statuses };
}

/** Saves one day's answer for an event and closes the event when it has recovered (9 or better on 2 consecutive days). */
export async function saveFollowup(f: { eventId: number; date: string; score: number; trend: "worse" | "same" | "better"; redFlags: RedFlag[]; note?: string }): Promise<{ closed: boolean }> {
  const db = getSupabase();
  const { error } = await db.from("event_followups").upsert(
    { event_id: f.eventId, followup_date: f.date, recovery_score: f.score, trend: f.trend, red_flags: f.redFlags, note: f.note || null },
    { onConflict: "event_id,followup_date" },
  );
  if (error) throw new Error(error.message);
  const { data } = await db.from("event_followups").select("*").eq("event_id", f.eventId);
  const list: CtxFollowup[] = (data ?? []).map((x) => ({ eventId: Number(x.event_id), date: String(x.followup_date).slice(0, 10), score: Number(x.recovery_score), trend: x.trend, redFlags: (x.red_flags ?? []) as RedFlag[] }));
  if (shouldClose(list)) {
    await db.from("context_events").update({ status: "closed", closed_reason: "recovered", ended_at: `${f.date}T12:00` }).eq("id", f.eventId);
    return { closed: true };
  }
  return { closed: false };
}

export { sanitizeDraft };
