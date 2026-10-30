"use client";

import { useMemo, useRef, useState } from "react";
import { useI18n } from "@/lib/i18n";
import { usePlanSession } from "@/lib/use-plan-session";
import { useSeason } from "@/lib/season-context";
import { weeklyHours } from "@/lib/lab/builds";
import { HAS_DISTANCE, PLAN_SPORTS, SPORT_LABEL, dayFilled, emptyDays, isComplete, planHash, totals } from "@/lib/lab/plan";
import { mondayOf } from "@/lib/lab/progress";
import { buildSeason, defaultPriority, type SeasonPhase, type SeasonRace, type SeasonWeek } from "@/lib/lab/season";
import type { LabData, PlanDay, PlanSport } from "@/lib/lab/types";
import type { Activity } from "@/lib/strava/types";
import { phaseOfWeek, triFormat, type PhaseFocus } from "@/lib/season-plan";
import { LockedHint } from "../EditLock";
import { DayEditor, DayStrip, type SlotPatch } from "./DayEditor";
import { ErrorNote } from "../ErrorNote";
import { WeekNav, type WeekRow } from "./WeekNav";
import { WeekReview } from "./WeekReview";

const PHASE_COLOR: Record<SeasonPhase, string> = {
  base: "var(--swim)",
  build: "var(--ride)",
  peak: "var(--run)",
  taper: "#b06bff",
  race: "var(--goal)",
  recovery: "var(--muted)",
};
const SPORT_COLOR: Record<PlanSport, string> = {
  run: "var(--run)",
  ride: "var(--ride)",
  swim: "var(--swim)",
  strength: "var(--goal)",
  other: "var(--muted)",
};
/** The phase a label like "Build week" or "Lighter week" stands for, to compare it with what the season model expects. */
function labelPhase(title: string | undefined): SeasonPhase | "lighter" | null {
  const w = (title ?? "").toLowerCase().split(" ")[0];
  if (w === "speed") return "build";
  if (w === "lighter") return "lighter";
  return (["base", "build", "peak", "taper", "race", "recovery"] as const).find((p) => p === w) ?? null;
}
type Status = "idle" | "saving" | "saved" | "describing" | `error:${string}`;
interface Written {
  title?: string;
  en: string;
  pt: string;
  hash?: string;
}

const FOCUS_LABEL: Record<PhaseFocus, string> = {
  swim: "swim focus",
  bike: "bike focus",
  run: "run focus",
  mixed: "mixed",
  "race-specific": "race-specific",
  taper: "taper",
  recovery: "recovery",
};

const addDays = (key: string, n: number) => new Date(Date.parse(key + "T00:00:00Z") + n * 86_400_000).toISOString().slice(0, 10);

/**
 * The training planner. One week at a time: a navigator (sidebar on a computer, a strip on a phone) picks the week, and
 * the week has three views: Plan (fill in the days), Review (what was planned against what happened) and Analysis (the
 * written reading of the week and where it sits in the season). Saving needs the password (the cookie).
 */
