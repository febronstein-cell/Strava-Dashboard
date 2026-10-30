"use client";

import { useMemo, useState } from "react";
import { useI18n } from "@/lib/i18n";
import { weeklyHours } from "@/lib/lab/builds";
import { mondayOf } from "@/lib/lab/progress";
import type { LabData } from "@/lib/lab/types";
import { useSeason } from "@/lib/season-context";
import {
  PHASE_FOCUSES,
  RACE_TYPES,
  addDays,
  byDate,
  lastARace,
  nextARace,
  phaseOfWeek,
  phaseOn,
  taperRule,
  type PhaseEntry,
  type PhaseFocus,
  type SeasonData,
  type SeasonRaceEntry,
} from "@/lib/season-plan";
import type { Activity } from "@/lib/strava/types";
import { usePlanSession } from "@/lib/use-plan-session";
import { LockedHint } from "../EditLock";
import { ErrorNote } from "../ErrorNote";
import { Hint, Panel } from "./LabBits";

export const FOCUS_COLOR: Record<PhaseFocus, string> = {
  swim: "var(--swim)",
  bike: "var(--ride)",
  run: "var(--run)",
  mixed: "var(--brand)",
  "race-specific": "var(--goal)",
  taper: "#b06bff",
  recovery: "var(--muted)",
};
const PRIORITY_COLOR = { A: "var(--goal)", B: "var(--ride)", C: "var(--muted)" } as const;
const COL = 30; // px per week
const H_BANDS = 30;
const H_RACES = 34;
const H_BARS = 120;
const H_AXIS = 22;

/**
 * The season at a glance: a timeline from this week to the last A race, with the phases as bands, the races as
 * A/B/C markers, the current week highlighted and, under it, each week's target range, planned and real hours.
 * Below it, the races and phases themselves, editable once the planner is unlocked on this device.
 */
