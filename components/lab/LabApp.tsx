"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { siteConfig } from "@/site.config";
import { LanguageProvider, useI18n } from "@/lib/i18n";
import { loadSeries } from "@/lib/lab/load";
import { isComplete, totals } from "@/lib/lab/plan";
import { buildProfile } from "@/lib/lab/profile";
import type { LabData, PlanDay, PlannedWeekRow } from "@/lib/lab/types";
import type { Activity, StravaOverview } from "@/lib/strava/types";
import { SeasonProvider } from "@/lib/season-context";
import type { SeasonData } from "@/lib/season-plan";
import { PlannerGate } from "../PlannerGate";
import { ThemeToggle } from "../ThemeToggle";
import { BuildsTab } from "./BuildsTab";
import { CheckinTab } from "./CheckinTab";
import { LoadTab } from "./LoadTab";
import { MachineTab } from "./MachineTab";
import { WorkoutTab } from "./WorkoutTab";
import { PlanTab } from "./PlanTab";
import { ProgressionTab } from "./ProgressionTab";
import { RacesTab } from "./RacesTab";
import { SeasonTab } from "./SeasonTab";

/** "plan" is the hidden planner: it is not in the tab bar and opens only through its own address. */
type TabId = "checkin" | "machine" | "load" | "progression" | "season" | "builds" | "races" | "workouts" | "plan";
const PLAN_HASH = siteConfig.lab.planHash;
const PLAN_TAB = { id: "plan" as const, label: "Training planner", blurb: "The whole year laid out from your race goals: fill each day by sport and get the week analysed and labelled." };
const TABS: { id: TabId; label: string; blurb: string }[] = [
  { id: "checkin", label: "Check-in", blurb: "Twenty seconds each morning: how you slept and feel, plus what the watch measured, turned into a green, yellow or red signal." },
  { id: "machine", label: "My Machine", blurb: "Your thresholds, FTP, LTHR and training zones, tested or estimated." },
  { id: "load", label: "Form & Load", blurb: "Fitness, fatigue and form: how ready you are to train hard or to race." },
  { id: "progression", label: "Progression", blurb: "How your training and fitness changed over the last 3 months, 6 months and year." },
  { id: "season", label: "Season", blurb: "The whole season: phases, races by priority and the weekly hours, planned against done." },
  { id: "builds", label: "Race builds", blurb: "The weekly-hours plan to each upcoming race and the form you should arrive with." },
  { id: "races", label: "Races", blurb: "Every triathlon you raced, grouped from your activities into one result with splits, transitions and an analysis." },
  { id: "workouts", label: "Workout analysis", blurb: "Pick any workout for a reading of its intensity, load and how it compares with similar sessions, plus an AI write-up." },
];

/** What the planner holds for a week while it is being edited. */
interface LivePlan {
  days: PlanDay[];
  title?: string;
  description?: { en: string; pt: string; hash?: string };
}

export function LabApp({ season, ...props }: { overview: StravaOverview; activities: Activity[]; lab: LabData; labels: Record<number, string>; season: SeasonData }) {
  return (
    <LanguageProvider>
      <SeasonProvider season={season}>
        <LabInner {...props} />
      </SeasonProvider>
    </LanguageProvider>
  );
}

