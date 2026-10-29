"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { siteConfig } from "@/site.config";
import { LanguageProvider, useI18n } from "@/lib/i18n";
import { loadSeries } from "@/lib/lab/load";
import { isComplete, totals } from "@/lib/lab/plan";
import { buildProfile } from "@/lib/lab/profile";
import { withRpe } from "@/lib/rpe";
import type { LabData, PlanDay, PlannedWeekRow } from "@/lib/lab/types";
import type { Activity, StravaOverview } from "@/lib/strava/types";
import { SeasonProvider } from "@/lib/season-context";
import type { SeasonData } from "@/lib/season-plan";
import type { ActivityZones, ZoneMeta } from "@/lib/zones-data";
import { EditLock } from "../EditLock";
import { PlannerGate } from "../PlannerGate";
import { ThemeToggle } from "../ThemeToggle";
import { BuildsTab } from "./BuildsTab";
import { CheckinTab } from "./CheckinTab";
import { DurabilityTab } from "./DurabilityTab";
import { IntensityPanel } from "./IntensityPanel";
import { LoadTab } from "./LoadTab";
import { MachineTab } from "./MachineTab";
import { WorkoutTab } from "./WorkoutTab";
import { PlanTab } from "./PlanTab";
import { ProgressionTab } from "./ProgressionTab";
import { RacesTab } from "./RacesTab";
import { SeasonTab } from "./SeasonTab";
import { SwimTest } from "./SwimTest";

/** "plan" is the hidden planner: it is not in the tab bar and opens only through its own address. */
type TabId = "checkin" | "machine" | "load" | "durability" | "progression" | "season" | "builds" | "races" | "workouts" | "plan";
const PLAN_HASH = siteConfig.lab.planHash;
const PLAN_TAB = { id: "plan" as const, label: "Training planner", blurb: "The whole year laid out from your race goals: fill each day by sport and get the week analysed and labelled." };
const TABS: { id: TabId; label: string; short: string; blurb: string }[] = [
  { id: "checkin", label: "Check-in", short: "Check-in", blurb: "Twenty seconds each morning: how you slept and feel, plus what the watch measured, turned into a green, yellow or red signal." },
  { id: "machine", label: "My Machine", short: "Machine", blurb: "Your thresholds, FTP, LTHR and training zones, tested or estimated." },
  { id: "load", label: "Form & Load", short: "Form & Load", blurb: "Fitness, fatigue and form: how ready you are to train hard or to race." },
  { id: "durability", label: "Durability", short: "Durability", blurb: "Do pace and power hold when you are tired? Decoupling, second-half fade, fast starts and fatigue resistance." },
  { id: "progression", label: "Progression", short: "Progress", blurb: "How your training and fitness changed over the last 3 months, 6 months and year." },
  { id: "season", label: "Season", short: "Season", blurb: "The whole season: phases, races by priority and the weekly hours, planned against done." },
  { id: "builds", label: "Race builds", short: "Builds", blurb: "The weekly-hours plan to each upcoming race and the form you should arrive with." },
  { id: "races", label: "Races", short: "Races", blurb: "Every triathlon you raced, grouped from your activities into one result with splits, transitions and an analysis." },
  { id: "workouts", label: "Workout analysis", short: "Workouts", blurb: "Pick any workout for a reading of its intensity, load and how it compares with similar sessions, plus an AI write-up." },
];

/** The tabs live in three groups: today, training and plan. The planner is the last tab of the plan group. */
type GroupId = "today" | "training" | "plan";
const GROUPS: { id: GroupId; label: string; tabs: TabId[] }[] = [
  { id: "today", label: "Today", tabs: ["checkin", "load"] },
  { id: "training", label: "Training", tabs: ["workouts", "durability", "progression", "machine"] },
  { id: "plan", label: "Plan", tabs: ["season", "builds", "races", "plan"] },
];
const groupOf = (tab: TabId): GroupId => GROUPS.find((g) => g.tabs.includes(tab))!.id;
const shortOf = (tab: TabId) => (tab === "plan" ? "Planner" : TABS.find((x) => x.id === tab)!.short);

