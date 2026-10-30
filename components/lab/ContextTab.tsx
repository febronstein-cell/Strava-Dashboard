"use client";

import { useState } from "react";
import { useI18n } from "@/lib/i18n";
import { BODY_AREAS, EVENT_TYPES, REASON_TAGS, type EventType } from "@/lib/context-config";
import type { Draft, DraftEvent, DraftImpact } from "@/lib/context-interpret";
import { eventLabel } from "@/lib/context-signal";
import { contextChanged, useContextData, type EventView } from "@/lib/use-context-data";
import { usePlanSession } from "@/lib/use-plan-session";
import { LockedHint } from "../EditLock";
import { ErrorNote } from "../ErrorNote";
import { FollowupCard } from "./FollowupCard";
import { Hint, Panel } from "./LabBits";

const TYPE_LABEL: Record<EventType, string> = {
  GI: "Stomach or bowel",
  illness: "Illness",
  injury_pain: "Injury or pain",
  fatigue: "Fatigue",
  sleep: "Sleep",
  stress: "Stress",
  travel: "Travel",
  other: "Other",
};
const STATE_LABEL = { done: "Done", partial: "Partial", skipped: "Skipped", changed: "Changed" } as const;
const INPUT = "w-full rounded-xl border border-line bg-elev px-3 py-2.5 text-base text-fg";

interface PlannedRef {
  plannedRef: string;
  sport: string;
  name: string;
  description: string;
  plannedMinutes: number;
}

const blankEvent = (): DraftEvent => ({ type: "other", bodyArea: "", severity: 3, causeStated: "", tags: [], onset: "", end: "", summary: "" });

/**
 * The Context Log: one place to say what happened (illness, stomach, pain, sleep, stress, travel, anything). The note is
 * read by the AI into an event and the sessions it affected; you confirm or correct it before it is stored. Open
 * events come back as a question in the next morning's check-in. Everything here needs the password.
 */
