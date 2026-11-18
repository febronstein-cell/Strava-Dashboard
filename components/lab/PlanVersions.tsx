"use client";

import { useEffect, useState } from "react";
import { useI18n } from "@/lib/i18n";
import { DAY_NAMES, PLAN_SPORTS, SPORT_LABEL, fmtMinutes, totals } from "@/lib/lab/plan";
import { activeVersion, addDays, changeFromA, tabNames, type LinkedEvent, type PlanVersion } from "@/lib/lab/versions";
import { ErrorNote } from "../ErrorNote";
import { EVENT_TYPE_LABEL, type EventType } from "@/lib/context-config";

const typeLabel = (type: string) => EVENT_TYPE_LABEL[type as EventType] ?? type;

const INPUT = "w-full rounded-xl border border-line bg-elev px-3 py-2.5 text-base text-fg";
const BTN = "label rounded-full border border-line px-3 py-2 transition-colors hover:border-fg hover:text-fg disabled:opacity-40";
const PRIMARY = "label rounded-full bg-fg px-4 py-2.5 text-bg disabled:opacity-40";

export type VersionAction = Record<string, unknown> & { action: string };

/** The event of a Plan C, in a few words: its type and, when there is one, the note in your words. */
export function eventLine(e: LinkedEvent | undefined, t: (k: string) => string): string {
  if (!e) return t("Log event");
  return e.causeStated ? `${t(typeLabel(e.type))}: ${e.causeStated}` : t(typeLabel(e.type));
}

/**
 * Plan A / B / C of the week: one tab per version (the active one marked), a one-line banner saying which plan is in
 * force and why, the buttons to start Plan B or C from the active plan, and the panel of the selected draft.
 */
