import { ALL_SPORTS, type SportKey } from "@/site.config";
import type { Activity, StravaOverview } from "./strava/types";
import { inPeriod, sportStats, totals, type Period, type SportStats, type Totals } from "./stats";

/** Tudo que as seções precisam, calculado no cliente a partir do período escolhido. */
export interface DashboardContext {
  overview: StravaOverview;
  isDemo: boolean;
  years: number[]; // do mais antigo ao mais recente
  firstYear: number;
  currentYear: number;
  period: Period;
  periodLabel: string;
  /** histórico inteiro, mais recentes primeiro */
  all: Activity[];
  /** só o período escolhido */
  acts: Activity[];
  /** momento da última sincronização (estável entre renders) */
  today: Date;
  totals: Totals;
  allTotals: Totals;
  sports: Record<SportKey, SportStats>;
}

export function buildContext(overview: StravaOverview, all: Activity[], period: Period): DashboardContext {
  const acts = inPeriod(all, period);
  const years: number[] = [];
  for (let y = overview.startYear; y <= overview.currentYear; y++) years.push(y);
  return {
    overview,
    isDemo: overview.source === "demo",
    years,
    firstYear: overview.startYear,
    currentYear: overview.currentYear,
    period,
    periodLabel: period === "all" ? "Todos os anos" : String(period),
    all,
    acts,
    today: new Date(overview.fetchedAt),
    totals: totals(acts),
    allTotals: totals(all),
    sports: Object.fromEntries(ALL_SPORTS.map((s) => [s, sportStats(acts, s)])) as Record<SportKey, SportStats>,
  };
}
