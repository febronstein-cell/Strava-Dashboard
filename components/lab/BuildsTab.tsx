"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useI18n } from "@/lib/i18n";
import { buildPlan, weeklyHours, type BuildPlan, type Phase } from "@/lib/lab/builds";
import type { LabData, RaceRow } from "@/lib/lab/types";
import { upcoming, type RaceCountdown } from "@/lib/races";
import type { Activity } from "@/lib/strava/types";
import { Hint, Panel } from "./LabBits";
import { PHASE_COLOR, WeeksChart } from "./WeeksChart";

const PHASE_TEXT: Record<Phase, string> = {
  base: "Build the aerobic base with easy volume and technique.",
  build: "Add race-specific work while the weekly hours keep rising.",
  peak: "Highest volume and the most race-like sessions.",
  taper: "Cut the volume, keep some intensity, arrive fresh.",
  race: "Race week: short, sharp sessions and plenty of rest.",
};

export function BuildsTab({ activities, lab, todayKey }: { activities: Activity[]; lab: LabData; todayKey: string }) {
  const { t, fmt } = useI18n();
  const hours = useMemo(() => weeklyHours(activities), [activities]);
  const nowMs = useMemo(() => Date.parse(todayKey + "T12:00:00-03:00"), [todayKey]);
  const races = useMemo(() => upcoming(nowMs), [nowMs]);
  const plans = useMemo(
    () => races.map((r) => ({ race: r, plan: buildPlan(r.name, r.date, hours, todayKey, lab.plannedWeeks) })),
    [races, hours, todayKey, lab.plannedWeeks],
  );
  const [open, setOpen] = useState<number | null>(null);

  return (
    <div className="space-y-6">
      {plans.length === 0 ? (
        <Hint>{t("No upcoming races. Add them in site.config.ts (upcomingRaces).")}</Hint>
      ) : (
        <div className="grid gap-6 lg:grid-cols-2">
          {plans.map(({ race, plan }, i) => (
            <button
              key={race.name + race.date}
              onClick={() => setOpen(i)}
              className="card block p-5 text-left transition-colors hover:border-fg sm:p-7"
            >
              <div className="flex items-start justify-between gap-4">
                <div className="min-w-0">
                  <p className="label" style={{ color: "var(--goal)" }}>{t("Race build")}</p>
                  <h3 className="num mt-1 text-3xl uppercase sm:text-4xl">{race.name}</h3>
                  <p className="mt-1 text-sm text-muted">
                    {fmt.dateLabel(`${race.date}T00:00:00`, { day: "2-digit", month: "long", year: "numeric" })}
                    {race.location ? ` · ${t(race.location)}` : ""}
                  </p>
                </div>
                <div className="text-right">
                  <p className="num text-5xl leading-none" style={{ color: "var(--goal)" }}>{race.days}</p>
                  <p className="label mt-1">{t("day to go|days to go", { n: race.days })}</p>
                </div>
              </div>
              {plan ? (
                <div className="mt-5">
                  <WeeksChart weeks={plan.weeks} compact />
                  <p className="label mt-3">{t("Tap for the full plan")} →</p>
                </div>
              ) : (
                <p className="mt-5 text-sm text-muted">{t("This race has passed.")}</p>
              )}
            </button>
          ))}
        </div>
      )}

      {open !== null && plans[open]?.plan && (
        <BuildDialog race={plans[open].race} plan={plans[open].plan} onClose={() => setOpen(null)} />
      )}

      <Results races={lab.races} dbReady={lab.dbReady} />
    </div>
  );
}

