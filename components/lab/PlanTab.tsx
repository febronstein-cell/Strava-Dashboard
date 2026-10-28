"use client";

import { useMemo, useRef, useState } from "react";
import { useI18n } from "@/lib/i18n";
import { usePlanSession } from "@/lib/use-plan-session";
import { useSeason } from "@/lib/season-context";
import { weeklyHours } from "@/lib/lab/builds";
import { DAY_NAMES, HAS_DISTANCE, PLAN_SPORTS, SPORT_LABEL, dayFilled, emptyDays, fmtMinutes, isComplete, parseMinutes, planHash, totals } from "@/lib/lab/plan";
import { mondayOf } from "@/lib/lab/progress";
import { buildSeason, defaultPriority, type SeasonPhase, type SeasonRace, type SeasonWeek } from "@/lib/lab/season";
import type { LabData, PlanDay, PlanSlot, PlanSport } from "@/lib/lab/types";
import type { Activity } from "@/lib/strava/types";
import { triFormat, type PhaseFocus } from "@/lib/season-plan";
import { Hint, Panel } from "./LabBits";

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

/** Minutes planned in one day (a rest day counts as none). */
const dayMinutes = (d: PlanDay) => (d.rest ? 0 : d.slots.reduce((s, x) => s + (x.minutes ?? 0), 0));

const addDays = (key: string, n: number) => new Date(Date.parse(key + "T00:00:00Z") + n * 86_400_000).toISOString().slice(0, 10);

