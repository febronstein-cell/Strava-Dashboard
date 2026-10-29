"use client";

import { useEffect, useMemo, useState } from "react";
import { useI18n } from "@/lib/i18n";
import {
  hrCapCompliance,
  lapPace,
  matchWeek,
  rangeCompliance,
  sessionCompliance,
  weekCompliance,
  workReps,
  type Color,
  type DayMatch,
  type Lap,
  type MatchedEntry,
  type Override,
} from "@/lib/compliance";
import { DAY_NAMES, SPORT_LABEL } from "@/lib/lab/plan";
import type { PlanDay } from "@/lib/lab/types";
import type { Activity } from "@/lib/strava/types";
import { SPORT_COLOR, clock, structureText, targetText } from "./SlotEditor";

const COLOR: Record<Color, string> = { green: "#1fe08a", yellow: "#ffb020", red: "#ff4d4d", grey: "var(--muted)" };
const hm = (s: number) => `${Math.floor(s / 3600)}:${String(Math.round((s % 3600) / 60)).padStart(2, "0")}`;

interface Actuals {
  overrides: Record<number, Override>;
  laps: Record<number, Lap[]>;
  pending: number[];
  /** seconds at each bpm per activity, for the HR-cap check (from the streams) */
  hrHist?: Record<number, Record<string, number>>;
}

/**
 * Plan against reality for one week: per sport planned vs done, sessions done, missed and unplanned, key sessions,
 * a compliance score, and for each day every session side by side with its colors and, when it has a target,
 * the reps against it (the first rep apart).
 */