function LabInner({ overview, activities, lab, labels }: { overview: StravaOverview; activities: Activity[]; lab: LabData; labels: Record<number, string> }) {
  const { t, lang, setLang } = useI18n();
  const [tab, setTab] = useState<TabId>("machine");

  // what is being edited in the planner, so the Race builds tab follows it without a reload
  const [live, setLive] = useState<Record<string, LivePlan>>({});
  const onPlan = (week: string, entry: LivePlan) => setLive((p) => ({ ...p, [week]: { ...p[week], ...entry } }));
  const labLive = useMemo<LabData>(() => {
    const rows = new Map(lab.plannedWeeks.map((w) => [w.weekStart, w]));
    for (const [week, v] of Object.entries(live)) {
      const prev = rows.get(week);
      const row: PlannedWeekRow = { ...(prev ?? { weekStart: week }), days: v.days };
      // only a complete week replaces the automatic volume of the build; a half-filled one would look like a drop
      row.plannedHours = isComplete(v.days) ? Number(totals(v.days).hours.toFixed(2)) : undefined;
      if (v.title) row.title = v.title;
      if (v.description) row.description = v.description;
      rows.set(week, row);
    }
    return { ...lab, plannedWeeks: [...rows.values()] };
  }, [lab, live]);

  // the tab lives in the address (#load) so it can be linked and survives a reload
  useEffect(() => {
    const read = () => {
      const h = window.location.hash.slice(1);
      if (h === PLAN_HASH) setTab("plan");
      else if (TABS.some((x) => x.id === h)) setTab(h as TabId);
    };
    read();
    window.addEventListener("hashchange", read);
    return () => window.removeEventListener("hashchange", read);
  }, []);
  const pick = (id: TabId) => {
    setTab(id);
    try {
      window.history.replaceState(null, "", `#${id}`);
    } catch {}
  };

  // today in Brasília time, from the moment of the last sync (stable between server and browser)
  const todayKey = useMemo(
    () => new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(overview.fetchedAt)),
    [overview.fetchedAt],
  );
  const profile = useMemo(() => buildProfile(lab.thresholds, activities, lab.power), [lab.thresholds, activities, lab.power]);
  const series = useMemo(() => loadSeries(activities, profile, todayKey), [activities, profile, todayKey]);
  const current = tab === "plan" ? PLAN_TAB : TABS.find((x) => x.id === tab)!;

  return (
    <>
      <div className="sticky top-0 z-40 border-b border-line bg-bg/80 backdrop-blur-xl">
        <div className="mx-auto flex w-full max-w-6xl items-center justify-between gap-3 px-4 py-3 sm:gap-4 sm:px-8">
          <div className="flex min-w-0 items-center gap-4">
            <Link href="/" aria-label={t("Dashboard")} className="label shrink-0 whitespace-nowrap rounded-full border border-line px-3 py-2 transition-colors hover:text-fg sm:border-0 sm:px-0 sm:py-0">
              ←<span className="hidden sm:inline"> {t("Dashboard")}</span>
            </Link>
            <span className="num truncate text-xl uppercase tracking-wide text-brand sm:text-2xl">{siteConfig.shortName || siteConfig.nickname} · Lab</span>
          </div>
          <div className="flex items-center gap-2 sm:gap-3">
            <div role="group" aria-label={t("Language")} className="label flex rounded-full border border-line p-0.5">
              {(["en", "pt"] as const).map((l) => (
                <button
                  key={l}
                  onClick={() => setLang(l)}
                  aria-pressed={lang === l}
                  className={`rounded-full px-2.5 py-1.5 transition-colors ${lang === l ? "bg-fg text-bg" : "hover:text-fg"}`}
                >
                  {l.toUpperCase()}
                </button>
              ))}
            </div>
            <ThemeToggle />
          </div>
        </div>
        <div className="mx-auto w-full max-w-6xl px-4 pb-3 sm:px-8">
          <div role="tablist" className="-mx-1 flex snap-x gap-1.5 overflow-x-auto px-1 pb-0.5 [scrollbar-width:none]">
            {TABS.map((x) => (
              <button
                key={x.id}
                role="tab"
                aria-selected={tab === x.id}
                onClick={() => pick(x.id)}
                className={`label shrink-0 snap-start whitespace-nowrap rounded-full border px-3.5 py-2 transition-colors sm:px-4 ${tab === x.id ? "lab-tab-on border-fg bg-fg text-bg" : "border-line hover:text-fg"}`}
              >
                {t(x.label)}
              </button>
            ))}
            <PlannerGate
              className={`label shrink-0 snap-start whitespace-nowrap rounded-full border px-3.5 py-2 transition-colors sm:px-4 ${tab === "plan" ? "lab-tab-on border-fg bg-fg text-bg" : "border-line hover:text-fg"}`}
            >
              {t("Planner")}
            </PlannerGate>
          </div>
        </div>
      </div>

      <main
        className="mx-auto w-full max-w-6xl flex-1 px-4 py-6 sm:px-8 sm:py-14"
        onPointerMove={(e) => {
          const el = (e.target as HTMLElement).closest<HTMLElement>(".lab-glow");
          if (!el) return;
          const r = el.getBoundingClientRect();
          el.style.setProperty("--mx", `${e.clientX - r.left}px`);
          el.style.setProperty("--my", `${e.clientY - r.top}px`);
        }}
      >
        <header className="mb-6 sm:mb-10">
          <p className="label text-brand">{t("Lab")}</p>
          <h1 className="num lab-title mt-1 text-4xl uppercase sm:text-7xl">{t(current.label)}</h1>
          <p className="mt-3 max-w-3xl text-muted">{t(current.blurb)}</p>
        </header>

        {tab === "checkin" && <CheckinTab />}
        {tab === "machine" && <MachineTab profile={profile} lab={lab} />}
        {tab === "load" && <LoadTab activities={activities} series={series} profile={profile} comments={lab.formComments} />}
        {tab === "progression" && <ProgressionTab activities={activities} todayKey={todayKey} series={series} />}
        {tab === "workouts" && <WorkoutTab activities={activities} profile={profile} lab={lab} labels={labels} />}
        {tab === "season" && <SeasonTab activities={activities} lab={labLive} todayKey={todayKey} />}
        {tab === "builds" && <BuildsTab activities={activities} lab={labLive} todayKey={todayKey} series={series} />}
        {tab === "races" && <RacesTab activities={activities} lab={lab} profile={profile} todayKey={todayKey} />}
        {tab === "plan" && <PlanTab activities={activities} lab={labLive} todayKey={todayKey} onPlan={onPlan} />}
      </main>

      <footer className="mx-auto w-full max-w-6xl px-5 pb-12 sm:px-8">
        <p className="label border-t border-line pt-6">
          {t("Estimates from your Strava history. Not medical or coaching advice.")}
        </p>
      </footer>
    </>
  );
}
