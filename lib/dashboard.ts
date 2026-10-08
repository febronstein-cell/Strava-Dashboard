import type { SportKey } from "@/site.config";
import type { StravaData } from "./strava/types";
import {
  heatmapDays,
  monthlyVolume,
  SPORTS,
  sportStats,
  streaks,
  totals,
  weeklyVolume,
  type HeatDay,
  type SportStats,
  type Totals,
  type VolumePoint,
} from "./stats";

/** Tudo que as seções precisam, calculado uma vez no servidor. */
export interface DashboardContext {
  data: StravaData;
  year: number;
  /** "hoje" derivado do momento do cache (estável entre renders) */
  today: Date;
  totals: Totals;
  sports: Record<SportKey, SportStats>;
  weekly: VolumePoint[];
  monthly: VolumePoint[];
  heat: HeatDay[];
  streaks: ReturnType<typeof streaks>;
}

export function buildContext(data: StravaData): DashboardContext {
  const today = new Date(data.fetchedAt);
  const { activities: acts, year } = data;
  const heat = heatmapDays(acts, year, today);
  return {
    data,
    year,
    today,
    totals: totals(acts),
    sports: Object.fromEntries(SPORTS.map((s) => [s, sportStats(acts, s)])) as Record<SportKey, SportStats>,
    weekly: weeklyVolume(acts, year, today),
    monthly: monthlyVolume(acts, year),
    heat,
    streaks: streaks(heat),
  };
}
