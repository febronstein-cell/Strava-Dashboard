"use client";

import { useMemo } from "react";
import type { DashboardContext } from "@/lib/dashboard";
import { monthlyVolume, weeklyVolume } from "@/lib/stats";
import { Reveal } from "@/components/Reveal";
import { SectionShell } from "@/components/SectionShell";
import { VolumeChart } from "@/components/VolumeChart";

export function Volume({ ctx }: { ctx: DashboardContext }) {
  const { acts, period, firstYear, today } = ctx;
  const weekly = useMemo(
    () => (period === "all" ? null : weeklyVolume(acts, period, today)),
    [acts, period, today],
  );
  const monthly = useMemo(() => monthlyVolume(acts, period, firstYear, today), [acts, period, firstYear, today]);

  return (
    <SectionShell id="volume" title="Volume" kicker={ctx.periodLabel}>
      <Reveal>
        <VolumeChart weekly={weekly} monthly={monthly} />
      </Reveal>
    </SectionShell>
  );
}