export function SeasonTab({ activities, lab, todayKey }: { activities: Activity[]; lab: LabData; todayKey: string }) {
  const { t, fmt } = useI18n();
  const initial = useSeason();
  const [season, setSeason] = useState<SeasonData>(initial);
  const session = usePlanSession();

  const hours = useMemo(() => weeklyHours(activities), [activities]);
  const current = mondayOf(todayKey);
  const end = useMemo(() => {
    const last = lastARace(season.races);
    const lastPhase = [...season.phases].sort((a, b) => (a.end < b.end ? 1 : -1))[0];
    const until = [last?.date, lastPhase?.end].filter(Boolean).sort().pop() ?? addDays(current, 7 * 26);
    return mondayOf(until < current ? addDays(current, 7 * 12) : until);
  }, [season, current]);
  // two weeks of history so the current week is not glued to the left edge
  const start = addDays(current, -14);
  const weeks = useMemo(() => {
    const out: string[] = [];
    for (let w = start; w <= end; w = addDays(w, 7)) out.push(w);
    return out;
  }, [start, end]);
  const planned = useMemo(() => new Map(lab.plannedWeeks.filter((w) => w.plannedHours != null).map((w) => [w.weekStart, w.plannedHours as number])), [lab.plannedWeeks]);

  const maxH = Math.max(10, ...weeks.map((w) => Math.max(phaseOfWeek(season.phases, w)?.hoursMax ?? 0, planned.get(w) ?? 0, hours.get(w) ?? 0))) * 1.08;
  const width = weeks.length * COL;
  const height = H_BANDS + H_RACES + H_BARS + H_AXIS;
  const x = (i: number) => i * COL;
  const yBar = (h: number) => H_BANDS + H_RACES + H_BARS - (h / maxH) * (H_BARS - 6);
  const curIdx = weeks.indexOf(current);
  const phase = phaseOn(season.phases, todayKey);
  const nextA = nextARace(season.races, todayKey);

  // phase bands: consecutive weeks with the same phase
  const bands: { from: number; to: number; p: PhaseEntry }[] = [];
  weeks.forEach((w, i) => {
    const p = phaseOfWeek(season.phases, w);
    if (!p) return;
    const lastBand = bands[bands.length - 1];
    if (lastBand && lastBand.p === p && lastBand.to === i - 1) lastBand.to = i;
    else bands.push({ from: i, to: i, p });
  });

  const reload = async () => {
    const res = await fetch("/api/season", { cache: "no-store" });
    if (res.ok) setSeason((await res.json()) as SeasonData);
  };

  return (
    <div className="lab-enter space-y-6">
      <div className="grid gap-3 sm:grid-cols-3">
        <div className="card lab-card p-4">
          <p className="label">{t("Current phase")}</p>
          <p className="num mt-2 text-2xl uppercase" style={{ color: phase ? FOCUS_COLOR[phase.focus] : undefined }}>{phase ? phase.name : "—"}</p>
          {phase && (
            <p className="mt-1 text-sm text-muted">
              {range(phase.hoursMin, phase.hoursMax, fmt)} h · {phase.runKmMin != null ? `${range(phase.runKmMin, phase.runKmMax ?? phase.runKmMin, fmt)} km ${t("run")}` : ""}
            </p>
          )}
        </div>
        <div className="card lab-card p-4">
          <p className="label">{t("Next A race")}</p>
          <p className="num mt-2 text-2xl uppercase" style={{ color: "var(--goal)" }}>{nextA?.name ?? "—"}</p>
          {nextA && (
            <p className="mt-1 text-sm text-muted">
              {fmt.dateLabel(`${nextA.date}T00:00:00`, { day: "2-digit", month: "long", year: "numeric" })} · {t("{n} weeks", { n: Math.round((Date.parse(mondayOf(nextA.date)) - Date.parse(current)) / (7 * 86_400_000)) })}
              {nextA.goal ? ` · ${t("goal")} ${nextA.goal}` : ""}
            </p>
          )}
        </div>
        <div className="card lab-card p-4">
          <p className="label">{t("This week")}</p>
          <p className="num mt-2 text-2xl">
            {fmt.num(hours.get(current) ?? 0, 1)} h <span className="label">{t("done")}</span>
          </p>
          <p className="mt-1 text-sm text-muted">
            {phaseOfWeek(season.phases, current) ? `${t("target")} ${range(phaseOfWeek(season.phases, current)!.hoursMin, phaseOfWeek(season.phases, current)!.hoursMax, fmt)} h` : ""}
            {planned.get(current) != null ? ` · ${t("planned")} ${fmt.num(planned.get(current)!, 1)} h` : ""}
          </p>
        </div>
      </div>

      <Panel title={t("Season timeline")} subtitle={t("From this week to the last A race: phases, races and the weekly hours (target range, planned in the planner, done).")}>
        <div className="-mx-1 overflow-x-auto px-1 pb-2">
          <svg width={width} height={height} role="img" aria-label={t("Season timeline")} className="block">
            {curIdx >= 0 && <rect x={x(curIdx)} y={0} width={COL} height={height - H_AXIS} rx={6} fill="var(--fg)" opacity={0.07} />}
            {bands.map((b) => (
              <g key={`${b.p.start}${b.p.name}`}>
                <rect x={x(b.from) + 1} y={4} width={(b.to - b.from + 1) * COL - 2} height={H_BANDS - 8} rx={5} fill={FOCUS_COLOR[b.p.focus]} opacity={0.85}>
                  <title>{`${b.p.name} · ${b.p.start} → ${b.p.end} · ${b.p.hoursMin}–${b.p.hoursMax} h`}</title>
                </rect>
                {(b.to - b.from + 1) * COL > 60 && (
                  <text x={x(b.from) + 7} y={H_BANDS / 2 + 4} fontSize={10} fill="var(--bg)" fontFamily="var(--font-mono)">
                    {clip(b.p.name, Math.floor(((b.to - b.from + 1) * COL - 12) / 6.2))}
                  </text>
                )}
              </g>
            ))}
            {byDate(season.races).map((r) => {
              const i = weeks.indexOf(mondayOf(r.date));
              if (i < 0) return null;
              const cx = x(i) + COL / 2;
              const cy = H_BANDS + H_RACES / 2;
              return (
                <g key={r.name + r.date}>
                  <line x1={cx} x2={cx} y1={H_BANDS} y2={H_BANDS + H_RACES + H_BARS} stroke={PRIORITY_COLOR[r.priority]} strokeDasharray="3 3" opacity={0.6} />
                  <circle cx={cx} cy={cy} r={11} fill={PRIORITY_COLOR[r.priority]} opacity={r.status === "upcoming" ? 1 : 0.5} />
                  <text x={cx} y={cy + 4} fontSize={11} textAnchor="middle" fill="var(--bg)" fontWeight={700}>
                    {r.priority}
                  </text>
                  <title>{`${r.priority} · ${r.name} · ${r.date}${r.result ? ` · ${r.result}` : ""}`}</title>
                </g>
              );
            })}
            {weeks.map((w, i) => {
              const p = phaseOfWeek(season.phases, w);
              const plan = planned.get(w);
              const done = hours.get(w);
              const past = w <= current;
              return (
                <g key={w}>
                  {p && <rect x={x(i) + 4} y={yBar(p.hoursMax)} width={COL - 8} height={Math.max(2, yBar(p.hoursMin) - yBar(p.hoursMax))} rx={3} fill={FOCUS_COLOR[p.focus]} opacity={0.22} />}
                  {plan != null && <rect x={x(i) + 6} y={yBar(plan)} width={COL - 12} height={yBar(0) - yBar(plan)} rx={3} fill="none" stroke="var(--fg)" strokeWidth={1.4} />}
                  {past && done != null && <rect className="bar-rise" style={{ animationDelay: `${Math.min(i, 30) * 25}ms` }} x={x(i) + 9} y={yBar(done)} width={COL - 18} height={yBar(0) - yBar(done)} rx={2} fill="var(--brand)" />}
                  <title>{`${w}${p ? ` · ${p.name} ${p.hoursMin}–${p.hoursMax} h` : ""}${plan != null ? ` · planned ${plan.toFixed(1)} h` : ""}${past && done != null ? ` · done ${done.toFixed(1)} h` : ""}`}</title>
                </g>
              );
            })}
            <line x1={0} x2={width} y1={yBar(0)} y2={yBar(0)} stroke="var(--line)" />
            {weeks.map((w, i) =>
              w.slice(8, 10) <= "07" ? (
                <text key={`m${w}`} x={x(i) + 2} y={height - 6} fontSize={10} fill="var(--muted)" fontFamily="var(--font-mono)">
                  {fmt.dateLabel(`${w}T00:00:00`, { month: "short" }).toUpperCase()}
                </text>
              ) : null,
            )}
          </svg>
        </div>
        <p className="label mt-3 flex flex-wrap gap-x-5 gap-y-1">
          {PHASE_FOCUSES.map((f) => (
            <span key={f} style={{ color: FOCUS_COLOR[f] }}>● {t(focusName(f))}</span>
          ))}
          <span>▭ {t("planned")}</span>
          <span style={{ color: "var(--brand)" }}>▮ {t("done")}</span>
          <span>░ {t("target range")}</span>
        </p>
      </Panel>

      {season.source === "seed" && <Hint>{t("These are the built-in season seeds. Run supabase/schema-season.sql in Supabase to edit races and phases here.")}</Hint>}

      <RacesEditor races={season.races} canEdit={session.unlocked && season.source === "db"} onSaved={reload} />
      <PhasesEditor phases={season.phases} canEdit={session.unlocked && season.source === "db"} onSaved={reload} />
      <LockedHint what={t("Enter the password to edit races and phases")} />
    </div>
  );
}

