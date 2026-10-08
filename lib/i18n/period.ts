"use client";

import type { DashboardContext } from "@/lib/dashboard";
import { useI18n } from "./index";

/** Human label of the chosen period ("2026", "All time", "Last 12 weeks", "Oct 1, 2026 → Oct 8, 2026"). */
export function usePeriodLabel(ctx: DashboardContext): string {
  const { t, fmt } = useI18n();
  const r = ctx.range;
  if (r.kind === "year") return String(r.year);
  if (r.kind === "all") return t("All time");
  if (r.kind === "12w") return t("Last 12 weeks");
  const f = (d: string) => fmt.dateLabel(`${d}T00:00:00`, { day: "2-digit", month: "short", year: "numeric" });
  return `${f(r.from)} → ${f(r.to)}`;
}
