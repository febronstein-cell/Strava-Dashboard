"use client";

import { Fragment, useMemo, useState } from "react";
import { siteConfig, type SectionId } from "@/site.config";
import { buildContext } from "@/lib/dashboard";
import { LanguageProvider } from "@/lib/i18n";
import { upcoming } from "@/lib/races";
import { SeasonProvider } from "@/lib/season-context";
import type { SeasonData } from "@/lib/season-plan";
import type { Period } from "@/lib/stats";
import type { Activity, StravaOverview } from "@/lib/strava/types";
import { ActivityDialogProvider } from "./ActivityDialog";
import { LabFab } from "./LabFab";
import { LabTeaser } from "./LabTeaser";
import { RacePopup } from "./RacePopup";
import { ScrollEffects } from "./ScrollEffects";
import { SiteFooter } from "./SiteFooter";
import { SiteHeader } from "./SiteHeader";
import { TodayCard } from "./TodayCard";
import { Splash } from "./Splash";
import { sectionRegistry } from "./sections/registry";

/**
 * Page shell (client): keeps the chosen period, computes the numbers from the history
 * and draws the sections in the order set in `site.config.ts`.
 */
export function Dashboard({ season, ...props }: { overview: StravaOverview; activities: Activity[]; labels: Record<number, string>; titles: Record<number, string>; season: SeasonData }) {
  return (
    <LanguageProvider>
      <SeasonProvider season={season}>
        <DashboardInner {...props} races={season} />
      </SeasonProvider>
    </LanguageProvider>
  );
}

function DashboardInner({
  overview,
  activities,
  labels,
  titles,
  races,
}: {
  overview: StravaOverview;
  activities: Activity[];
  labels: Record<number, string>;
  titles: Record<number, string>;
  races: SeasonData;
}) {
  const [period, setPeriod] = useState<Period>(overview.currentYear);
  const ctx = useMemo(() => buildContext(overview, activities, period, labels, titles), [overview, activities, period, labels, titles]);

  const serverNow = ctx.today.getTime();
  const hasRaces = upcoming(serverNow, races.races).length > 0;
  const enabled: SectionId[] = siteConfig.sections
    .filter((s) => s.enabled)
    .map((s) => s.id)
    .filter((id) => id !== "races" || hasRaces);

  return (
    <ActivityDialogProvider isDemo={ctx.isDemo}>
      <Splash />
      <ScrollEffects />
      <div id="topo" />
      <SiteHeader ctx={ctx} period={period} onPeriod={setPeriod} sections={enabled} />
      <main className="flex-1">
        <div className="mx-auto w-full max-w-6xl px-5 pt-6 empty:hidden sm:px-8">
          <TodayCard />
        </div>
        {enabled.map((id) => (
          <Fragment key={id}>{sectionRegistry[id](ctx)}</Fragment>
        ))}
      </main>
      <SiteFooter fetchedAt={overview.fetchedAt} athleteId={overview.athlete.id} />
      <RacePopup serverNow={serverNow} />
      <LabTeaser />
      <LabFab />
    </ActivityDialogProvider>
  );
}
