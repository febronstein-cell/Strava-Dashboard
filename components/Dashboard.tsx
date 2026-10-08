"use client";

import { Fragment, useMemo, useState } from "react";
import { siteConfig, type SectionId } from "@/site.config";
import { buildContext } from "@/lib/dashboard";
import { LanguageProvider } from "@/lib/i18n";
import { upcoming } from "@/lib/races";
import type { Period } from "@/lib/stats";
import type { Activity, StravaOverview } from "@/lib/strava/types";
import { ActivityDialogProvider } from "./ActivityDialog";
import { RacePopup } from "./RacePopup";
import { ScrollEffects } from "./ScrollEffects";
import { SiteFooter } from "./SiteFooter";
import { SiteHeader } from "./SiteHeader";
import { Splash } from "./Splash";
import { sectionRegistry } from "./sections/registry";

/**
 * Page shell (client): keeps the chosen period, computes the numbers from the history
 * and draws the sections in the order set in `site.config.ts`.
 */
export function Dashboard(props: { overview: StravaOverview; activities: Activity[] }) {
  return (
    <LanguageProvider>
      <DashboardInner {...props} />
    </LanguageProvider>
  );
}

function DashboardInner({ overview, activities }: { overview: StravaOverview; activities: Activity[] }) {
  const [period, setPeriod] = useState<Period>(overview.currentYear);
  const ctx = useMemo(() => buildContext(overview, activities, period), [overview, activities, period]);

  const serverNow = ctx.today.getTime();
  const hasRaces = upcoming(serverNow).length > 0;
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
        {enabled.map((id) => (
          <Fragment key={id}>{sectionRegistry[id](ctx)}</Fragment>
        ))}
      </main>
      <SiteFooter fetchedAt={overview.fetchedAt} athleteId={overview.athlete.id} />
      <RacePopup serverNow={serverNow} />
    </ActivityDialogProvider>
  );
}
