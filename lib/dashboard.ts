import { ALL_SPORTS, type SportKey } from "@/site.config";
import type { Activity, StravaOverview } from "./strava/types";
import { inRange, resolveRange, sportStats, totals, type Period, type Range, type SportStats, type Totals } from "./stats";

/** Everything the sections need, computed in the browser from the chosen period. */
export interface DashboardContext {
  overview: StravaOverview;
  isDemo: boolean;
  years: number[]; // oldest to newest
  firstYear: number;
  currentYear: number;
  period: Period;
  /** concrete dates of the chosen period */
  range: Range;
  /** whole history, newest first */
  all: Activity[];
  /** only the chosen period */
  acts: Activity[];
  /** moment of the last sync (stable across renders) */
  today: Date;
  totals: Totals;
  allTotals: Totals;
  sports: Record<SportKey, SportStats>;
}

export function buildContext(overview: StravaOverview, all: Activity[], period: Period): DashboardContext {
  const today = new Date(overview.fetchedAt);
  const range = resolveRange(period, overview.startYear, today);
  const acts = inRange(all, range);
  const years: number[] = [];
  for (let y = overview.startYear; y <= overview.currentYear; y++) years.push(y);
  return {
    overview,
    isDemo: overview.source === "demo",
    years,
    firstYear: overview.startYear,
    currentYear: overview.currentYear,
    period,
    range,
    all,
    acts,
    today,
    totals: totals(acts),
    allTotals: totals(all),
    sports: Object.fromEntries(ALL_SPORTS.map((s) => [s, sportStats(acts, s)])) as Record<SportKey, SportStats>,
  };
}
