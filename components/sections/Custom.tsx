"use client";

import type { DashboardContext } from "@/lib/dashboard";
import { useI18n } from "@/lib/i18n";
import { Reveal } from "@/components/Reveal";
import { SectionShell } from "@/components/SectionShell";

/**
 * RESERVED SPACE: a free section for whatever we build together.
 * Ideas: yearly goal (progress to X km), gear (shoes/bike mileage), year-over-year comparison,
 * training program, photos...
 *
 * To turn it on: in `site.config.ts` change `{ id: "custom", enabled: false }` to `enabled: true`.
 * Everything in `ctx` (totals, history, period...) already arrives here.
 */
export function Custom({ ctx }: { ctx: DashboardContext }) {
  const { t } = useI18n();
  return (
    <SectionShell id="custom" title={t("Under construction")}>
      <Reveal>
        <div className="card border-dashed p-8 text-muted">
          {t("Reserved section. You have {n} activities in your history to tell a story here.", { n: ctx.allTotals.count })}
        </div>
      </Reveal>
    </SectionShell>
  );
}