export function PlanVsDone({ weekStart, days, activities, todayKey, editable }: { weekStart: string; days: PlanDay[]; activities: Activity[]; todayKey: string; editable: boolean }) {
  const { t, fmt } = useI18n();
  const [actuals, setActuals] = useState<Actuals | null>(null);
  const [reload, setReload] = useState(0);

  useEffect(() => {
    if (!editable) return;
    let alive = true;
    fetch(`/api/plan/actuals?week=${weekStart}`, { cache: "no-store" })
      .then((r) => (r.ok ? (r.json() as Promise<Actuals>) : null))
      .then((d) => alive && d && setActuals(d))
      .catch(() => undefined);
    return () => {
      alive = false;
    };
  }, [weekStart, editable, reload]);

  const matched = useMemo(() => matchWeek(days, weekStart, activities, actuals?.overrides ?? {}), [days, weekStart, activities, actuals?.overrides]);
  const week = useMemo(() => weekCompliance(matched, todayKey), [matched, todayKey]);

  const rematch = async (activityId: number, value: string) => {
    const body =
      value === "auto" ? { activityId, clear: true } : value === "none" ? { activityId, weekStart, slot: null } : { activityId, weekStart, day: Number(value.split(":")[0]), slot: Number(value.split(":")[1]) };
    await fetch("/api/plan/match", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    setReload((n) => n + 1);
  };
  const options = matched.flatMap((d) => d.entries.map((e) => ({ value: `${e.day}:${e.slot}`, label: `${t(DAY_NAMES[e.day]).slice(0, 3)} · ${t(SPORT_LABEL[e.entry.sport])}${e.entry.description ? ` · ${e.entry.description.slice(0, 24)}` : ""}` })));

  if (week.planned === 0 && week.unplanned === 0) return null;
  const sports = Object.entries(week.bySport).filter(([, s]) => s.plannedH > 0 || s.doneH > 0);

  return (
    <section className="rounded-2xl border border-line p-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <p className="label">{t("Plan vs done")}</p>
        {week.score !== null && (
          <p className="num text-2xl" style={{ color: week.score >= 80 ? COLOR.green : week.score >= 50 ? COLOR.yellow : COLOR.red }}>
            {week.score}% <span className="label">{t("compliance")}</span>
          </p>
        )}
      </div>

      <div className="mt-2 flex flex-wrap gap-x-5 gap-y-1 text-sm">
        <span>{t("{a} of {b} sessions done", { a: week.done, b: week.planned })}</span>
        {week.missed > 0 && <span style={{ color: COLOR.red }}>{t("{n} missed", { n: week.missed })}</span>}
        {week.unplanned > 0 && <span className="text-muted">{t("{n} unplanned", { n: week.unplanned })}{week.unplannedOnRest ? ` (${t("{n} on rest days", { n: week.unplannedOnRest })})` : ""}</span>}
        {week.keyPlanned > 0 && <span>{t("Key sessions {a} of {b}", { a: week.keyDone, b: week.keyPlanned })}</span>}
      </div>

      <ul className="mt-3 grid gap-2 sm:grid-cols-2">
        {sports.map(([sport, s]) => (
          <li key={sport} className="text-sm">
            <span className="label" style={{ color: SPORT_COLOR[sport as keyof typeof SPORT_COLOR] }}>{t(SPORT_LABEL[sport as keyof typeof SPORT_LABEL])}</span>{" "}
            {fmt.num(s.doneH, 1)} / {fmt.num(s.plannedH, 1)} h
            {s.plannedKm > 0 || s.doneKm > 0 ? ` · ${fmt.num(s.doneKm, 0)} / ${fmt.num(s.plannedKm, 0)} km` : ""}
          </li>
        ))}
      </ul>

      <ul className="mt-4 divide-y divide-line/60">
        {matched
          .filter((d) => d.date <= todayKey && (d.entries.length || d.unplanned.length))
          .map((d) => (
            <DayRow key={d.day} d={d} actuals={actuals} editable={editable} options={options} onRematch={rematch} />
          ))}
      </ul>
      {actuals && actuals.pending.length > 0 && <p className="label mt-2">{t("Some laps are still being fetched from Strava: open the week again in a moment.")}</p>}
    </section>
  );
}

function DayRow({ d, actuals, editable, options, onRematch }: { d: DayMatch; actuals: Actuals | null; editable: boolean; options: { value: string; label: string }[]; onRematch: (id: number, v: string) => void }) {
  const { t } = useI18n();
  const doubles = new Map<string, number>();
  return (
    <li className="py-3">
      <p className="label">
        {t(DAY_NAMES[d.day])}
        {d.rest && ` · ${t("Rest day")}`}
      </p>
      <div className="mt-2 space-y-3">
        {d.entries.map((e) => {
          const n = (doubles.get(e.entry.sport) ?? 0) + 1;
          doubles.set(e.entry.sport, n);
          return <EntryRow key={e.slot} e={e} nth={n} actuals={actuals} editable={editable} options={options} onRematch={onRematch} />;
        })}
        {d.unplanned.map((a) => (
          <div key={a.id} className="rounded-xl border border-dashed border-line p-3 text-sm">
            <span className="label">{d.rest ? t("Unplanned on a rest day") : t("Unplanned")}</span>
            <p className="mt-1">
              <span style={{ color: SPORT_COLOR[a.sport as keyof typeof SPORT_COLOR] }}>{t(SPORT_LABEL[a.sport as keyof typeof SPORT_LABEL] ?? a.sport)}</span> · {a.name} · {hm(a.elapsedTime)}
              {a.distance > 0 ? ` · ${(a.distance / 1000).toFixed(1)} km` : ""}
            </p>
            {editable && <Rematch id={a.id} options={options} onRematch={onRematch} />}
          </div>
        ))}
      </div>
    </li>
  );
}

function EntryRow({ e, nth, actuals, editable, options, onRematch }: { e: MatchedEntry; nth: number; actuals: Actuals | null; editable: boolean; options: { value: string; label: string }[]; onRematch: (id: number, v: string) => void }) {
  const { t, fmt } = useI18n();
  const c = sessionCompliance(e);
  const a = e.activity;
  const laps = a ? actuals?.laps[a.id] : undefined;
  const target = e.entry.target;
  const kind = target?.type === "power-range" ? "power" : "pace";
  const reps = a && laps && (target?.type === "pace-range" || target?.type === "power-range" || target?.type === "hr-range") ? workReps(laps, e.entry.structure, kind) : null;
  const range = reps && target ? rangeCompliance(reps, target) : null;
  const cap = a && target?.type === "hr-cap" && (target.max ?? target.min) ? hrCapCompliance((target.max ?? target.min)!, { hist: actuals?.hrHist?.[a.id], laps }) : null;
  const fmtValue = (v: number | null) => (v == null ? "—" : target?.type === "pace-range" ? `${clock(v)} /km` : target?.type === "power-range" ? `${Math.round(v)} W` : `${Math.round(v)} bpm`);

  return (
    <div className="rounded-xl border border-line p-3" style={{ borderLeft: `4px solid ${COLOR[c.duration.color === "grey" && a ? c.distance.color : c.duration.color]}` }}>
      <div className="grid gap-2 sm:grid-cols-2">
        <div className="text-sm">
          <p className="label">
            {t("Plan")} · <span style={{ color: SPORT_COLOR[e.entry.sport] }}>{t(SPORT_LABEL[e.entry.sport])}</span>
            {nth > 1 ? ` · ${t("PM")}` : ""}
            {e.entry.key && <span className="ml-2 rounded-full border border-current px-1.5 text-[10px]">{t("key")}</span>}
          </p>
          <p className="mt-0.5">{e.entry.name ? <span className="font-medium">{e.entry.name}</span> : null}{e.entry.name && e.entry.description ? " · " : ""}{e.entry.description || (e.entry.name ? "" : "—")}</p>
          <p className="label mt-0.5 normal-case">
            {[e.entry.minutes ? `${Math.floor(e.entry.minutes / 60)}:${String(e.entry.minutes % 60).padStart(2, "0")} h` : null, e.entry.km ? `${e.entry.km} km` : null, e.entry.structure && structureText(e.entry.structure), target && targetText(target)]
              .filter(Boolean)
              .join(" · ")}
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
            <p className="mt-0.5">
              <Chip color="grey">{t("Missed")}</Chip>
            </p>
          )}
        </div>
      </div>

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
                  <td className="py-1 pr-3">{r.distM ? `${Math.round(r.distM)} m` : "—"}</td>
                  <td className="py-1">{r.hr ? Math.round(r.hr) : "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {a && laps && !range && target && target.type !== "hr-cap" && <p className="label mt-2">{t("No laps matched the planned reps.")}</p>}
      {a && target && !laps && actuals && <p className="label mt-2">{t("Laps not loaded yet.")}</p>}
      {a && editable && <Rematch id={a.id} options={options} onRematch={onRematch} />}
      {a && laps && !target && laps.length > 1 && (
        <p className="label mt-2 normal-case">
          {t("Laps")}: {laps.slice(0, 12).map((l) => (lapPace(l) ? clock(lapPace(l)!) : "—")).join(" · ")}
        </p>
      )}
    </div>
  );
}

function Rematch({ id, options, onRematch }: { id: number; options: { value: string; label: string }[]; onRematch: (id: number, v: string) => void }) {
  const { t } = useI18n();
  return (
    <label className="mt-2 flex items-center gap-2 text-xs text-muted">
      {t("Match to")}
      <select defaultValue="" onChange={(e) => e.target.value && onRematch(id, e.target.value)} className="min-w-0 flex-1 rounded-lg border border-line bg-elev px-2 py-1.5 text-fg">
        <option value="">—</option>
        <option value="auto">{t("Automatic")}</option>
        <option value="none">{t("Unplanned")}</option>
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </label>
  );
}

function Chip({ color, children }: { color: Color; children: React.ReactNode }) {
  return (
    <span className="rounded-full px-2 py-0.5 text-xs" style={{ background: `color-mix(in srgb, ${COLOR[color]} 18%, transparent)`, color: COLOR[color], border: `1px solid ${COLOR[color]}` }}>
      {children}
    </span>
  );
}