export function VersionBar({
  weekStart,
  todayKey,
  versions,
  selId,
  onSel,
  events,
  editable,
  busy,
  error,
  onAction,
  onSuggest,
}: {
  weekStart: string;
  todayKey: string;
  versions: PlanVersion[];
  selId: number | null;
  onSel: (id: number) => void;
  events: Record<number, LinkedEvent>;
  editable: boolean;
  busy: boolean;
  error: string | null;
  onAction: (body: VersionAction) => Promise<boolean>;
  onSuggest: (fromDay: number, minutes: number) => number;
}) {
  const { t, fmt } = useI18n();
  const names = tabNames(versions);
  const active = activeVersion(versions);
  const sel = versions.find((v) => v.id === selId) ?? active;
  const [picking, setPicking] = useState(false);
  const dayLabel = (iso: string) => fmt.dateLabel(`${iso}T00:00:00`, { weekday: "short", day: "2-digit" });
  const ordered = [...versions].sort((a, b) => a.createdAt.localeCompare(b.createdAt) || a.id - b.id);

  return (
    <section className="space-y-3 rounded-2xl border border-line p-3 sm:p-4">
      <div className="flex flex-wrap items-center gap-2">
        <div role="tablist" aria-label={t("Plan versions")} className="flex flex-wrap gap-1">
          {ordered.map((v) => (
            <button
              key={v.id}
              role="tab"
              aria-selected={v.id === sel?.id}
              onClick={() => onSel(v.id)}
              className={`flex items-center gap-1.5 rounded-full border px-3 py-1.5 transition-colors ${v.id === sel?.id ? "lab-tab-on border-fg bg-fg text-bg" : "border-line hover:border-fg"}`}
            >
              <span className="num text-lg leading-none">{names[v.id]}</span>
              {v.status === "active" && <span className={`rounded-full px-1.5 text-[10px] uppercase ${v.id === sel?.id ? "bg-bg text-fg" : "bg-brand text-bg"}`}>{t("Active")}</span>}
              {v.status === "draft" && <span className="label text-[10px] opacity-80">{t("draft")}</span>}
            </button>
          ))}
        </div>
        {editable && active && (
          <div className="ml-auto flex flex-wrap gap-2">
            <button disabled={busy} onClick={() => void onAction({ action: "create", weekStart, label: "B" }).then((ok) => ok && setPicking(false))} className={BTN} title={t("Create Plan B from active")}>
              <span className="sm:hidden">+ {t("Plan B")}</span>
              <span className="hidden sm:inline">{t("Create Plan B from active")}</span>
            </button>
            <button disabled={busy} onClick={() => setPicking((x) => !x)} className={BTN} title={t("Create Plan C from active")}>
              <span className="sm:hidden">+ {t("Plan C")}</span>
              <span className="hidden sm:inline">{t("Create Plan C from active")}</span>
            </button>
          </div>
        )}
      </div>

      {active && active.label !== "A" && active.effectiveFrom && (
        <p className="text-sm">
          <span className="num mr-1.5" style={{ color: "var(--goal)" }}>{t("Plan {x} active", { x: names[active.id] })}</span>
          {t("since {day}", { day: dayLabel(active.effectiveFrom) })}: {active.label === "C" ? eventLine(events[active.logEventId ?? -1], t) : active.reason}
          {active.label === "C" && <span className="text-muted"> ({t("see Log")})</span>}
        </p>
      )}

      {picking && editable && <EventPicker weekStart={weekStart} todayKey={todayKey} busy={busy} onPick={(id, date) => void onAction({ action: "create", weekStart, label: "C", logEventId: id, effectiveFrom: date }).then((ok) => ok && setPicking(false))} onCancel={() => setPicking(false)} />}

      {sel && sel.status === "superseded" && (
        <p className="label normal-case text-muted">
          {t("Plan {x} is no longer in force: read-only.", { x: names[sel.id] })}
          {(() => {
            const next = versions.find((v) => v.parentId === sel.id && v.status !== "draft");
            return next?.effectiveFrom ? ` ${t("Replaced by Plan {x} from {day}.", { x: names[next.id], day: dayLabel(next.effectiveFrom) })}` : "";
          })()}
        </p>
      )}

      {sel && sel.status === "draft" && editable && <DraftPanel key={sel.id} v={sel} name={names[sel.id]} weekStart={weekStart} todayKey={todayKey} event={events[sel.logEventId ?? -1]} busy={busy} onAction={onAction} onSuggest={onSuggest} />}

      {sel && sel.status === "active" && editable && <WeekMeta key={sel.id} v={sel} onAction={onAction} />}

      <ErrorNote error={error} />
    </section>
  );
}