/**
 * The training planner (hidden part of the Lab). The whole year is laid out from the race calendar; the weeks are
 * filled in day by day (description, time, distance). When all 7 days of a week are filled, the week gets a written
 * description that knows where it sits in the cycle and what the race asks for. Saving needs the edit key.
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
  const [open, setOpen] = useState<Set<string>>(() => new Set(season.slice(0, 2).map((w) => w.start)));
  const [showAll, setShowAll] = useState(false);

  // ---- write access: the server unlocks this device for 30 days with a signed httpOnly cookie (the key is never kept here)
  const session = usePlanSession();
  const [draft, setDraft] = useState("");
  const [keyState, setKeyState] = useState<"idle" | "checking" | "wrong" | "error">("idle");
  const unlock = async () => {
    if (!draft) return;
    setKeyState("checking");
    const ok = await session.unlock(draft);
    if (ok) {
      setDraft("");
      setKeyState("idle");
    } else {
      setKeyState(ok === false ? "wrong" : "error");
    }
  };
  const lock = () => void session.lock();

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

  const edit = (week: string, day: number, sport: PlanSport | null, patch: Partial<PlanSlot> | { rest: boolean }) => {
    const days = (plan[week] ?? emptyDays()).map((d) => {
      if (d.day !== day) return d;
      if (sport === null) return { ...d, ...(patch as { rest: boolean }) };
      return { ...d, slots: d.slots.map((x) => (x.sport === sport ? { ...x, ...patch } : x)) };
    });
    setPlan((p) => ({ ...p, [week]: days }));
    onPlan(week, { days });
    if (!session.unlocked) return;
    clearTimeout(timers.current[week]);
    set(week, "idle");
    timers.current[week] = setTimeout(() => void persist(week, days), 1300);
  };

  const canEdit = session.unlocked;
  const shown = showAll ? season : season.slice(0, 12);

  return (
    <div className="lab-enter space-y-6">
      <Panel
        title={t("Training planner")}
        subtitle={t("The whole year, laid out from your race goals. Fill each day by sport; when every day is filled, the week is analysed against what you really trained and labelled: base, build, speed, lighter...")}
        aside={
          canEdit ? (
            <button onClick={lock} className="label rounded-full border border-line px-4 py-1.5 transition-colors hover:text-fg">
              {t("Unlocked · lock")}
            </button>
          ) : (
            <form
              onSubmit={(e) => {
                e.preventDefault();
                void unlock();
              }}
              className="label flex flex-wrap items-center gap-2"
            >
              {t("Edit key")}
              <input
                type="password"
                value={draft}
                onChange={(e) => {
                  setDraft(e.target.value);
                  setKeyState("idle");
                }}
                placeholder={t("needed to save")}
                autoComplete="off"
                className="w-36 rounded-full border border-line bg-elev px-3 py-1.5 normal-case text-fg"
              />
              <button type="submit" disabled={!draft || keyState === "checking"} className="rounded-full border border-line px-4 py-1.5 transition-colors hover:text-fg disabled:opacity-50">
                {keyState === "checking" ? t("Checking…") : t("Unlock")}
              </button>
              {keyState === "wrong" && <span style={{ color: "var(--goal)" }}>{t("Wrong key")}</span>}
              {keyState === "error" && <span style={{ color: "var(--goal)" }}>{t("Could not check the key")}</span>}
            </form>
          )
        }
      >
        {!canEdit && <Hint>{t("Locked. Enter the edit key to open the planner.")}</Hint>}
        {canEdit && (
          <>
        <ul className="mt-3 flex flex-wrap gap-x-6 gap-y-2">
          {races
            .filter((r) => r.date >= current)
            .map((r) => (
              <li key={r.date} className="text-sm">
                <span className="num mr-2 text-xl" style={{ color: "var(--goal)" }}>{r.priority}</span>
                {r.name} <span className="label">{fmt.dateLabel(`${r.date}T00:00:00`, { day: "2-digit", month: "short", year: "numeric" })}</span>
              </li>
            ))}
        </ul>
        <p className="label mt-4">{t("Recent real volume: {h} h per week (last 6 weeks)", { h: fmt.num(recent, 1) })}</p>
          </>
        )}
      </Panel>

      {canEdit && shown.map((w, i) => {
        const prev = shown[i - 1];
        const banner = w.race && w.race.date !== prev?.race?.date;
        return (
          <div key={w.start} className="space-y-3">
            {banner && w.race && (
              <p className="label pt-2" style={{ color: "var(--goal)" }}>
                {t("Building towards {race}", { race: w.race.name })} · {fmt.dateLabel(`${w.race.date}T00:00:00`, { day: "2-digit", month: "long", year: "numeric" })}
                {w.race.format ? ` · ${w.race.format}` : ""} · {t("priority {p}", { p: w.race.priority })}
              </p>
            )}
            <WeekCard
              w={w}
              days={plan[w.start] ?? emptyDays()}
              written={written[w.start]}
              status={status[w.start] ?? "idle"}
              isOpen={open.has(w.start)}
              toggle={() => setOpen((s) => { const n = new Set(s); if (n.has(w.start)) n.delete(w.start); else n.add(w.start); return n; })}
              onEdit={(day, sport, patch) => edit(w.start, day, sport, patch)}
              editable={canEdit}
              prevPlanned={totals(plan[addDays(w.start, -7)] ?? []).hours || null}
              lang={lang}
            />
          </div>
        );
      })}

      {canEdit && !showAll && season.length > shown.length && (
        <button onClick={() => setShowAll(true)} className="label rounded-full border border-line px-5 py-3 transition-colors hover:text-fg">
          {t("Show the rest of the year ({n} more weeks)", { n: season.length - shown.length })}
        </button>
      )}
    </div>
  );
}

function WeekCard({
  w,
  days,
  written,
  status,
  isOpen,
  toggle,
  onEdit,
  editable,
  prevPlanned,
  lang,
}: {
  w: SeasonWeek;
  days: PlanDay[];
  written?: Written;
  status: Status;
  isOpen: boolean;
  toggle: () => void;
  onEdit: (day: number, sport: PlanSport | null, patch: Partial<PlanSlot> | { rest: boolean }) => void;
  editable: boolean;
  prevPlanned: number | null;
  lang: "en" | "pt";
}) {
  const { t, fmt } = useI18n();
  const tot = totals(days);
  const done = isComplete(days);
  const vsTarget = tot.hours > 0 ? ((tot.hours - w.target) / w.target) * 100 : null;
  const vsPrev = prevPlanned && tot.hours > 0 ? ((tot.hours - prevPlanned) / prevPlanned) * 100 : null;
  const end = addDays(w.start, 6);
  const lp = labelPhase(written?.title);
  const differs = lp !== null && (lp === "lighter" ? !(w.kind === "deload" || w.phase === "recovery") : lp !== w.phase);
  const color = lp && lp !== "lighter" ? PHASE_COLOR[lp] : lp === "lighter" ? "var(--muted)" : PHASE_COLOR[w.phase];
  const dateOf = (iso: string) => fmt.dateLabel(`${iso}T00:00:00`, { day: "2-digit", month: "short" });
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
    <div className="card lab-glow min-w-0 p-4 sm:p-6" style={{ borderLeft: `4px solid ${color}` }}>
      <button onClick={toggle} aria-expanded={isOpen} className="flex w-full flex-wrap items-start justify-between gap-x-4 gap-y-2 text-left">
        <span className="min-w-0">
          <span className="label block">
            {dateOf(w.start)} – {dateOf(end)}
          </span>
          <span className="num mt-1 block text-2xl uppercase sm:text-3xl" style={{ color }}>
            {written?.title ? t(written.title) : `${t(w.phase)}${w.kind === "deload" ? ` · ${t("lighter week")}` : ""}`}
          </span>
          <span className="mt-0.5 block text-sm text-muted">{position}</span>
          {w.seasonPhase && (
            <span className="mt-1 block text-sm">
              <span className="label mr-2" style={{ color }}>{t("Phase")}</span>
              {w.seasonPhase.name}
              <span className="text-muted"> · {t(FOCUS_LABEL[w.seasonPhase.focus])}</span>
              {w.seasonPhase.runKmMin != null && (
                <span className="text-muted"> · {t("run {km} km", { km: w.seasonPhase.runKmMin === w.seasonPhase.runKmMax ? fmt.num(w.seasonPhase.runKmMin, 0) : `${fmt.num(w.seasonPhase.runKmMin, 0)}–${fmt.num(w.seasonPhase.runKmMax ?? w.seasonPhase.runKmMin, 0)}` })}</span>
              )}
            </span>
          )}
          {w.aRace && (
            <span className="mt-0.5 block text-sm text-muted">
              {t("Builds towards the A race: {race}", { race: w.aRace.name })} · {fmt.dateLabel(`${w.aRace.date}T00:00:00`, { day: "2-digit", month: "short", year: "numeric" })}
            </span>
          )}
          {differs && (
            <span className="label mt-1 block" style={{ color: "var(--goal)" }}>
              {t("The season model expected: {phase}", { phase: t(w.kind === "deload" ? "lighter week" : w.phase) })}
            </span>
          )}
        </span>
        <span className="text-right">
          <span className="num block text-2xl">
            {tot.hours > 0 ? `${fmt.num(tot.hours, 1)} h` : "—"}
            <span className="label ml-2">{t("planned")}</span>
          </span>
          <span className="label block">
            {w.targetRange && w.targetRange[0] !== w.targetRange[1]
              ? t("phase target {a}–{b} h", { a: fmt.num(w.targetRange[0], 0), b: fmt.num(w.targetRange[1], 0) })
              : t("suggested {h} h", { h: fmt.num(w.target, 1) })}
          </span>
          {done && <span className="label block text-brand">{t("complete")}</span>}
        </span>
      </button>

      {isOpen && (
        <div className="mt-4 space-y-4">
          <ul className="grid gap-x-6 gap-y-1 text-sm text-muted sm:grid-cols-2">
            {w.focus.map((f) => (
              <li key={f} className="flex gap-2">
                <span style={{ color }}>▸</span>
                {t(f)}
              </li>
            ))}
          </ul>

          <ul className="divide-y divide-line/60">
            {days.map((d) => (
              <li key={d.day} className="py-3">
                <div className="flex items-center justify-between gap-3">
                  <span className="label">
                    {t(DAY_NAMES[d.day])}
                    {!dayFilled(d) && <span className="ml-2 opacity-60">·</span>}
                    <span className="num ml-3 text-xl normal-case text-fg">{dayMinutes(d) > 0 ? `${fmtMinutes(dayMinutes(d))} h` : d.rest ? "" : "—"}</span>
                  </span>
                  <label className="label flex items-center gap-2">
                    <input type="checkbox" checked={Boolean(d.rest)} disabled={!editable} onChange={(e) => onEdit(d.day, null, { rest: e.target.checked })} className="h-4 w-4 accent-[var(--brand)]" />
                    {t("Rest day")}
                  </label>
                </div>
                {!d.rest && (
                  <div className="mt-2 space-y-2.5">
                    {PLAN_SPORTS.map((sport) => {
                      const slot = d.slots.find((x) => x.sport === sport) as PlanSlot;
                      const km = HAS_DISTANCE[sport];
                      return (
                        <div key={sport} className="grid grid-cols-[1fr_5rem_5rem] items-start gap-x-2 gap-y-1.5 sm:grid-cols-[5.5rem_1fr_5rem_5rem]">
                          <span className="label col-span-3 sm:col-span-1 sm:pt-2.5" style={{ color: SPORT_COLOR[sport] }}>
                            {t(SPORT_LABEL[sport])}
                          </span>
                          <textarea
                            value={slot.description}
                            onChange={(e) => onEdit(d.day, sport, { description: e.target.value })}
                            readOnly={!editable}
                            rows={1}
                            placeholder={t("Workout (optional)")}
                            className="col-span-3 min-h-10 w-full resize-y rounded-xl border border-line bg-elev px-3 py-2 text-sm text-fg read-only:opacity-80 sm:col-span-1"
                          />
                          <input
                            key={`${w.start}-${d.day}-${sport}-t-${slot.minutes}`}
                            defaultValue={fmtMinutes(slot.minutes)}
                            onBlur={(e) => onEdit(d.day, sport, { minutes: parseMinutes(e.target.value) })}
                            readOnly={!editable}
                            inputMode="text"
                            placeholder={t("Time")}
                            aria-label={`${t(SPORT_LABEL[sport])} · ${t("Time")}`}
                            className="col-start-2 w-full rounded-xl border border-line bg-elev px-3 py-2 text-sm normal-case text-fg sm:col-start-auto"
                          />
                          {km && (
                            <input
                              key={`${w.start}-${d.day}-${sport}-km-${slot.km}`}
                              defaultValue={slot.km ?? ""}
                              onBlur={(e) => {
                                const v = parseFloat(e.target.value.replace(",", "."));
                                onEdit(d.day, sport, { km: Number.isFinite(v) ? v : null });
                              }}
                              readOnly={!editable}
                              inputMode="decimal"
                              placeholder="km"
                              aria-label={`${t(SPORT_LABEL[sport])} · ${t("Distance")}`}
                              className="w-full rounded-xl border border-line bg-elev px-3 py-2 text-sm normal-case text-fg"
                            />
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </li>
            ))}
          </ul>

          <div className="flex flex-wrap items-baseline gap-x-6 gap-y-1 border-t border-line pt-3">
            <span className="num text-xl">{fmt.num(tot.hours, 1)} h</span>
            <span className="num text-xl">{fmt.num(tot.km, 0)} km</span>
            <span className="label">{t("{n} sessions", { n: tot.sessions })}</span>
            <span className="label">{t("{n} rest days", { n: tot.restDays })}</span>
            {vsTarget !== null && <span className="label">{t("{p}% vs suggested", { p: `${vsTarget > 0 ? "+" : ""}${Math.round(vsTarget)}` })}</span>}
            {vsPrev !== null && <span className="label">{t("{p}% vs previous week", { p: `${vsPrev > 0 ? "+" : ""}${Math.round(vsPrev)}` })}</span>}
            <span className="label ml-auto" style={status.startsWith("error") ? { color: "var(--goal)" } : undefined}>
              {status === "saving" ? t("Saving…") : status === "describing" ? t("Analysing the week…") : status === "saved" ? t("Saved") : status.startsWith("error:") ? status.slice(6) : ""}
            </span>
          </div>

          <ul className="flex flex-wrap gap-x-5 gap-y-1">
            {PLAN_SPORTS.filter((sp) => tot.bySport[sp].sessions > 0).map((sp) => {
              const x = tot.bySport[sp];
              return (
                <li key={sp} className="label">
                  <span style={{ color: SPORT_COLOR[sp] }}>{t(SPORT_LABEL[sp])}</span> {fmt.num(x.minutes / 60, 1)} h{HAS_DISTANCE[sp] ? ` · ${fmt.num(x.km, 0)} km` : ""} · {x.sessions}×
                </li>
              );
            })}
          </ul>

          {written ? (
            <div className="rounded-2xl border border-line p-4">
              <p className="label">{t("Week analysis")}</p>
              <p className="mt-2 whitespace-pre-line leading-relaxed">{lang === "pt" ? written.pt : written.en}</p>
              {written.hash && written.hash !== planHash(days) && <p className="label mt-3">{t("The plan changed since this was analysed: it is analysed again when the week is complete and saved.")}</p>}
            </div>
          ) : (
            <p className="label">{done ? t("Saving the week analyses it.") : t("When every day is filled in (or marked as a rest day), the week is analysed and labelled.")}</p>
          )}
        </div>
      )}
    </div>
  );
}