function GroupIcon({ id }: { id: GroupId }) {
  const p = { width: 22, height: 22, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 1.8, strokeLinecap: "round" as const, strokeLinejoin: "round" as const, "aria-hidden": true };
  if (id === "today")
    return (
      <svg {...p}>
        <circle cx="12" cy="12" r="4" />
        <path d="M12 3v2M12 19v2M3 12h2M19 12h2M5.6 5.6 7 7M17 17l1.4 1.4M5.6 18.4 7 17M17 7l1.4-1.4" />
      </svg>
    );
  if (id === "training")
    return (
      <svg {...p}>
        <path d="M3 12h4l2.5-6 4 12 2.5-6H21" />
      </svg>
    );
  return (
    <svg {...p}>
      <rect x="3.5" y="5" width="17" height="15" rx="3" />
      <path d="M3.5 10h17M8 3v4M16 3v4" />
    </svg>
  );
}

/** What the planner holds for a week while it is being edited. */
interface LivePlan {
  days: PlanDay[];
  title?: string;
  description?: { en: string; pt: string; hash?: string };
}

export function LabApp({
  season,
  ...props
}: {
  overview: StravaOverview;
  activities: Activity[];
  lab: LabData;
  labels: Record<number, string>;
  season: SeasonData;
  zones: { byId: Record<number, ActivityZones>; meta: ZoneMeta };
}) {
  return (
    <LanguageProvider>
      <SeasonProvider season={season}>
        <LabInner {...props} />
      </SeasonProvider>
    </LanguageProvider>
  );
}