/** The selected draft: its reason, the effective-from day, the Z1 helper and the switch. */
function DraftPanel({
  v,
  name,
  weekStart,
  todayKey,
  event,
  busy,
  onAction,
  onSuggest,
}: {
  v: PlanVersion;
  name: string;
  weekStart: string;
  todayKey: string;
  event?: LinkedEvent;
  busy: boolean;
  onAction: (body: VersionAction) => Promise<boolean>;
  onSuggest: (fromDay: number, minutes: number) => number;
}) {
  const { t, fmt } = useI18n();
  const inWeek = todayKey >= weekStart && todayKey <= addDays(weekStart, 6);
  const [from, setFrom] = useState(v.effectiveFrom ?? (inWeek ? todayKey : weekStart));
  const [reason, setReason] = useState(v.reason ?? "");
  const [easyFrom, setEasyFrom] = useState(() => Math.max(0, Math.round((Date.parse(from) - Date.parse(weekStart)) / 86_400_000)));
  const [easyMin, setEasyMin] = useState(40);
  const [suggested, setSuggested] = useState<number | null>(null);
  const days = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));
  const needReason = v.label === "B" && !reason.trim();

  return (
    <div className="fade-up space-y-3 rounded-xl border border-dashed border-line p-3">
      <p className="text-sm">
        {t("Plan {x} is a draft: edit its days below, then set it as active. Nothing changes before that.", { x: name })} <span className="label normal-case">{fmt.num(totals(v.days).hours, 1)} h</span>
      </p>
      {v.label === "C" && (
        <p className="text-sm">
          <span className="label mr-1.5">{t("Linked to")}</span>
          {eventLine(event, t)}
          {event?.note && <span className="block text-muted">“{event.note}”</span>}
        </p>
      )}
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="block">
          <span className="label mb-1 block">{t("In force from")}</span>
          <select value={from} onChange={(e) => setFrom(e.target.value)} className={INPUT}>
            {days.map((d, i) => (
              <option key={d} value={d}>
                {t(DAY_NAMES[i])} {d.slice(8, 10)}
              </option>
            ))}
          </select>
        </label>
        <label className="block">
          <span className="label mb-1 block">{v.label === "B" ? t("Reason (required)") : t("Reason (optional)")}</span>
          <input value={reason} onChange={(e) => setReason(e.target.value)} onBlur={() => reason !== (v.reason ?? "") && void onAction({ action: "update", id: v.id, reason })} maxLength={400} placeholder={v.label === "C" ? t("The Log event already says why") : t("e.g. two intensity days to Z1")} className={INPUT} />
        </label>
      </div>

      <details className="rounded-xl border border-line p-3">
        <summary className="label cursor-pointer">{t("Convert intensity to Z1")}</summary>
        <div className="mt-3 flex flex-wrap items-end gap-2">
          <label className="block">
            <span className="label mb-1 block">{t("From")}</span>
            <select value={easyFrom} onChange={(e) => setEasyFrom(Number(e.target.value))} className={INPUT}>
              {days.map((d, i) => (
                <option key={d} value={i}>
                  {t(DAY_NAMES[i])} {d.slice(8, 10)}
                </option>
              ))}
            </select>
          </label>
          <label className="block w-28">
            <span className="label mb-1 block">{t("Minutes")}</span>
            <input type="number" inputMode="numeric" min={10} max={180} value={easyMin} onChange={(e) => setEasyMin(Number(e.target.value) || 40)} className={INPUT} />
          </label>
          <button onClick={() => setSuggested(onSuggest(easyFrom, easyMin))} className={BTN}>
            {t("Suggest")}
          </button>
        </div>
        <p className="label mt-2 normal-case">
          {suggested == null ? t("Every key or intensity session from that day becomes an easy Z1 session of that length. Check them before setting the plan as active.") : t("{n} sessions changed. Check them in the days below.", { n: suggested })}
        </p>
      </details>

      <div className="flex flex-wrap items-center gap-2">
        <button disabled={busy || needReason} onClick={() => void onAction({ action: "activate", id: v.id, effectiveFrom: from, reason })} className={PRIMARY}>
          {t("Set as active")}
        </button>
        <button disabled={busy} onClick={() => void onAction({ action: "discard", id: v.id })} className={BTN}>
          {t("Discard draft")}
        </button>
        {needReason && <span className="label normal-case">{t("Plan B needs a short reason.")}</span>}
      </div>
    </div>
  );
}

/** The title and target of the week, per version (folded: rarely changed). */
function WeekMeta({ v, onAction }: { v: PlanVersion; onAction: (body: VersionAction) => Promise<boolean> }) {
  const { t } = useI18n();
  const [label, setLabel] = useState(v.weekLabel ?? "");
  const [target, setTarget] = useState(v.targetHours != null ? String(v.targetHours) : "");
  return (
    <details>
      <summary className="label cursor-pointer text-muted">{t("Week title and target")}</summary>
      <div className="mt-2 grid gap-3 sm:grid-cols-2">
        <label className="block">
          <span className="label mb-1 block">{t("Week title")}</span>
          <input value={label} onChange={(e) => setLabel(e.target.value)} onBlur={() => label !== (v.weekLabel ?? "") && void onAction({ action: "update", id: v.id, weekLabel: label })} maxLength={60} placeholder={t("From the season phase")} className={INPUT} />
        </label>
        <label className="block">
          <span className="label mb-1 block">{t("Target hours")}</span>
          <input type="number" inputMode="decimal" step="0.5" value={target} onChange={(e) => setTarget(e.target.value)} onBlur={() => void onAction({ action: "update", id: v.id, targetHours: target ? Number(target) : null })} className={INPUT} />
        </label>
      </div>
    </details>
  );
}