export function ContextTab({ todayKey }: { todayKey: string }) {
  const { t, fmt } = useI18n();
  const session = usePlanSession();
  const { data } = useContextData(session.unlocked, todayKey, 60);

  const [text, setText] = useState("");
  const [date, setDate] = useState(todayKey);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [planned, setPlanned] = useState<PlannedRef[]>([]);
  const [busy, setBusy] = useState<"idle" | "reading" | "saving">("idle");
  const [error, setError] = useState<string | null>(null);

  if (session.state === "checking") return null;
  if (!session.unlocked)
    return (
      <div className="space-y-4">
        <Hint>{t("The Context Log holds personal health notes: it is shown and edited only with the password.")}</Hint>
        <LockedHint what={t("Enter the password to open the Log")} />
      </div>
    );

  const read = async () => {
    setBusy("reading");
    setError(null);
    const res = await fetch("/api/context/interpret", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ text, date }) });
    const j = (await res.json().catch(() => ({}))) as { error?: string; draft?: Draft; planned?: PlannedRef[] };
    setBusy("idle");
    if (!res.ok || !j.draft) return setError(j.error ?? String(res.status));
    setDraft(j.draft);
    setPlanned(j.planned ?? []);
  };
  const byHand = () => {
    setDraft({ events: [blankEvent()], impacts: [] });
    setPlanned([]);
  };
  const save = async () => {
    if (!draft) return;
    setBusy("saving");
    setError(null);
    const res = await fetch("/api/context/note", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ date, text, draft }) });
    const j = (await res.json().catch(() => ({}))) as { error?: string };
    setBusy("idle");
    if (!res.ok) return setError(j.error ?? String(res.status));
    setDraft(null);
    setText("");
    contextChanged();
  };

  const open = data?.events.filter((e) => e.status === "open") ?? [];
  const closed = data?.events.filter((e) => e.status === "closed") ?? [];
  const noteById = new Map((data?.notes ?? []).map((n) => [n.id, n]));

  return (
    <div className="lab-enter space-y-6">
      <Panel title={t("What happened?")} subtitle={t("Write it the way you would tell a coach: illness, stomach, pain, bad sleep, stress, travel, anything.")}>
        {!draft ? (
          <>
            <textarea
              value={text}
              onChange={(e) => setText(e.target.value)}
              rows={4}
              maxLength={4000}
              placeholder={t("Example: Stomach issue after acai before the run, two urgent bathroom trips in 20', stopped the run. Skipped swim and bike. Still bad at 4pm.")}
              className={`${INPUT} [field-sizing:content] max-h-72 min-h-28`}
            />
            <div className="mt-3 flex flex-wrap items-end gap-3">
              <label className="block">
                <span className="label mb-1 block">{t("Date")}</span>
                <input type="date" value={date} max={todayKey} onChange={(e) => setDate(e.target.value)} className={INPUT} />
              </label>
              <button onClick={() => void read()} disabled={!text.trim() || busy !== "idle"} className="label rounded-full border border-brand px-5 py-3 text-brand transition-colors hover:bg-brand hover:text-bg disabled:opacity-50">
                {busy === "reading" ? t("Reading your note…") : t("Read my note")}
              </button>
              <button onClick={byHand} className="label rounded-full border border-line px-5 py-3 hover:text-fg">{t("Add it by hand")}</button>
            </div>
          </>
        ) : (
          <DraftCard draft={draft} onChange={setDraft} planned={planned} date={date} text={text} saving={busy === "saving"} onSave={() => void save()} onDiscard={() => setDraft(null)} />
        )}
        <ErrorNote error={error} className="mt-3" />
        <p className="label mt-4 normal-case">{t("The AI reads only what you wrote: it never diagnoses and never adds symptoms or causes. It adjusts training, it is not medical advice.")}</p>
      </Panel>

      {open.length > 0 && (
        <Panel title={t("Open events")} subtitle={t("Each one is asked about every morning until you answer 9 or 10 on two days in a row, or close it.")}>
          <div className="space-y-4">
            {open.map((e) => (
              <EventCard key={e.id} e={e} day={todayKey} unconfirmed={noteById.get(e.noteId)?.confirmed === false} />
            ))}
          </div>
        </Panel>
      )}

      {data && data.patterns.length > 0 && (
        <Panel title={t("Possible patterns")} subtitle={t("Only a question for you: two or more similar events share something.")}>
          <ul className="space-y-2 text-sm">
            {data.patterns.map((p) => (
              <li key={`${p.type}-${p.tag}`}>
                {t("{n} {type} events share the tag “{tag}” ({dates}). Is that something to watch?", {
                  n: p.eventIds.length,
                  type: t(TYPE_LABEL[p.type as EventType] ?? p.type).toLowerCase(),
                  tag: p.tag,
                  dates: p.dates.map((d) => fmt.dateLabel(`${d}T00:00:00`, { day: "2-digit", month: "short" })).join(", "),
                })}
              </li>
            ))}
          </ul>
        </Panel>
      )}

      <Panel title={t("History")}>
        {!data ? (
          <div className="space-y-2" aria-busy="true">
            <div className="skeleton h-16" />
            <div className="skeleton h-16" />
          </div>
        ) : data.notes.length === 0 ? (
          <p className="text-sm text-muted">{t("No notes yet.")}</p>
        ) : (
          <ul className="space-y-3">
            {data.notes.slice(0, 20).map((n) => {
              const evs = data.events.filter((e) => e.noteId === n.id);
              return (
                <li key={n.id} className="rounded-xl border border-line p-3">
                  <p className="label">
                    {fmt.dateLabel(`${n.date}T00:00:00`, { weekday: "short", day: "2-digit", month: "short" })}
                    {!n.confirmed && <span className="ml-2 rounded-full border border-[var(--goal)] px-2 text-[10px]" style={{ color: "var(--goal)" }}>{t("not confirmed")}</span>}
                  </p>
                  <p className="mt-1 text-sm">{n.text}</p>
                  {evs.length > 0 && (
                    <ul className="mt-2 flex flex-wrap gap-2">
                      {evs.map((e) => (
                        <li key={e.id} className="label rounded-full border border-line px-2.5 py-1 normal-case">
                          {t(TYPE_LABEL[e.type])} · {e.severity}/5 · {e.status === "open" ? t("open") : t("closed")}
                          {e.status === "closed" && e.cost.daysToRecover !== null ? ` · ${t("{n} days to recover", { n: e.cost.daysToRecover })}` : ""}
                        </li>
                      ))}
                    </ul>
                  )}
                  {evs.filter((e) => e.status === "closed" && e.cost.sessionsLost > 0).map((e) => (
                    <p key={`c${e.id}`} className="label mt-2 normal-case">
                      {t("Cost: {s} sessions lost, {h} h of volume, {k} key sessions", { s: e.cost.sessionsLost, h: fmt.num(e.cost.minutesLost / 60, 1), k: e.cost.keySessionsLost })}
                    </p>
                  ))}
                  <button
                    onClick={async () => {
                      if (!window.confirm(t("Delete this note and its events?"))) return;
                      await fetch("/api/context/note", { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: n.id }) });
                      contextChanged();
                    }}
                    className="label mt-2 hover:text-fg"
                  >
                    ✕ {t("Delete")}
                  </button>
                </li>
              );
            })}
          </ul>
        )}
        {closed.length > 0 && <p className="label mt-3">{t("{n} closed events", { n: closed.length })}</p>}
      </Panel>
    </div>
  );
}