function range(a: number, b: number, fmt: { num: (n: number, d?: number) => string }) {
  return a === b ? fmt.num(a, 0) : `${fmt.num(a, 0)}–${fmt.num(b, 0)}`;
}
const clip = (s: string, n: number) => (s.length > n ? `${s.slice(0, Math.max(1, n - 1))}…` : s);
export const focusName = (f: PhaseFocus) =>
  ({ swim: "swim focus", bike: "bike focus", run: "run focus", mixed: "mixed", "race-specific": "race-specific", taper: "taper", recovery: "recovery" })[f];

async function send(method: "POST" | "DELETE", body: unknown): Promise<string | null> {
  const res = await fetch("/api/season", { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  if (res.ok) return null;
  const j = (await res.json().catch(() => ({}))) as { error?: string };
  return j.error ?? `Error ${res.status}`;
}

const EMPTY_RACE: SeasonRaceEntry = { name: "", date: "", type: "olympic", priority: "B", status: "upcoming" };

function RacesEditor({ races, canEdit, onSaved }: { races: SeasonRaceEntry[]; canEdit: boolean; onSaved: () => Promise<void> }) {
  const { t, fmt } = useI18n();
  const [edit, setEdit] = useState<SeasonRaceEntry | null>(null);
  const [error, setError] = useState<string | null>(null);
  const save = async () => {
    if (!edit) return;
    const e = await send("POST", { kind: "race", item: edit });
    setError(e);
    if (!e) {
      setEdit(null);
      await onSaved();
    }
  };
  const remove = async (r: SeasonRaceEntry) => {
    if (!r.id || !window.confirm(t("Remove {name}?", { name: r.name }))) return;
    const e = await send("DELETE", { kind: "race", id: r.id });
    setError(e);
    if (!e) await onSaved();
  };

  return (
    <Panel title={t("Races")} fold subtitle={t("Priority A = goal of the season (full taper), B = mini taper of 4 to 5 days, C = no taper.")}>
      <ul className="divide-y divide-line/60">
        {byDate(races).map((r) => (
          <li key={r.id ?? r.name + r.date} className="flex flex-wrap items-start gap-x-4 gap-y-1 py-3">
            <span className="num mt-0.5 w-7 text-2xl" style={{ color: PRIORITY_COLOR[r.priority] }}>{r.priority}</span>
            <span className="min-w-0 flex-1">
              <span className="block font-medium">{r.name}</span>
              <span className="label block">
                {fmt.dateLabel(`${r.date}T00:00:00`, { day: "2-digit", month: "short", year: "numeric" })} · {r.type}
                {r.location ? ` · ${r.location}` : ""} · {t(r.status)}
                {r.result ? ` · ${r.result}` : ""}
              </span>
              <span className="mt-0.5 block text-sm text-muted">
                {r.goal ? `${t("Goal")}: ${r.goal} · ` : ""}
                {t(taperRule(r.type, r.priority).text)}
                {r.status === "done" && (
                  <>
                    {" · "}
                    <a href="#races" className="text-brand underline-offset-2 hover:underline">{t("See the race result")}</a>
                  </>
                )}
              </span>
            </span>
            {canEdit && (
              <span className="flex gap-2">
                <button onClick={() => setEdit(r)} className="label rounded-full border border-line px-3 py-1.5 hover:text-fg">{t("Edit")}</button>
                <button onClick={() => void remove(r)} className="label rounded-full border border-line px-3 py-1.5 hover:text-fg">✕</button>
              </span>
            )}
          </li>
        ))}
      </ul>
      {canEdit && !edit && (
        <button onClick={() => setEdit({ ...EMPTY_RACE })} className="label mt-3 rounded-full border border-brand px-4 py-2 text-brand hover:bg-brand hover:text-bg">+ {t("Add a race")}</button>
      )}
      {edit && (
        <div className="mt-4 grid gap-3 rounded-2xl border border-line p-4 sm:grid-cols-2">
          <Field label={t("Name")}><input value={edit.name} onChange={(e) => setEdit({ ...edit, name: e.target.value })} className={INPUT} /></Field>
          <Field label={t("Date")}><input type="date" value={edit.date} onChange={(e) => setEdit({ ...edit, date: e.target.value })} className={INPUT} /></Field>
          <Field label={t("Location")}><input value={edit.location ?? ""} onChange={(e) => setEdit({ ...edit, location: e.target.value })} className={INPUT} /></Field>
          <Field label={t("Type")}>
            <select value={edit.type} onChange={(e) => setEdit({ ...edit, type: e.target.value as SeasonRaceEntry["type"] })} className={INPUT}>
              {RACE_TYPES.map((x) => <option key={x} value={x}>{x}</option>)}
            </select>
          </Field>
          <Field label={t("Priority")}>
            <select value={edit.priority} onChange={(e) => setEdit({ ...edit, priority: e.target.value as SeasonRaceEntry["priority"] })} className={INPUT}>
              {(["A", "B", "C"] as const).map((x) => <option key={x} value={x}>{x}</option>)}
            </select>
          </Field>
          <Field label={t("Status")}>
            <select value={edit.status} onChange={(e) => setEdit({ ...edit, status: e.target.value as SeasonRaceEntry["status"] })} className={INPUT}>
              {(["upcoming", "done", "dnf"] as const).map((x) => <option key={x} value={x}>{t(x)}</option>)}
            </select>
          </Field>
          <Field label={t("Goal")}><input value={edit.goal ?? ""} onChange={(e) => setEdit({ ...edit, goal: e.target.value })} placeholder="sub 4:10" className={INPUT} /></Field>
          <Field label={t("Result")}><input value={edit.result ?? ""} onChange={(e) => setEdit({ ...edit, result: e.target.value })} placeholder="4:49:19" className={INPUT} /></Field>
          <Field label={t("Notes")}><input value={edit.notes ?? ""} onChange={(e) => setEdit({ ...edit, notes: e.target.value })} className={INPUT} /></Field>
          <div className="flex items-end gap-2">
            <button onClick={() => void save()} className="label rounded-full border border-brand px-4 py-2 text-brand hover:bg-brand hover:text-bg">{t("Save")}</button>
            <button onClick={() => setEdit(null)} className="label rounded-full border border-line px-4 py-2 hover:text-fg">{t("Cancel")}</button>
          </div>
        </div>
      )}
      <ErrorNote error={error} className="mt-3" />
    </Panel>
  );
}

const EMPTY_PHASE: PhaseEntry = { start: "", end: "", name: "", focus: "mixed", hoursMin: 0, hoursMax: 0 };

function PhasesEditor({ phases, canEdit, onSaved }: { phases: PhaseEntry[]; canEdit: boolean; onSaved: () => Promise<void> }) {
  const { t, fmt } = useI18n();
  const [edit, setEdit] = useState<PhaseEntry | null>(null);
  const [error, setError] = useState<string | null>(null);
  const save = async () => {
    if (!edit) return;
    const e = await send("POST", { kind: "phase", item: edit });
    setError(e);
    if (!e) {
      setEdit(null);
      await onSaved();
    }
  };
  const remove = async (p: PhaseEntry) => {
    if (!p.id || !window.confirm(t("Remove {name}?", { name: p.name }))) return;
    const e = await send("DELETE", { kind: "phase", id: p.id });
    setError(e);
    if (!e) await onSaved();
  };
  const date = (d: string) => fmt.dateLabel(`${d}T00:00:00`, { day: "2-digit", month: "short" });

  return (
    <Panel title={t("Phases")} fold subtitle={t("The phases set the target hours of the planner and of the race builds. Weeks no phase covers use the automatic model.")}>
      <ul className="divide-y divide-line/60">
        {[...phases].sort((a, b) => (a.start < b.start ? -1 : 1)).map((p) => (
          <li key={p.id ?? p.start + p.name} className="flex flex-wrap items-start gap-x-4 gap-y-1 py-3">
            <span className="mt-1.5 size-3 shrink-0 rounded-full" style={{ background: FOCUS_COLOR[p.focus] }} />
            <span className="min-w-0 flex-1">
              <span className="block font-medium">{p.name}</span>
              <span className="label block">
                {date(p.start)} → {date(p.end)} · {t(focusName(p.focus))} · {range(p.hoursMin, p.hoursMax, fmt)} h
                {p.runKmMin != null ? ` · ${range(p.runKmMin, p.runKmMax ?? p.runKmMin, fmt)} km ${t("run")}` : ""}
              </span>
              {p.notes && <span className="mt-0.5 block text-sm text-muted">{p.notes}</span>}
            </span>
            {canEdit && (
              <span className="flex gap-2">
                <button onClick={() => setEdit(p)} className="label rounded-full border border-line px-3 py-1.5 hover:text-fg">{t("Edit")}</button>
                <button onClick={() => void remove(p)} className="label rounded-full border border-line px-3 py-1.5 hover:text-fg">✕</button>
              </span>
            )}
          </li>
        ))}
      </ul>
      {canEdit && !edit && (
        <button onClick={() => setEdit({ ...EMPTY_PHASE })} className="label mt-3 rounded-full border border-brand px-4 py-2 text-brand hover:bg-brand hover:text-bg">+ {t("Add a phase")}</button>
      )}
      {edit && (
        <div className="mt-4 grid gap-3 rounded-2xl border border-line p-4 sm:grid-cols-2">
          <Field label={t("Name")}><input value={edit.name} onChange={(e) => setEdit({ ...edit, name: e.target.value })} className={INPUT} /></Field>
          <Field label={t("Focus")}>
            <select value={edit.focus} onChange={(e) => setEdit({ ...edit, focus: e.target.value as PhaseFocus })} className={INPUT}>
              {PHASE_FOCUSES.map((f) => <option key={f} value={f}>{t(focusName(f))}</option>)}
            </select>
          </Field>
          <Field label={t("Start")}><input type="date" value={edit.start} onChange={(e) => setEdit({ ...edit, start: e.target.value })} className={INPUT} /></Field>
          <Field label={t("End")}><input type="date" value={edit.end} onChange={(e) => setEdit({ ...edit, end: e.target.value })} className={INPUT} /></Field>
          <Field label={t("Hours per week (min)")}><input inputMode="decimal" value={edit.hoursMin} onChange={(e) => setEdit({ ...edit, hoursMin: num(e.target.value) ?? 0 })} className={INPUT} /></Field>
          <Field label={t("Hours per week (max)")}><input inputMode="decimal" value={edit.hoursMax} onChange={(e) => setEdit({ ...edit, hoursMax: num(e.target.value) ?? 0 })} className={INPUT} /></Field>
          <Field label={t("Run km (min)")}><input inputMode="decimal" value={edit.runKmMin ?? ""} onChange={(e) => setEdit({ ...edit, runKmMin: num(e.target.value) })} className={INPUT} /></Field>
          <Field label={t("Run km (max)")}><input inputMode="decimal" value={edit.runKmMax ?? ""} onChange={(e) => setEdit({ ...edit, runKmMax: num(e.target.value) })} className={INPUT} /></Field>
          <Field label={t("Notes")}><input value={edit.notes ?? ""} onChange={(e) => setEdit({ ...edit, notes: e.target.value })} className={INPUT} /></Field>
          <div className="flex items-end gap-2">
            <button onClick={() => void save()} className="label rounded-full border border-brand px-4 py-2 text-brand hover:bg-brand hover:text-bg">{t("Save")}</button>
            <button onClick={() => setEdit(null)} className="label rounded-full border border-line px-4 py-2 hover:text-fg">{t("Cancel")}</button>
          </div>
        </div>
      )}
      <ErrorNote error={error} className="mt-3" />
    </Panel>
  );
}

const INPUT = "w-full rounded-xl border border-line bg-elev px-3 py-2.5 text-base text-fg";
const num = (v: string) => {
  const n = parseFloat(v.replace(",", "."));
  return Number.isFinite(n) ? n : undefined;
};

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="label mb-1 block">{label}</span>
      {children}
    </label>
  );
}
