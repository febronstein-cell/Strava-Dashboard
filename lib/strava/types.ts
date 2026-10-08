import type { SportKey } from "@/site.config";

/** Atividade já normalizada (só o que o site usa). */
export interface Activity {
  id: number;
  name: string;
  sport: SportKey;
  /** Data local no formato ISO (YYYY-MM-DDTHH:mm:ss), sem fuso. */
  date: string;
  /** metros */
  distance: number;
  /** segundos */
  movingTime: number;
  /** metros */
  elevation: number;
}

export interface StravaData {
  athlete: { name: string; avatar?: string };
  activities: Activity[];
  year: number;
  source: "strava" | "demo";
  fetchedAt: string;
}

/** Subconjunto do SummaryActivity da API do Strava. */
export interface RawActivity {
  id: number;
  name: string;
  sport_type: string;
  type: string;
  distance: number;
  moving_time: number;
  total_elevation_gain: number;
  start_date_local: string;
  private?: boolean;
}