/** One open event: what it is, in your words, the answers so far and the question of today. */
function EventCard({ e, day, unconfirmed }: { e: EventView; day: string; unconfirmed: boolean }) {
  const { t, fmt } = useI18n();
  const [edit, setEdit] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const answered = e.followups.find((f) => f.date === day);
  const close = async () => {
    setErr(null);
    const res = await fetch("/api/context/event", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: e.id, action: "close" }) });
    if (!res.ok) return setErr(((await res.json().catch(() => ({}))) as { error?: string }).error ?? String(res.status));
    contextChanged();
  };
  const patch = async (p: Record<string, unknown>) => {
    setErr(null);
    const res = await fetch("/api/context/event", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: e.id, patch: p }) });
    if (!res.ok) return setErr(((await res.json().catch(() => ({}))) as { error?: string }).error ?? String(res.status));
    contextChanged();
  };

  return (
    <div className="rounded-2xl border border-line p-4" style={{ borderLeft: `4px solid ${e.severity >= 5 ? "#ff4d4d" : e.severity >= 4 ? "#ffb020" : "var(--line)"}` }}>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <p className="num text-2xl uppercase">{t(eventLabel(e))}</p>
          <p className="label normal-case">
            {t(TYPE_LABEL[e.type])} · {t("severity {n} of 5", { n: e.severity })} · {fmt.dateLabel(`${e.startDate}T00:00:00`, { day: "2-digit", month: "short" })} · {t("day {n}", { n: e.openDays })}
            {unconfirmed && <span className="ml-2" style={{ color: "var(--goal)" }}>{t("not confirmed")}</span>}
          </p>
        </div>
        <div className="flex gap-2">
          <button onClick={() => setEdit((x) => !x)} className="label rounded-full border border-line px-3 py-2 hover:text-fg">{edit ? t("Done") : t("Edit")}</button>
          <button onClick={() => void close()} className="label rounded-full border border-line px-3 py-2 hover:text-fg">{t("Close event")}</button>
        </div>
      </div>
      {e.causeStated && <p className="mt-2 text-sm">{t("Cause, in your words")}: “{e.causeStated}”</p>}
      {e.followups.length > 0 && (
        <p className="label mt-2 normal-case">
          {t("Recovery")}: {e.followups.map((f) => `${fmt.dateLabel(`${f.date}T00:00:00`, { day: "2-digit", month: "short" })} ${f.score}/10`).join(" · ")}
        </p>
      )}
      {e.openDays >= 5 && <p className="mt-2 text-sm">{t("This has been open for {n} days. Consider seeing a doctor.", { n: e.openDays })}</p>}

      {edit && (
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <label className="block"><span className="label mb-1 block">{t("Type")}</span>
            <select defaultValue={e.type} onChange={(x) => void patch({ type: x.target.value })} className={INPUT}>{EVENT_TYPES.map((x) => <option key={x} value={x}>{t(TYPE_LABEL[x])}</option>)}</select></label>
          <label className="block"><span className="label mb-1 block">{t("Body area")}</span>
            <select defaultValue={e.bodyArea ?? ""} onChange={(x) => void patch({ bodyArea: x.target.value })} className={INPUT}><option value="">-</option>{BODY_AREAS.map((x) => <option key={x} value={x}>{t(x)}</option>)}</select></label>
          <label className="block"><span className="label mb-1 block">{t("Severity (1 to 5)")}</span>
            <input type="range" min={1} max={5} defaultValue={e.severity} onChange={(x) => void patch({ severity: Number(x.target.value) })} className="w-full" /></label>
          <label className="block"><span className="label mb-1 block">{t("Cause, in your words")}</span>
            <input defaultValue={e.causeStated ?? ""} onBlur={(x) => x.target.value !== (e.causeStated ?? "") && void patch({ causeStated: x.target.value })} maxLength={240} className={INPUT} /></label>
        </div>
      )}
      <ErrorNote error={err} className="mt-2" />

      <div className="mt-4">
        {e.startDate < day ? (
          <FollowupCard key={`${e.id}-${answered?.score ?? "n"}`} event={e} day={day} compact />
        ) : (
          <p className="label normal-case">{t("The question comes with tomorrow morning's check-in.")}</p>
        )}
      </div>
    </div>
  );
}

