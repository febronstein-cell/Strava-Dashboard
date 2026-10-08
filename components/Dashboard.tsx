"use client";

import { Fragment, useMemo, useState } from "react";
import { siteConfig, type SectionId } from "@/site.config";
import { buildContext } from "@/lib/dashboard";
import { upcoming } from "@/lib/races";
import type { Period } from "@/lib/stats";
import type { Activity, StravaOverview } from "@/lib/strava/types";
import { ActivityDialogProvider } from "./ActivityDialog";
import { SiteFooter } from "./SiteFooter";
import { SiteHeader } from "./SiteHeader";
import { Splash } from "./Splash";
import { sectionRegistry } from "./sections/registry";

/**
 * Casca da página (cliente): guarda o período escolhido, calcula os números
 * a partir do histórico e desenha as seções na ordem do `site.config.ts`.
 */
export function Dashboard({ overview, activities }: { overview: StravaOverview; activities: Activity[] }) {
  const [period, setPeriod] = useState<Period>(overview.currentYear);
  const ctx = useMemo(() => buildContext(overview, activities, period), [overview, activities, period]);

  const hasRaces = upcoming(ctx.today.getTime()).length > 0;
  const enabled: SectionId[] = siteConfig.sections
    .filter((s) => s.enabled)
    .map((s) => s.id)
    .filter((id) => id !== "races" || hasRaces);

  return (
    <ActivityDialogProvider isDemo={ctx.isDemo}>
      <Splash />
      <div id="topo" />
      <SiteHeader ctx={ctx} period={period} onPeriod={setPeriod} sections={enabled} />
      <main className="flex-1">
        {enabled.map((id) => (
          <Fragment key={id}>{sectionRegistry[id](ctx)}</Fragment>
        ))}
      </main>
      <SiteFooter fetchedAt={overview.fetchedAt} athleteId={overview.athlete.id} />
    </ActivityDialogProvider>
  );
}