function BuildDialog({ race, plan, onClose }: { race: RaceCountdown; plan: BuildPlan; onClose: () => void }) {
  const { t, fmt } = useI18n();
  const ref = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const d = ref.current;
    if (d && !d.open) d.showModal();
  }, []);

  const future = plan.weeks.filter((w) => w.state !== "past");
  const totalPlanned = future.reduce((s, w) => s + (w.target ?? 0), 0);
  const phases = (["base", "build", "peak", "taper", "race"] as Phase[]).filter((p) => future.some((w) => w.phase === p));

  return (
    <dialog
      ref={ref}
      onClose={onClose}
      onClick={(e) => {
        if (e.target === ref.current) onClose();
      }}
      className="m-auto max-h-[92vh] w-[min(52rem,calc(100vw-1.5rem))] overflow-y-auto rounded-3xl border border-line bg-elev p-0 text-fg backdrop:bg-black/60 backdrop:backdrop-blur-sm"
    >
      <div className="p-5 sm:p-8">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="label" style={{ color: "var(--goal)" }}>{t("Race build")}</p>
            <h3 className="num mt-1 text-4xl uppercase sm:text-5xl">{race.name}</h3>
            <p className="mt-1 text-muted">
              {fmt.dateLabel(`${race.date}T00:00:00`, { day: "2-digit", month: "long", year: "numeric" })}
              {race.location ? ` · ${t(race.location)}` : ""}
            </p>
          </div>
          <button onClick={onClose} aria-label={t("Close")} className="label -mr-2 rounded-full px-3 py-2 transition-colors hover:text-fg">✕</button>
        </div>

        <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Tile label={t("Weeks left")} value={fmt.int(plan.weeksLeft)} />
          <Tile label={t("Recent weekly hours")} value={`${fmt.num(plan.baseline, 1)} h`} sub={t("last 6 weeks")} />
          <Tile label={t("Peak week")} value={`${fmt.num(plan.peak, 1)} h`} />
          <Tile label={t("Planned until the race")} value={`${fmt.num(totalPlanned, 0)} h`} />
        </div>

        <div className="mt-8">
          <WeeksChart weeks={plan.weeks} />
          <p className="label mt-3 flex flex-wrap gap-x-5 gap-y-1">
            {phases.map((p) => (
              <span key={p} style={{ color: PHASE_COLOR[p] }}>● {t(p)}</span>
            ))}
            <span>▭ {t("plan")}</span>
            <span>▮ {t("done")}</span>
          </p>
        </div>

        <div className="mt-8 grid gap-6 sm:grid-cols-2">
          <div>
            <p className="label">{t("Phases")}</p>
            <ul className="mt-3 space-y-3">
              {phases.map((p) => {
                const ws = future.filter((w) => w.phase === p);
                return (
                  <li key={p} className="flex gap-3">
                    <span className="mt-1.5 size-3 shrink-0 rounded-full" style={{ background: PHASE_COLOR[p] }} />
                    <span>
                      <span className="num text-xl uppercase">{t(p)}</span>
                      <span className="label ml-2">{t("week|weeks", { n: ws.length })}</span>
                      <span className="mt-0.5 block text-sm text-muted">{t(PHASE_TEXT[p])}</span>
                    </span>
                  </li>
                );
              })}
            </ul>
          </div>
          <div>
            <p className="label">{t("Week by week")}</p>
            <ul className="mt-3">
              {future.map((w) => (
                <li key={w.start} className="flex items-baseline gap-3 border-b border-line/60 py-1.5 last:border-0">
                  <span className="label w-14">{fmt.dateLabel(`${w.start}T00:00:00`, { day: "2-digit", month: "short" })}</span>
                  <span className="label w-16" style={{ color: w.phase ? PHASE_COLOR[w.phase] : undefined }}>{w.phase ? t(w.phase) : ""}</span>
                  <span className="label flex-1">{w.kind === "deload" ? t("recovery week") : w.kind === "taper" ? t("taper") : w.kind === "race" ? t("race week") : t("load week")}</span>
                  <span className="num text-lg">{fmt.num(w.target ?? 0, 1)} h</span>
                  <span className="num w-14 text-right text-lg text-muted">{w.state === "future" ? "" : `${fmt.num(w.actual, 1)} h`}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>

        <p className="mt-6 text-sm text-muted">
          {t("Automatic plan: it starts from your last 6 weeks ({avg} h/week before this week), adds up to 30% in a 3:1 load/recovery rhythm and tapers for the distance. Weeks you add to the training_weeks table replace the automatic target.", { avg: fmt.num(plan.baseline, 1) })}
        </p>
      </div>
    </dialog>
  );
}

function Tile({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="rounded-xl border border-line p-3.5">
      <p className="label">{label}</p>
      <p className="num mt-1.5 text-3xl">{value}</p>
      {sub && <p className="label mt-0.5">{sub}</p>}
    </div>
  );
}

function Results({ races, dbReady }: { races: RaceRow[]; dbReady: boolean }) {
  const { t, fmt } = useI18n();
  const hms = (s?: number) => {
    if (!s) return "—";
    const h = Math.floor(s / 3600);
    const m = Math.floor((s % 3600) / 60);
    const sec = Math.round(s % 60);
    return `${h}:${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")}`;
  };
  return (
    <Panel title={t("Race results")} subtitle={t("Finish times and splits from your database (races table).")}>
      {races.length === 0 ? (
        <Hint>
          {dbReady
            ? t("No results yet. Add your races in Supabase → Table Editor → races and they appear here.")
            : t("The database is not connected.")}
        </Hint>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[40rem] text-left">
            <thead>
              <tr className="label border-b border-line">
                {["Race", "Date", "Finish", "Swim", "T1", "Bike", "T2", "Run", "Place"].map((h) => (
                  <th key={h} className="py-2 pr-3 font-normal">{t(h)}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {races.map((r) => (
                <tr key={r.id} className="border-b border-line/60 last:border-0">
                  <td className="py-3 pr-3 text-sm">
                    {r.name}
                    {r.distanceLabel && <span className="label ml-2">{r.distanceLabel}</span>}
                  </td>
                  <td className="label py-3 pr-3">{fmt.dateLabel(`${r.date}T00:00:00`, { day: "2-digit", month: "short", year: "numeric" })}</td>
                  <td className="num py-3 pr-3 text-xl" style={{ color: "var(--brand)" }}>{hms(r.finishSeconds)}</td>
                  <td className="num py-3 pr-3 text-lg">{hms(r.swimSeconds)}</td>
                  <td className="num py-3 pr-3 text-lg text-muted">{hms(r.t1Seconds)}</td>
                  <td className="num py-3 pr-3 text-lg">{hms(r.bikeSeconds)}</td>
                  <td className="num py-3 pr-3 text-lg text-muted">{hms(r.t2Seconds)}</td>
                  <td className="num py-3 pr-3 text-lg">{hms(r.runSeconds)}</td>
                  <td className="num py-3 text-lg">
                    {r.overallRank ? `#${fmt.int(r.overallRank)}` : "—"}
                    {r.categoryRank ? <span className="label ml-2">{r.category ?? t("cat.")} #{fmt.int(r.categoryRank)}</span> : null}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Panel>
  );
}