/** The draft the AI made, editable. Nothing is stored until you confirm. */
function DraftCard({ draft, onChange, planned, date, text, saving, onSave, onDiscard }: { draft: Draft; onChange: (d: Draft) => void; planned: PlannedRef[]; date: string; text: string; saving: boolean; onSave: () => void; onDiscard: () => void }) {
  const { t } = useI18n();
  const setEvent = (i: number, p: Partial<DraftEvent>) => onChange({ ...draft, events: draft.events.map((e, k) => (k === i ? { ...e, ...p } : e)) });
  const setImpact = (i: number, p: Partial<DraftImpact>) => onChange({ ...draft, impacts: draft.impacts.map((m, k) => (k === i ? { ...m, ...p } : m)) });
  const planOf = (ref: string) => planned.find((p) => p.plannedRef === ref);

  return (
    <div className="fade-up space-y-5">
      <p className="rounded-xl border border-dashed border-line p-3 text-sm text-muted">“{text}” · {date}</p>
      <p className="label text-brand">{t("Check what I understood and correct anything before saving")}</p>

      {draft.events.map((e, i) => (
        <div key={i} className="rounded-2xl border border-line p-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="block"><span className="label mb-1 block">{t("Type")}</span>
              <select value={e.type} onChange={(x) => setEvent(i, { type: x.target.value as EventType })} className={INPUT}>{EVENT_TYPES.map((x) => <option key={x} value={x}>{t(TYPE_LABEL[x])}</option>)}</select></label>
            <label className="block"><span className="label mb-1 block">{t("Body area")}</span>
              <select value={e.bodyArea} onChange={(x) => setEvent(i, { bodyArea: x.target.value })} className={INPUT}><option value="">-</option>{BODY_AREAS.map((x) => <option key={x} value={x}>{t(x)}</option>)}</select></label>
            <label className="block"><span className="label mb-1 block">{t("Severity (1 to 5)")}: <span className="num text-lg">{e.severity}</span></span>
              <input type="range" min={1} max={5} value={e.severity} onChange={(x) => setEvent(i, { severity: Number(x.target.value) })} className="w-full" /></label>
            <label className="block"><span className="label mb-1 block">{t("Cause, in your words (only if you said it)")}</span>
              <input value={e.causeStated} onChange={(x) => setEvent(i, { causeStated: x.target.value })} maxLength={240} className={INPUT} /></label>
            <label className="block sm:col-span-2"><span className="label mb-1 block">{t("Tags (comma separated)")}</span>
              <input value={e.tags.join(", ")} onChange={(x) => setEvent(i, { tags: x.target.value.split(",").map((s) => s.trim().toLowerCase()).filter(Boolean).slice(0, 6) })} className={INPUT} /></label>
          </div>
          {e.summary && <p className="mt-3 text-sm text-muted">{e.summary}</p>}
          {draft.events.length > 1 && <button onClick={() => onChange({ ...draft, events: draft.events.filter((_, k) => k !== i), impacts: draft.impacts.filter((m) => m.eventIndex !== i).map((m) => ({ ...m, eventIndex: m.eventIndex > i ? m.eventIndex - 1 : m.eventIndex })) })} className="label mt-2 hover:text-fg">✕ {t("Remove this event")}</button>}
        </div>
      ))}

      <div>
        <p className="label mb-2">{t("Sessions affected")}</p>
        {draft.impacts.length === 0 && <p className="text-sm text-muted">{t("No session affected.")}</p>}
        <div className="space-y-3">
          {draft.impacts.map((m, i) => {
            const p = planOf(m.plannedRef);
            return (
              <div key={i} className="rounded-2xl border border-line p-3">
                <p className="text-sm">
                  <span className="font-medium">{t(m.sport === "ride" ? "Bike" : m.sport === "run" ? "Run" : m.sport === "swim" ? "Swim" : m.sport === "strength" ? "Strength" : "Extra")}</span>
                  {p ? <span className="text-muted"> · {p.name || p.description} · {p.plannedMinutes} min</span> : <span className="text-muted"> · {t("not in the plan")}</span>}
                </p>
                <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-4">
                  <label className="block"><span className="label mb-1 block">{t("Status")}</span>
                    <select value={m.status} onChange={(x) => setImpact(i, { status: x.target.value as DraftImpact["status"], percentDone: x.target.value === "skipped" ? 0 : x.target.value === "done" ? 100 : m.percentDone || 50 })} className={INPUT}>
                      {(Object.keys(STATE_LABEL) as (keyof typeof STATE_LABEL)[]).map((s) => <option key={s} value={s}>{t(STATE_LABEL[s])}</option>)}
                    </select></label>
                  <label className="block"><span className="label mb-1 block">{t("Done")}: {m.percentDone}%</span>
                    <input type="range" min={0} max={100} step={5} value={m.percentDone} disabled={m.status === "skipped" || m.status === "done"} onChange={(x) => setImpact(i, { percentDone: Number(x.target.value) })} className="mt-2 w-full" /></label>
                  <label className="block"><span className="label mb-1 block">{t("Reason")}</span>
                    <select value={m.reasonTag} onChange={(x) => setImpact(i, { reasonTag: x.target.value as DraftImpact["reasonTag"] })} className={INPUT}>{REASON_TAGS.map((r) => <option key={r} value={r}>{r}</option>)}</select></label>
                  <label className="block"><span className="label mb-1 block">{t("Note")}</span>
                    <input value={m.note} onChange={(x) => setImpact(i, { note: x.target.value })} maxLength={240} className={INPUT} /></label>
                </div>
                <button onClick={() => onChange({ ...draft, impacts: draft.impacts.filter((_, k) => k !== i) })} className="label mt-2 hover:text-fg">✕ {t("Remove")}</button>
              </div>
            );
          })}
        </div>
      </div>

      <div className="flex flex-wrap gap-3">
        <button onClick={onSave} disabled={saving || draft.events.length === 0} className="label rounded-full border border-brand px-6 py-3 text-brand transition-colors hover:bg-brand hover:text-bg disabled:opacity-50">
          {saving ? t("Saving…") : t("Save to the Log")}
        </button>
        <button onClick={onDiscard} className="label rounded-full border border-line px-6 py-3 hover:text-fg">{t("Discard")}</button>
      </div>
    </div>
  );
}