function LabInner({
  overview,
  activities: strava,
  lab,
  labels,
  zones,
}: {
  overview: StravaOverview;
  activities: Activity[];
  lab: LabData;
  labels: Record<number, string>;
  zones: { byId: Record<number, ActivityZones>; meta: ZoneMeta };
}) {
  // session RPE attached and the manual sessions added: the load, the check-in and the planner all see them
  const activities = useMemo(() => withRpe(strava, lab.rpe ?? {}, lab.manual ?? []), [strava, lab.rpe, lab.manual]);
  const { t, lang, setLang } = useI18n();
  const [tab, setTab] = useState<TabId>("checkin");
  const [lastIn, setLastIn] = useState<Partial<Record<GroupId, TabId>>>({});

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
      else if (h === "") setTab((cur) => cur);
    };
    read();
    window.addEventListener("hashchange", read);
    return () => window.removeEventListener("hashchange", read);
  }, []);
  const pick = (id: TabId) => {
    setTab(id);
    setLastIn((m) => ({ ...m, [groupOf(id)]: id }));
    try {
      window.history.replaceState(null, "", `#${id === "plan" ? PLAN_HASH : id}`);
    } catch {}
    window.scrollTo({ top: 0, behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" });
  };
  const group = groupOf(tab);
  /** Going to a group opens the tab last used in it (the planner only through its key). */
  const goGroup = (g: GroupId) => {
    const target = lastIn[g] && lastIn[g] !== "plan" ? lastIn[g]! : GROUPS.find((x) => x.id === g)!.tabs[0];
    pick(target);
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
            <span className="num truncate text-xl uppercase tracking-wide text-brand sm:text-2xl"><span className="hidden sm:inline">{siteConfig.shortName || siteConfig.nickname} · </span>Lab</span>
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
            <EditLock />
            <ThemeToggle />
          </div>
        </div>
        {/* the three groups (desktop; on a phone they are the bar at the bottom) */}
        <nav aria-label={t("Sections")} className="mx-auto hidden w-full max-w-6xl gap-2 px-8 pb-2 sm:flex">
          {GROUPS.map((g) => (
            <button
              key={g.id}
              onClick={() => goGroup(g.id)}
              aria-current={group === g.id ? "page" : undefined}
              className={`num flex items-center gap-2 rounded-full border px-5 py-2 text-lg uppercase tracking-wide transition-colors ${group === g.id ? "lab-tab-on border-fg bg-fg text-bg" : "border-line text-muted hover:border-fg hover:text-fg"}`}
            >
              <GroupIcon id={g.id} />
              {t(g.label)}
            </button>
          ))}
        </nav>
        {/* the tabs of the current group: at most four, so they fit without scrolling */}
        <div className="mx-auto w-full max-w-6xl px-4 pb-3 sm:px-8">
          <div role="tablist" aria-label={t(GROUPS.find((g) => g.id === group)!.label)} className="grid auto-cols-fr grid-flow-col gap-1 rounded-full border border-line p-1">
            {GROUPS.find((g) => g.id === group)!.tabs.map((id) => {
              const cls = `label min-w-0 truncate whitespace-nowrap rounded-full px-2 py-2.5 text-center transition-colors sm:px-4 ${tab === id ? "lab-tab-on bg-fg text-bg" : "hover:text-fg"}`;
              return id === "plan" ? (
                <PlannerGate key={id} className={cls}>
                  {t("Planner")}
                </PlannerGate>
              ) : (
                <button key={id} role="tab" aria-selected={tab === id} onClick={() => pick(id)} className={cls}>
                  {t(shortOf(id))}
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {/* phone: the groups at the bottom, within thumb reach */}
      <nav
        aria-label={t("Sections")}
        className="fixed inset-x-0 bottom-0 z-40 grid grid-cols-3 border-t border-line bg-bg/90 backdrop-blur-xl sm:hidden"
        style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
      >
        {GROUPS.map((g) => (
          <button
            key={g.id}
            onClick={() => goGroup(g.id)}
            aria-current={group === g.id ? "page" : undefined}
            className={`flex flex-col items-center gap-0.5 py-2.5 transition-colors active:scale-95 ${group === g.id ? "text-brand" : "text-muted"}`}
          >
            <GroupIcon id={g.id} />
            <span className="label text-[0.62rem]">{t(g.label)}</span>
          </button>
        ))}
      </nav>

      <main
        className="mx-auto w-full max-w-6xl flex-1 px-4 py-6 pb-28 sm:px-8 sm:py-14 sm:pb-14"
        onPointerMove={(e) => {
          const el = (e.target as HTMLElement).closest<HTMLElement>(".lab-glow");
          if (!el) return;
          const r = el.getBoundingClientRect();
          el.style.setProperty("--mx", `${e.clientX - r.left}px`);
          el.style.setProperty("--my", `${e.clientY - r.top}px`);
        }}
      >
        <header key={tab} className="lab-enter mb-6 sm:mb-10">
          <p className="label text-brand">{t("Lab")}</p>
          <h1 className="num lab-title mt-1 text-4xl uppercase sm:text-7xl">{t(current.label)}</h1>
          <p className="mt-3 max-w-3xl text-muted">{t(current.blurb)}</p>
        </header>

        {tab === "checkin" && <CheckinTab activities={activities} profile={profile} todayKey={todayKey} />}
        {tab === "machine" && (
          <>
            <MachineTab profile={profile} lab={lab} />
            <div className="mt-6">
              <SwimTest todayKey={todayKey} />
            </div>
          </>
        )}
        {tab === "load" && (
          <>
            <LoadTab activities={activities} series={series} profile={profile} comments={lab.formComments} />
            <div className="mt-6">
              <IntensityPanel activities={activities} zones={zones} todayKey={todayKey} />
            </div>
          </>
        )}
        {tab === "durability" && <DurabilityTab activities={activities} zones={zones.byId} />}
        {tab === "progression" && <ProgressionTab activities={activities} todayKey={todayKey} series={series} />}
        {tab === "workouts" && <WorkoutTab activities={activities} profile={profile} lab={lab} labels={labels} zones={zones.byId} />}
        {tab === "season" && <SeasonTab activities={activities} lab={labLive} todayKey={todayKey} />}
        {tab === "builds" && <BuildsTab activities={activities} lab={labLive} todayKey={todayKey} series={series} />}
        {tab === "races" && <RacesTab activities={activities} lab={lab} profile={profile} todayKey={todayKey} />}
        {tab === "plan" && <PlanTab activities={activities} lab={labLive} todayKey={todayKey} onPlan={onPlan} />}
      </main>

      <footer className="mx-auto w-full max-w-6xl px-5 pb-28 sm:px-8 sm:pb-12">
        <p className="label border-t border-line pt-6">
          {t("Estimates from your Strava history. Not medical or coaching advice.")}
        </p>
      </footer>
    </>
  );
}