interface PickEvent {
  id: number;
  type: string;
  startDate: string;
  status: string;
  causeStated?: string;
  summary?: string;
}

/** Plan C starts from a Log event: pick a recent one, or write what happened and it is added to the Log. */
function EventPicker({ weekStart, todayKey, busy, onPick, onCancel }: { weekStart: string; todayKey: string; busy: boolean; onPick: (id: number, date: string) => void; onCancel: () => void }) {
  const { t, fmt } = useI18n();
  const [list, setList] = useState<PickEvent[] | null>(null);
  const [text, setText] = useState("");
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const end = addDays(weekStart, 6);
  const clamp = (d: string) => (d < weekStart ? weekStart : d > end ? end : d);

  useEffect(() => {
    fetch(`/api/context?days=45&date=${todayKey}`)
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
      .then((j: { events?: PickEvent[] }) => setList((j.events ?? []).sort((a, b) => b.startDate.localeCompare(a.startDate))))
      .catch((e) => setErr(e instanceof Error ? e.message : "failed"));
  }, [todayKey]);

  const write = async () => {
    setSaving(true);
    setErr(null);
    try {
      const date = todayKey >= weekStart && todayKey <= end ? todayKey : weekStart;
      const res = await fetch("/api/context/note", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ date, text, autoConfirm: true }) });
      const j = (await res.json().catch(() => ({}))) as { error?: string; eventIds?: number[] };
      if (!res.ok) throw new Error(j.error ?? String(res.status));
      if (!j.eventIds?.length) throw new Error(t("The note was saved in the Log but no event was read from it. Add the event in the Log, then pick it here."));
      onPick(j.eventIds[0], date);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "failed");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fade-up space-y-3 rounded-xl border border-dashed border-line p-3">
      <p className="text-sm">{t("Plan C is a change forced by something that happened. Pick the Log event behind it.")}</p>
      {list === null && !err && <p className="label">{t("Loading…")}</p>}
      {list && list.length > 0 && (
        <ul className="space-y-2">
          {list.slice(0, 6).map((e) => (
            <li key={e.id}>
              <button disabled={busy} onClick={() => onPick(e.id, clamp(e.startDate))} className="w-full rounded-xl border border-line px-3 py-2.5 text-left transition-colors hover:border-fg disabled:opacity-40">
                <span className="label mr-2">{fmt.dateLabel(`${e.startDate}T00:00:00`, { day: "2-digit", month: "short" })}</span>
                {t(typeLabel(e.type))}
                {e.causeStated ? `: ${e.causeStated}` : e.summary ? `: ${e.summary}` : ""}
                <span className="label ml-2">{t(e.status)}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
      <label className="block">
        <span className="label mb-1 block">{t("Or write what happened (it goes to the Log)")}</span>
        <textarea value={text} onChange={(e) => setText(e.target.value)} rows={3} maxLength={4000} className={INPUT} />
      </label>
      <div className="flex flex-wrap gap-2">
        <button disabled={saving || busy || !text.trim()} onClick={() => void write()} className={PRIMARY}>
          {saving ? t("Reading the note…") : t("Save to the Log and create Plan C")}
        </button>
        <button onClick={onCancel} className={BTN}>
          {t("Cancel")}
        </button>
      </div>
      <ErrorNote error={err} />
    </div>
  );
}

/**
 * What the week lost or changed compared with Plan A: hours and km, the sessions removed, changed or moved (key ones
 * first), and each switch with its date and the reason in your own words. Shown in Review when the week left Plan A.
 */
export function ChangeFromABlock({ versions, weekStart, events }: { versions: PlanVersion[]; weekStart: string; events: Record<number, LinkedEvent> }) {
  const { t, fmt } = useI18n();
  const c = changeFromA(versions, weekStart);
  if (!c.changed) return null;
  const names = tabNames(versions);
  const day = (i: number) => fmt.dateLabel(`${addDays(weekStart, i)}T00:00:00`, { weekday: "short", day: "2-digit" });
  const h = (min: number) => fmt.num(min / 60, 1);
  const removed = c.sessions.filter((s) => s.kind === "removed").sort((a, b) => Number(b.key) - Number(a.key) || b.minutesA - a.minutesA);
  const changed = c.sessions.filter((s) => s.kind === "changed");
  const moved = c.sessions.filter((s) => s.kind === "moved");
  const dH = c.hoursNow - c.hoursA;
  const dKm = c.kmNow - c.kmA;

  return (
    <section className="space-y-3 rounded-2xl border border-line p-4" style={{ borderLeft: "4px solid var(--goal)" }}>
      <p className="label">{t("Change from Plan A")}</p>
      <p className="num text-2xl leading-tight">
        {fmt.num(c.hoursA, 1)} h → {fmt.num(c.hoursNow, 1)} h <span className="label normal-case">({dH > 0 ? "+" : ""}{fmt.num(dH, 1)} h · {dKm > 0 ? "+" : ""}{fmt.num(dKm, 0)} km)</span>
      </p>
      <p className="label normal-case">
        {PLAN_SPORTS.filter((sp) => c.bySport[sp].minutesA || c.bySport[sp].minutesNow)
          .map((sp) => `${t(SPORT_LABEL[sp])} ${h(c.bySport[sp].minutesA)} → ${h(c.bySport[sp].minutesNow)} h`)
          .join(" · ")}
      </p>

      {c.switches.map((s) => {
        const e = s.logEventId != null ? events[s.logEventId] : undefined;
        return (
          <div key={s.versionId} className="text-sm">
            <span className="num mr-1.5" style={{ color: "var(--goal)" }}>{t("Plan {x}", { x: names[s.versionId] })}</span>
            {t("from {day}", { day: day(Math.round((Date.parse(s.effectiveFrom) - Date.parse(weekStart)) / 86_400_000)) })}
            {s.reason && <span>: {s.reason}</span>}
            {e?.note && <span className="mt-1 block text-muted">{t("In your words")}: “{e.note}”</span>}
          </div>
        );
      })}

      {removed.length > 0 && (
        <div>
          <p className="label">{t("Taken out of the week")}</p>
          <ul className="mt-1 space-y-0.5 text-sm">
            {removed.map((s) => (
              <li key={s.id}>
                <span className="label mr-2">{day(s.dayA)}</span>
                {s.key && <span className="mr-1" style={{ color: "var(--goal)" }}>★</span>}
                {s.name} <span className="text-muted">· {fmtMinutes(s.minutesA)}{s.kmA ? ` · ${fmt.num(s.kmA, 1)} km` : ""}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
      {changed.length > 0 && (
        <div>
          <p className="label">{t("Changed")}</p>
          <ul className="mt-1 space-y-0.5 text-sm">
            {changed.map((s) => (
              <li key={s.id}>
                <span className="label mr-2">{day(s.dayA)}</span>
                {s.key && <span className="mr-1" style={{ color: "var(--goal)" }}>★</span>}
                {s.name} <span className="text-muted">· {fmtMinutes(s.minutesA)} → {fmtMinutes(s.minutesNow)}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
      {moved.length > 0 && (
        <p className="label normal-case">
          {t("Moved")}: {moved.map((s) => `${s.name} (${day(s.dayA)} → ${day(s.dayNow ?? s.dayA)})`).join(" · ")}
        </p>
      )}
      {c.added.length > 0 && (
        <p className="label normal-case">
          {t("Added")}: {c.added.map((s) => `${s.name} (${day(s.day)}, ${fmtMinutes(s.minutes)})`).join(" · ")}
        </p>
      )}
      <p className="label normal-case text-muted">{t("Each day is judged against the plan in force that day: a session taken out on purpose is not counted as missed.")}</p>
    </section>
  );
}
