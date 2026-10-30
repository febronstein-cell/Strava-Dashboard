"use client";

import { useState } from "react";
import { useI18n } from "@/lib/i18n";
import { REASON_TAGS } from "@/lib/context-config";
import { hrCapCompliance, lapPace, rangeCompliance, sessionCompliance, workReps, type Color, type Lap, type MatchedEntry, type Override } from "@/lib/compliance";
import { SPORT_LABEL } from "@/lib/lab/plan";
import type { ReviewSession, SessionState, StatusRow } from "@/lib/session-status";
import { contextChanged } from "@/lib/use-context-data";
import { ErrorNote } from "../ErrorNote";
import { SPORT_COLOR, clock, structureText, targetText } from "./SlotEditor";

export const COLOR: Record<Color, string> = { green: "#1fe08a", yellow: "#ffb020", red: "#ff4d4d", grey: "var(--muted)" };
export const hm = (s: number) => `${Math.floor(s / 3600)}:${String(Math.round((s % 3600) / 60)).padStart(2, "0")}`;

/** What the server sends for one week: re-matches, laps, HR histograms and the status of each planned session. */
export interface Actuals {
  overrides: Record<number, Override>;
  laps: Record<number, Lap[]>;
  pending: number[];
  /** seconds at each bpm per activity, for the HR-cap check (from the streams) */
  hrHist?: Record<number, Record<string, number>>;
  statuses?: Record<string, StatusRow>;
}

export const STATE_COLOR: Record<ReviewSession["state"], string> = { done: "#1fe08a", partial: "#ffb020", skipped: "#ff4d4d", changed: "var(--brand)", pending: "var(--muted)" };
export const STATE_LABEL: Record<ReviewSession["state"], string> = { done: "Done", partial: "Partial", skipped: "Skipped", changed: "Changed", pending: "Ahead" };

export function Chip({ color, children }: { color: Color | string; children: React.ReactNode }) {
  const c = color in COLOR ? COLOR[color as Color] : color;
  return (
    <span className="rounded-full px-2 py-0.5 text-xs" style={{ background: `color-mix(in srgb, ${c} 18%, transparent)`, color: c, border: `1px solid ${c}` }}>
      {children}
    </span>
  );
}

/** A session's status as a pill: the state, and the percent when it was not done in full. */
export function StatePill({ s }: { s: ReviewSession }) {
  const { t } = useI18n();
  return (
    <Chip color={STATE_COLOR[s.state]}>
      {t(STATE_LABEL[s.state])}
      {s.state === "partial" && s.percent != null ? ` ${s.percent}%` : ""}
    </Chip>
  );
}

/**
 * One planned session with what was done: plan and activity side by side, the reps against the target (the first
 * rep apart), and, behind "Adjust", the status override and the manual re-match. The match itself is automatic.
 */