export function PlanTab({
  activities,
  lab,
  todayKey,
  onPlan,
}: {
  activities: Activity[];
  lab: LabData;
  todayKey: string;
  onPlan: (week: string, entry: { days: PlanDay[]; title?: string; description?: { en: string; pt: string; hash?: string } }) => void;
}) {
  const { t, fmt, lang } = useI18n();

  // ---- the season, from the race calendar and the real recent volume
  const seasonData = useSeason();
  const races = useMemo<SeasonRace[]>(
    () =>
      seasonData.races
        .filter((r) => r.status !== "dnf")
        .map((r) => ({ name: r.name, date: r.date, format: triFormat(r.type), type: r.type, goal: r.goal, priority: r.priority ?? defaultPriority(triFormat(r.type)), cycleStart: r.cycleStart })),
    [seasonData.races],
  );
  const hours = useMemo(() => weeklyHours(activities), [activities]);
  const current = mondayOf(todayKey);
  const recent = useMemo(() => {
    let s = 0;
    for (let i = 1; i <= 6; i++) s += hours.get(addDays(current, -7 * i)) ?? 0;
    return s / 6;
  }, [hours, current]);
  const season = useMemo(() => buildSeason(races, todayKey, recent, 52, seasonData.phases), [races, todayKey, recent, seasonData.phases]);

  // ---- what is already filled in
  const [plan, setPlan] = useState<Record<string, PlanDay[]>>(() => Object.fromEntries(lab.plannedWeeks.filter((w) => w.days).map((w) => [w.weekStart, w.days as PlanDay[]])));
  const [written, setWritten] = useState<Record<string, Written>>(() =>
    Object.fromEntries(lab.plannedWeeks.filter((w) => w.description).map((w) => [w.weekStart, { title: w.title, ...(w.description as { en: string; pt: string; hash?: string }) }])),
  );
  const [status, setStatus] = useState<Record<string, Status>>({});
  const [sel, setSel] = useState(current);

  // ---- write access: the server unlocks this device for 30 days with a signed httpOnly cookie (the key is never kept here)
  const session = usePlanSession();
  const timers = useRef<Record<string, ReturnType<typeof setTimeout>>>({});
  const set = (week: string, s: Status) => setStatus((p) => ({ ...p, [week]: s }));

  const call = async (path: string, body: unknown) => {
    const res = await fetch(path, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    const json = (await res.json().catch(() => ({}))) as { error?: string };
    if (!res.ok) throw new Error(json.error ?? `Error ${res.status}`);
    return json;
  };

  /** Saves the week; when it is complete and its description is out of date, asks for a new one. */
  const persist = async (week: string, days: PlanDay[]) => {
    set(week, "saving");
    try {
      await call("/api/plan", { weekStart: week, days });
      if (isComplete(days) && written[week]?.hash !== planHash(days)) {
        set(week, "describing");
        const d = (await call("/api/plan/describe", { weekStart: week })) as unknown as Written;
        setWritten((p) => ({ ...p, [week]: d }));
        onPlan(week, { days, title: d.title, description: { en: d.en, pt: d.pt, hash: d.hash } });
      }
      set(week, "saved");
    } catch (e) {
      set(week, `error:${e instanceof Error ? e.message : "failed"}`);
    }
  };

  const edit = (week: string, day: number, idx: number | null, patch: SlotPatch) => {
    const days = (plan[week] ?? emptyDays()).map((d) => {
      if (d.day !== day) return d;
      if ("rest" in patch) return { ...d, rest: patch.rest };
      if ("add" in patch) return d.slots.length >= 10 ? d : { ...d, slots: [...d.slots, { sport: patch.add, description: "", minutes: null, km: null }] };
      if ("remove" in patch) return { ...d, slots: d.slots.filter((_, i) => i !== idx) };
      return { ...d, slots: d.slots.map((x, i) => (i === idx ? { ...x, ...patch } : x)) };
    });
    setPlan((p) => ({ ...p, [week]: days }));
    onPlan(week, { days });
    if (!session.unlocked) return;
    clearTimeout(timers.current[week]);
    set(week, "idle");
    timers.current[week] = setTimeout(() => void persist(week, days), 1300);
  };

  // ---- the weeks: the last few already gone that have a plan, then the whole year ahead
  const weeks = useMemo<SeasonWeek[]>(() => {
    const past = Object.keys(plan)
      .filter((w) => w < current)
      .sort()
      .slice(-8)
      .map<SeasonWeek>((start) => {
        const p = phaseOfWeek(seasonData.phases, start);
        return { start, phase: "base", kind: "load", target: p ? (p.hoursMin + p.hoursMax) / 2 : 0, race: null, cycle: null, raceWeek: false, focus: [], seasonPhase: p, targetRange: p ? [p.hoursMin, p.hoursMax] : null, aRace: null };
      });
    return [...past, ...season];
  }, [plan, current, season, seasonData.phases]);

  const rows = useMemo<WeekRow[]>(() => {
    let lastBanner = "";
    return weeks.map((w) => {
      const d = plan[w.start];
      const tot = d ? totals(d).hours : 0;
      const lp = labelPhase(written[w.start]?.title);
      const color = lp && lp !== "lighter" ? PHASE_COLOR[lp] : lp === "lighter" ? "var(--muted)" : PHASE_COLOR[w.phase];
      const banner = w.race && w.race.name !== lastBanner ? t("Building towards {race}", { race: w.race.name }) : undefined;
      if (w.race) lastBanner = w.race.name;
      return {
        start: w.start,
        color,
        label: written[w.start]?.title ? t(written[w.start].title as string) : w.seasonPhase ? w.seasonPhase.name : `${t(w.phase)}${w.kind === "deload" ? ` · ${t("lighter week")}` : ""}`,
        plannedH: tot,
        targetH: w.target > 0 ? w.target : null,
        fill: d && isComplete(d) ? "complete" : d && d.some(dayFilled) ? "partial" : "empty",
        state: w.start < current ? "past" : w.start === current ? "current" : "future",
        banner,
      };
    });
  }, [weeks, plan, written, current, t]);

  const canEdit = session.unlocked;
  const w = weeks.find((x) => x.start === sel) ?? weeks[0];

  if (session.state === "checking") return null;
  if (!canEdit)
    return (
      <div className="space-y-4">
        <p className="rounded-2xl border border-dashed border-line p-4 text-sm text-muted">{t("Locked. Enter the edit key to open the planner.")}</p>
        <LockedHint what={t("Enter the password to open the planner")} />
      </div>
    );

  return (
    <div className="lab-enter space-y-5">
      {/* one slim line: the races and the recent volume */}
      <div className="flex flex-wrap items-center gap-x-5 gap-y-2 text-sm">
        {races
          .filter((r) => r.date >= current)
          .map((r) => (
            <span key={r.date} className="flex items-center gap-2">
              <span className="num text-xl" style={{ color: "var(--goal)" }}>{r.priority}</span>
              <span>{r.name}</span>
              <span className="label">{fmt.dateLabel(`${r.date}T00:00:00`, { day: "2-digit", month: "short", year: "numeric" })}</span>
            </span>
          ))}
        <span className="label ml-auto">{t("Recent real volume: {h} h per week (last 6 weeks)", { h: fmt.num(recent, 1) })}</span>
      </div>

      <div className="grid grid-cols-[minmax(0,1fr)] gap-5 lg:grid-cols-[17rem_minmax(0,1fr)] lg:gap-6">
        <WeekNav rows={rows} sel={w.start} onSel={setSel} />
        <WeekPanel
          key={w.start}
          w={w}
          days={plan[w.start] ?? emptyDays()}
          written={written[w.start]}
          status={status[w.start] ?? "idle"}
          onEdit={(day, idx, patch) => edit(w.start, day, idx, patch)}
          activities={activities}
          todayKey={todayKey}
          editable={canEdit}
          prevPlanned={totals(plan[addDays(w.start, -7)] ?? []).hours || null}
          lang={lang}
        />
      </div>
    </div>
  );
}

type View = "plan" | "review" | "analysis";

function WeekPanel({
  w,
  days,
  written,
  status,
  onEdit,
  editable,
  activities,
  todayKey,
  prevPlanned,
  lang,
}: {
  w: SeasonWeek;
  days: PlanDay[];
  written?: Written;
  status: Status;
  onEdit: (day: number, idx: number | null, patch: SlotPatch) => void;
  editable: boolean;
  activities: Activity[];
  todayKey: string;
  prevPlanned: number | null;
  lang: "en" | "pt";
}) {
  const { t, fmt } = useI18n();
  const started = w.start <= todayKey;
  const [view, setView] = useState<View>("plan");
  const [sel, setSel] = useState(() => {
    const idx = Math.round((Date.parse(todayKey) - Date.parse(w.start)) / 86_400_000);
    if (idx >= 0 && idx <= 6) return idx;
    const empty = days.findIndex((d) => !dayFilled(d));
    return empty >= 0 ? empty : 0;
  });
  const tot = totals(days);
  const done = isComplete(days);
  const lp = labelPhase(written?.title);
  const color = lp && lp !== "lighter" ? PHASE_COLOR[lp] : lp === "lighter" ? "var(--muted)" : PHASE_COLOR[w.phase];
  const dateOf = (iso: string) => fmt.dateLabel(`${iso}T00:00:00`, { day: "2-digit", month: "short" });
  const target = w.targetRange && w.targetRange[0] !== w.targetRange[1] ? `${fmt.num(w.targetRange[0], 0)}–${fmt.num(w.targetRange[1], 0)}` : w.target > 0 ? fmt.num(w.target, 1) : null;
  const views: { id: View; label: string }[] = [
    { id: "plan", label: t("Plan") },
    ...(started ? [{ id: "review" as const, label: t("Review") }] : []),
    { id: "analysis", label: t("Analysis") },
  ];

  return (
    <div className="min-w-0 space-y-4">
      {/* the head of the week: kept short, the rest lives in the views */}
      <header className="flex flex-wrap items-end justify-between gap-x-6 gap-y-2 rounded-2xl border border-line p-4 sm:p-5" style={{ borderLeft: `4px solid ${color}` }}>
        <div className="min-w-0">
          <p className="label">
            {dateOf(w.start)} – {dateOf(addDays(w.start, 6))}
            {w.start === mondayOf(todayKey) && <span className="ml-2 text-brand">{t("this week")}</span>}
          </p>
          <h3 className="num mt-1 text-3xl uppercase sm:text-4xl" style={{ color }}>
            {written?.title ? t(written.title) : w.seasonPhase ? w.seasonPhase.name : `${t(w.phase)}${w.kind === "deload" ? ` · ${t("lighter week")}` : ""}`}
          </h3>
        </div>
        <div className="text-right">
          <p className="num text-3xl leading-none">
            {tot.hours > 0 ? fmt.num(tot.hours, 1) : "-"} <span className="label">h {t("planned")}</span>
          </p>
          <p className="label mt-1 normal-case">
            {target ? t("target {h} h", { h: target }) : ""}
            {target && tot.km > 0 ? " · " : ""}
            {tot.km > 0 ? `${fmt.num(tot.km, 0)} km · ${t("{n} sessions", { n: tot.sessions })}` : ""}
            {done && <span className="ml-2 text-brand">✓ {t("complete")}</span>}
          </p>
        </div>
      </header>

      <div role="tablist" aria-label={t("View")} className="grid auto-cols-fr grid-flow-col gap-1 rounded-full border border-line p-1">
        {views.map((v) => (
          <button key={v.id} role="tab" aria-selected={view === v.id} onClick={() => setView(v.id)} className={`label rounded-full px-3 py-2.5 transition-colors ${view === v.id ? "lab-tab-on bg-fg text-bg" : "hover:text-fg"}`}>
            {v.label}
          </button>
        ))}
      </div>

      {view === "plan" && (
        <div className="fade-up space-y-4">
          <DayStrip days={days} sel={sel} onSel={setSel} today={todayKey} weekStart={w.start} />
          <div className="rounded-2xl border border-line p-3 sm:p-5">
            <DayEditor day={days[sel]} weekStart={w.start} editable={editable} onEdit={onEdit} />
          </div>

          <div className="flex flex-wrap items-center gap-x-5 gap-y-1">
            {PLAN_SPORTS.filter((sp) => tot.bySport[sp].sessions > 0).map((sp) => {
              const x = tot.bySport[sp];
              return (
                <span key={sp} className="label">
                  <span style={{ color: SPORT_COLOR[sp] }}>{t(SPORT_LABEL[sp])}</span> {fmt.num(x.minutes / 60, 1)} h{HAS_DISTANCE[sp] ? ` · ${fmt.num(x.km, 0)} km` : ""}
                </span>
              );
            })}
            <span className="label ml-auto">
              {status === "saving" ? t("Saving…") : status === "describing" ? t("Analysing the week…") : status === "saved" ? <span className="fade-up text-brand">✓ {t("Saved")}</span> : ""}
            </span>
          </div>
          {status.startsWith("error:") && <ErrorNote error={status.slice(6)} />}
        </div>
      )}

      {view === "review" && <WeekReview weekStart={w.start} days={days} activities={activities} todayKey={todayKey} editable={editable} />}

      {view === "analysis" && <AnalysisView w={w} written={written} days={days} done={done} tot={tot.hours} prevPlanned={prevPlanned} lang={lang} color={color} />}
    </div>
  );
}

/** The written reading of the week, and where it sits in the season: the model's expectation, the phase and what the week should hold. */
function AnalysisView({ w, written, days, done, tot, prevPlanned, lang, color }: { w: SeasonWeek; written?: Written; days: PlanDay[]; done: boolean; tot: number; prevPlanned: number | null; lang: "en" | "pt"; color: string }) {
  const { t, fmt } = useI18n();
  const lp = labelPhase(written?.title);
  const differs = lp !== null && (lp === "lighter" ? !(w.kind === "deload" || w.phase === "recovery") : lp !== w.phase);
  const vsTarget = tot > 0 && w.target > 0 ? ((tot - w.target) / w.target) * 100 : null;
  const vsPrev = prevPlanned && tot > 0 ? ((tot - prevPlanned) / prevPlanned) * 100 : null;
  const position = w.cycle
    ? w.phase === "recovery"
      ? t("Recovery after the race")
      : w.raceWeek
        ? t("Race week")
        : t("Week {a} of {b} · {n} weeks to the race", { a: w.cycle.week, b: w.cycle.length, n: w.cycle.weeksToRace })
    : w.race
      ? t("Base block before {race}", { race: w.race.name })
      : t("Base block");

  return (
    <div className="fade-up space-y-4">
      <section className="rounded-2xl border border-line p-4">
        <p className="label">{t("Week analysis")}</p>
        {written ? (
          <>
            <p className="mt-2 whitespace-pre-line leading-relaxed">{lang === "pt" ? written.pt : written.en}</p>
            {written.hash && written.hash !== planHash(days) && <p className="label mt-3">{t("The plan changed since this was analysed: it is analysed again when the week is complete and saved.")}</p>}
          </>
        ) : (
          <p className="mt-2 text-sm text-muted">{done ? t("Saving the week analyses it.") : t("When every day is filled in (or marked as a rest day), the week is analysed and labelled.")}</p>
        )}
      </section>

      <section className="rounded-2xl border border-line p-4">
        <p className="label">{t("Where it sits")}</p>
        <p className="mt-2 text-sm">{position}</p>
        {w.seasonPhase && (
          <p className="mt-1 text-sm">
            <span className="label mr-2" style={{ color }}>{t("Phase")}</span>
            {w.seasonPhase.name}
            <span className="text-muted"> · {t(FOCUS_LABEL[w.seasonPhase.focus])}</span>
            {w.seasonPhase.runKmMin != null && <span className="text-muted"> · {t("run {km} km", { km: w.seasonPhase.runKmMin === w.seasonPhase.runKmMax ? fmt.num(w.seasonPhase.runKmMin, 0) : `${fmt.num(w.seasonPhase.runKmMin, 0)}–${fmt.num(w.seasonPhase.runKmMax ?? w.seasonPhase.runKmMin, 0)}` })}</span>}
          </p>
        )}
        {w.aRace && <p className="mt-1 text-sm text-muted">{t("Builds towards the A race: {race}", { race: w.aRace.name })} · {fmt.dateLabel(`${w.aRace.date}T00:00:00`, { day: "2-digit", month: "short", year: "numeric" })}</p>}
        {differs && <p className="label mt-2" style={{ color: "var(--goal)" }}>{t("The season model expected: {phase}", { phase: t(w.kind === "deload" ? "lighter week" : w.phase) })}</p>}
        <p className="label mt-3 normal-case">
          {vsTarget !== null && t("{p}% vs suggested", { p: `${vsTarget > 0 ? "+" : ""}${Math.round(vsTarget)}` })}
          {vsTarget !== null && vsPrev !== null ? " · " : ""}
          {vsPrev !== null && t("{p}% vs previous week", { p: `${vsPrev > 0 ? "+" : ""}${Math.round(vsPrev)}` })}
        </p>
      </section>

      {w.focus.length > 0 && (
        <section className="rounded-2xl border border-line p-4">
          <p className="label">{t("What this week should hold")}</p>
          <ul className="mt-2 grid gap-x-6 gap-y-1 text-sm text-muted sm:grid-cols-2">
            {w.focus.map((f) => (
              <li key={f} className="flex gap-2">
                <span style={{ color }}>▸</span>
                {t(f)}
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
