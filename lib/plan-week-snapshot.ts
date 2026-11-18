import "server-only";
import { totals } from "@/lib/lab/plan";
import { activeVersion, addDays, changeFromA, recordDays, tabNames, type LinkedEvent } from "@/lib/lab/versions";
export type { LinkedEvent };
import { readMoves, readVersions } from "@/lib/plan-versions-data";
import { getSupabase } from "@/lib/supabase";

/** The Log events behind Plan C versions, with the note text in the athlete's own words. */
export async function linkedEvents(ids: number[]): Promise<LinkedEvent[]> {
  if (!ids.length) return [];
  const db = getSupabase();
  const { data: ev } = await db.from("context_events").select("id,type,status,severity,cause_stated,note_id").in("id", ids);
  const noteIds = [...new Set((ev ?? []).map((e) => Number(e.note_id)))];
  const { data: notes } = noteIds.length ? await db.from("context_notes").select("id,text,note_date").in("id", noteIds) : { data: [] };
  const byNote = new Map((notes ?? []).map((n) => [Number(n.id), n]));
  return (ev ?? []).map((e) => {
    const n = byNote.get(Number(e.note_id));
    return { id: Number(e.id), type: String(e.type), status: String(e.status), severity: Number(e.severity), causeStated: e.cause_stated ? String(e.cause_stated) : null, note: n ? String(n.text) : null, noteDate: n ? String(n.note_date).slice(0, 10) : null };
  });
}

/** Everything about the versions of one week, for the read endpoint, the week analysis and the coach summary. */
export async function weekVersionsSnapshot(start: string) {
  const versions = (await readVersions([start]))[start] ?? [];
  const moves = await readMoves(versions.map((v) => v.id));
  const events = await linkedEvents([...new Set(versions.map((v) => v.logEventId).filter((x): x is number => x != null))]);
  const names = tabNames(versions);
  const active = activeVersion(versions);
  const record = recordDays(versions, start);
  return {
    weekStart: start,
    activeVersionId: active?.id ?? null,
    versions: versions.map((v) => ({
      id: v.id,
      name: names[v.id],
      label: v.label,
      status: v.status,
      parentId: v.parentId,
      createdAt: v.createdAt,
      activatedAt: v.activatedAt,
      effectiveFrom: v.effectiveFrom,
      reason: v.reason,
      logEventId: v.logEventId,
      weekLabel: v.weekLabel,
      targetHours: v.targetHours,
      hours: Number(totals(v.days).hours.toFixed(2)),
      days: v.days,
    })),
    planOfRecord: record.from.map((v, i) => ({ date: addDays(start, i), versionId: v?.id ?? null, name: v ? names[v.id] : null })),
    moves,
    changeFromA: changeFromA(versions, start),
    linkedEvents: events,
  };
}

export type WeekVersionsSnapshot = Awaited<ReturnType<typeof weekVersionsSnapshot>>;