export function EntryRow({
  e,
  nth,
  review,
  actuals,
  editable,
  options,
  weekStart,
  onRematch,
  onStatusSaved,
}: {
  e: MatchedEntry;
  nth: number;
  review: ReviewSession;
  actuals: Actuals | null;
  editable: boolean;
  options: { value: string; label: string }[];
  weekStart: string;
  onRematch: (id: number, v: string) => void;
  onStatusSaved: () => void;
}) {
  const { t, fmt } = useI18n();
  const c = sessionCompliance(e);
  const a = e.activity;
  const laps = a ? actuals?.laps[a.id] : undefined;
  const target = e.entry.target;
  const kind = target?.type === "power-range" ? "power" : "pace";
  const reps = a && laps && (target?.type === "pace-range" || target?.type === "power-range" || target?.type === "hr-range") ? workReps(laps, e.entry.structure, kind) : null;
  const range = reps && target ? rangeCompliance(reps, target) : null;
  const cap = a && target?.type === "hr-cap" && (target.max ?? target.min) ? hrCapCompliance((target.max ?? target.min)!, { hist: actuals?.hrHist?.[a.id], laps }) : null;
  const fmtValue = (v: number | null) => (v == null ? "-" : target?.type === "pace-range" ? `${clock(v)} /km` : target?.type === "power-range" ? `${Math.round(v)} W` : `${Math.round(v)} bpm`);

  return (
    <div className="rounded-xl border border-line p-3" style={{ borderLeft: `4px solid ${STATE_COLOR[review.state]}` }}>
      <div className="flex flex-wrap items-center gap-2">
        <span className="label" style={{ color: SPORT_COLOR[e.entry.sport] }}>
          {t(SPORT_LABEL[e.entry.sport])}
          {nth > 1 ? ` · ${t("PM")}` : ""}
        </span>
        {e.entry.key && <span className="rounded-full border border-current px-1.5 text-[10px]">{t("key")}</span>}
        <StatePill s={review} />
        {review.reasonTag && <Chip color="var(--muted)">{review.reasonTag}</Chip>}
        {review.source === "ai" && <span className="label normal-case">{t("from the Log")}</span>}
      </div>

      <div className="mt-2 grid gap-2 sm:grid-cols-2">
        <div className="text-sm">
          <p className="label">{t("Plan")}</p>
          <p className="mt-0.5">{e.entry.name ? <span className="font-medium">{e.entry.name}</span> : null}{e.entry.name && e.entry.description ? " · " : ""}{e.entry.description || (e.entry.name ? "" : "-")}</p>
          <p className="label mt-0.5 normal-case">
            {[e.entry.minutes ? `${Math.floor(e.entry.minutes / 60)}:${String(e.entry.minutes % 60).padStart(2, "0")} h` : null, e.entry.km ? `${e.entry.km} km` : null, e.entry.structure && structureText(e.entry.structure), target && targetText(target)].filter(Boolean).join(" · ")}
          </p>
        </div>
        <div className="text-sm">
          <p className="label">{t("Done")}</p>
          {a ? (
            <>
              <p className="mt-0.5">{a.name}</p>
              <p className="label mt-0.5 normal-case">
                {hm(a.elapsedTime)} h{a.distance > 0 ? ` · ${(a.distance / 1000).toFixed(1)} km` : ""}
                {a.hr ? ` · ${Math.round(a.hr)} bpm` : ""}
              </p>
              <p className="mt-1 flex flex-wrap gap-2">
                {c.duration.pct != null && <Chip color={c.duration.color}>{t("time {p}%", { p: Math.round(c.duration.pct) })}</Chip>}
                {c.distance.pct != null && <Chip color={c.distance.color}>{t("distance {p}%", { p: Math.round(c.distance.pct) })}</Chip>}
                {cap && <Chip color={cap.pass ? "green" : "red"}>{t("{p}% above the cap", { p: fmt.num(cap.pctAbove, 0) })}</Chip>}
                {range && <Chip color={range.pass ? "green" : "red"}>{t("{a} of {b} reps on target", { a: range.inOrNear, b: range.reps.length })}</Chip>}
              </p>
            </>
          ) : (
            <p className="mt-0.5 text-muted">{review.state === "pending" ? t("Not yet") : t("Nothing recorded")}</p>
          )}
        </div>
      </div>
      {review.note && <p className="mt-2 text-sm text-muted">{review.note}</p>}

      {range && range.first && (
        <div className="mt-3 overflow-x-auto">
          <p className="label mb-1">
            {t("First rep")}: {fmtValue(range.first.value)}
            {range.first.verdict !== "in" && ` (${range.first.offPct > 0 ? "+" : ""}${fmt.num(range.first.offPct, 1)}%${target?.type === "pace-range" && range.first.offPct < 0 ? `, ${t("too fast")}` : ""})`}
          </p>
          <table className="w-full min-w-[18rem] text-sm">
            <thead>
              <tr className="label text-left">
                <th className="py-1 pr-3 font-normal">#</th>
                <th className="py-1 pr-3 font-normal">{target?.type === "pace-range" ? t("Pace") : target?.type === "power-range" ? t("Power") : t("HR")}</th>
                <th className="py-1 pr-3 font-normal">{t("Time")}</th>
                <th className="py-1 pr-3 font-normal">{t("Distance")}</th>
                <th className="py-1 font-normal">HR</th>
              </tr>
            </thead>
            <tbody>
              {range.reps.map((r) => (
                <tr key={r.n} className="border-t border-line/50">
                  <td className="py-1 pr-3">{r.n}</td>
                  <td className="py-1 pr-3" style={{ color: r.verdict === "in" ? COLOR.green : r.verdict === "near" ? COLOR.yellow : COLOR.red }}>{fmtValue(r.value)}</td>
                  <td className="py-1 pr-3">{clock(r.durationS)}</td>
                  <td className="py-1 pr-3">{r.distM ? `${Math.round(r.distM)} m` : "-"}</td>
                  <td className="py-1">{r.hr ? Math.round(r.hr) : "-"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {a && laps && !range && target && target.type !== "hr-cap" && <p className="label mt-2">{t("No laps matched the planned reps.")}</p>}
      {a && laps && !target && laps.length > 1 && (
        <p className="label mt-2 normal-case">
          {t("Laps")}: {laps.slice(0, 12).map((l) => (lapPace(l) ? clock(lapPace(l)!) : "-")).join(" · ")}
        </p>
      )}

      {editable && (
        <details className="group mt-3">
          <summary className="label cursor-pointer list-none underline-offset-2 hover:text-fg hover:underline">{t("Adjust")}</summary>
          <div className="mt-3 space-y-3">
            <StatusEditor s={review} weekStart={weekStart} onSaved={onStatusSaved} />
            {a && (
              <label className="flex items-center gap-2 text-xs text-muted">
                {t("Wrong match? Move it to")}
                <select defaultValue="" onChange={(x) => x.target.value && onRematch(a.id, x.target.value)} className="min-w-0 flex-1 rounded-lg border border-line bg-elev px-2 py-1.5 text-fg">
                  <option value="">-</option>
                  <option value="auto">{t("Automatic")}</option>
                  <option value="none">{t("Unplanned")}</option>
                  {options.map((o) => (
                    <option key={o.value} value={o.value}>{o.label}</option>
                  ))}
                </select>
              </label>
            )}
          </div>
        </details>
      )}
    </div>
  );
}

/** Override what Strava shows for a session: done, partial, skipped or changed, with the percent, a reason and a note. */
function StatusEditor({ s, weekStart, onSaved }: { s: ReviewSession; weekStart: string; onSaved: () => void }) {
  const { t } = useI18n();
  void weekStart;
  const [state, setState] = useState<SessionState>(s.state === "pending" ? "done" : (s.state as SessionState));
  const [pct, setPct] = useState(s.percent ?? (s.state === "skipped" ? 0 : 100));
  const [reason, setReason] = useState(s.reasonTag ?? "");
  const [note, setNote] = useState(s.note ?? "");
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const send = async (body: Record<string, unknown>) => {
    setBusy(true);
    setErr(null);
    const res = await fetch("/api/context/status", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    const j = (await res.json().catch(() => ({}))) as { error?: string };
    setBusy(false);
    if (!res.ok) return setErr(j.error ?? String(res.status));
    contextChanged();
    onSaved();
  };

  return (
    <div className="rounded-xl border border-line p-3">
      <p className="label mb-2">{t("Status of this session")}</p>
      <div className="grid grid-cols-4 gap-1.5" role="group" aria-label={t("Status of this session")}>
        {(["done", "partial", "skipped", "changed"] as const).map((x) => (
          <button key={x} onClick={() => { setState(x); if (x === "skipped") setPct(0); if (x === "done") setPct(100); }} aria-pressed={state === x} className={`label rounded-full border px-1 py-2 ${state === x ? "border-fg bg-fg text-bg" : "border-line hover:text-fg"}`}>
            {t(STATE_LABEL[x])}
          </button>
        ))}
      </div>
      {(state === "partial" || state === "changed") && (
        <label className="mt-3 block">
          <span className="label">{t("Done")}: {pct}%</span>
          <input type="range" min={0} max={100} step={5} value={pct} onChange={(x) => setPct(Number(x.target.value))} className="mt-1 w-full" />
        </label>
      )}
      <div className="mt-3 grid gap-2 sm:grid-cols-2">
        <label className="block">
          <span className="label mb-1 block">{t("Reason")}</span>
          <select value={reason} onChange={(x) => setReason(x.target.value)} className="w-full rounded-xl border border-line bg-elev px-3 py-2.5 text-base text-fg">
            <option value="">-</option>
            {REASON_TAGS.map((r) => (
              <option key={r} value={r}>{r}</option>
            ))}
          </select>
        </label>
        <label className="block">
          <span className="label mb-1 block">{t("Note")}</span>
          <input value={note} onChange={(x) => setNote(x.target.value)} maxLength={240} className="w-full rounded-xl border border-line bg-elev px-3 py-2.5 text-base text-fg" />
        </label>
      </div>
      <div className="mt-3 flex flex-wrap gap-2">
        <button disabled={busy} onClick={() => void send({ plannedRef: s.ref, date: s.date, sport: s.entry.sport, status: state, percentDone: pct, reasonTag: reason || undefined, note })} className="label rounded-full border border-brand px-4 py-2 text-brand hover:bg-brand hover:text-bg disabled:opacity-50">
          {busy ? t("Saving…") : t("Save status")}
        </button>
        {s.source !== "strava" && (
          <button disabled={busy} onClick={() => void send({ plannedRef: s.ref, clear: true })} className="label rounded-full border border-line px-4 py-2 hover:text-fg">
            {t("Back to what Strava shows")}
          </button>
        )}
      </div>
      <ErrorNote error={err} className="mt-2" />
    </div>
  );
}
