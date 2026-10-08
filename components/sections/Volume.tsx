"use client";

import { useMemo } from "react";
import type { DashboardContext } from "@/lib/dashboard";
import { useI18n } from "@/lib/i18n";
import { usePeriodLabel } from "@/lib/i18n/period";
import { monthlyVolume, weeklyVolume } from "@/lib/stats";
import { Reveal } from "@/components/Reveal";
import { SectionShell } from "@/components/SectionShell";
import { VolumeChart } from "@/components/VolumeChart";

/** Longest range (in days) that still gets a weekly view; longer ranges are monthly only. */
const MAX_WEEKLY_DAYS = 800;

export function Volume({ ctx }: { ctx: DashboardContext }) {
  const { t } = useI18n();
  const periodLabel = usePeriodLabel(ctx);
  const { acts, range } = ctx;

  const weekly = useMemo(() => {
    const days = (Date.parse(range.to) - Date.parse(range.from)) / 86_400_000;
    return days > MAX_WEEKLY_DAYS ? null : weeklyVolume(acts, range);
  }, [acts, range]);
  const monthly = useMemo(() => monthlyVolume(acts, range), [acts, range]);

  return (
    <SectionShell
      id="volume"
      title={t("Volume")}
      kicker={periodLabel}
      description={t("How much you trained by week or month, across all sports. Time is elapsed (start to finish). Click a sport in the legend to hide it.")}
    >
      <Reveal>
        <VolumeChart weekly={weekly} monthly={monthly} />
      </Reveal>
    </SectionShell>
  );
}
