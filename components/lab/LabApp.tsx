"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { siteConfig } from "@/site.config";
import { LanguageProvider, useI18n } from "@/lib/i18n";
import { loadSeries } from "@/lib/lab/load";
import { buildProfile } from "@/lib/lab/profile";
import type { LabData } from "@/lib/lab/types";
import type { Activity, StravaOverview } from "@/lib/strava/types";
import { ThemeToggle } from "../ThemeToggle";
import { BuildsTab } from "./BuildsTab";
import { LoadTab } from "./LoadTab";
import { MachineTab } from "./MachineTab";
import { ProgressionTab } from "./ProgressionTab";

type TabId = "machine" | "load" | "progression" | "builds";
const TABS: { id: TabId; label: string; blurb: string }[] = [
  { id: "machine", label: "My Machine", blurb: "Your thresholds, FTP, LTHR and training zones, tested or estimated." },
  { id: "load", label: "Form & Load", blurb: "Fitness, fatigue and form: how ready you are to train hard or to race." },
  { id: "progression", label: "Progression", blurb: "How your training and fitness changed over the last 3 months, 6 months and year." },
  { id: "builds", label: "Race builds", blurb: "The weekly-hours plan to each upcoming race, and your past results." },
];

export function LabApp(props: { overview: StravaOverview; activities: Activity[]; lab: LabData }) {
  return (
    <LanguageProvider>
      <LabInner {...props} />
    </LanguageProvider>
  );
}

function LabInner({ overview, activities, lab }: { overview: StravaOverview; activities: Activity[]; lab: LabData }) {
  const { t, lang, setLang } = useI18n();
  const [tab, setTab] = useState<TabId>("machine");

  // the tab lives in the address (#load) so it can be linked and survives a reload
  useEffect(() => {
    const read = () => {
      const h = window.location.hash.slice(1);
      if (TABS.some((x) => x.id === h)) setTab(h as TabId);
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
  const current = TABS.find((x) => x.id === tab)!;

  return (
    <>
      <div className="sticky top-0 z-40 border-b border-line bg-bg/80 backdrop-blur-xl">
        <div className="mx-auto flex w-full max-w-6xl items-center justify-between gap-4 px-5 py-3 sm:px-8">
          <div className="flex min-w-0 items-center gap-4">
            <Link href="/" className="label shrink-0 whitespace-nowrap transition-colors hover:text-fg">← {t("Dashboard")}</Link>
            <span className="num truncate text-2xl uppercase tracking-wide text-brand">{siteConfig.shortName || siteConfig.nickname} · Lab</span>
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
        <div className="mx-auto w-full max-w-6xl px-5 pb-3 sm:px-8">
          <div role="tablist" className="flex gap-1.5 overflow-x-auto pb-0.5 [scrollbar-width:none]">
            {TABS.map((x) => (
              <button
                key={x.id}
                role="tab"
                aria-selected={tab === x.id}
                onClick={() => pick(x.id)}
                className={`label shrink-0 rounded-full border px-4 py-2 transition-colors ${tab === x.id ? "border-fg bg-fg text-bg" : "border-line hover:text-fg"}`}
              >
                {t(x.label)}
              </button>
            ))}
            <span className="label shrink-0 rounded-full border border-dashed border-line px-4 py-2 opacity-60" title={t("Needs an Anthropic API key")}>
              {t("Workout analysis")} · {t("soon")}
            </span>
          </div>
        </div>
      </div>

      <main className="mx-auto w-full max-w-6xl flex-1 px-5 py-10 sm:px-8 sm:py-14">
        <header className="mb-8 sm:mb-10">
          <p className="label text-brand">{t("Lab")}</p>
          <h1 className="num mt-1 text-5xl uppercase sm:text-7xl">{t(current.label)}</h1>
          <p className="mt-3 max-w-3xl text-muted">{t(current.blurb)}</p>
        </header>

        {tab === "machine" && <MachineTab profile={profile} lab={lab} />}
        {tab === "load" && <LoadTab activities={activities} series={series} profile={profile} />}
        {tab === "progression" && <ProgressionTab activities={activities} todayKey={todayKey} series={series} />}
        {tab === "builds" && <BuildsTab activities={activities} lab={lab} todayKey={todayKey} />}
      </main>

      <footer className="mx-auto w-full max-w-6xl px-5 pb-12 sm:px-8">
        <p className="label border-t border-line pt-6">
          {t("Estimates from your Strava history. Not medical or coaching advice.")}
        </p>
      </footer>
    </>
  );
}
