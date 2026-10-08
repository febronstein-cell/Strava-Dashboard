import type { SportKey } from "@/site.config";

/** Atividade já normalizada (só o que o site usa; vai para o navegador). */
export interface Activity {
  id: number;
  name: string;
  sport: SportKey;
  /** Data local no formato ISO (YYYY-MM-DDTHH:mm:ss), sem fuso. */
  date: string;
  /** metros */
  distance: number;
  /** seconds of actual movement: use for pace, HR, cadence and per-activity views */
  movingTime: number;
  /** seconds from start to finish (includes stops): use for volume and totals */
  elapsedTime: number;
  /** metros */
  elevation: number;
  /** Marcada como "competição" no Strava. */
  race?: boolean;
  /** Esteira, rolo, Zwift ou piscina (sem GPS). */
  indoor?: boolean;
  /** FC média / máxima (bpm), quando há monitor cardíaco. */
  hr?: number;
  hrMax?: number;
  /** average cadence as Strava reports it (rpm; runs are per leg, so steps/min = 2x) */
  cad?: number;
  /** average power (W) and whether it comes from a real power meter */
  watts?: number;
  deviceWatts?: boolean;
}

/** Trajeto simplificado de uma atividade (servido à parte, em /api/geo). */
export interface GeoActivity {
  id: number;
  sport: SportKey;
  /** ano da atividade (para filtrar no mapa) */
  year: number;
  date: string;
  distance: number;
  /** ponto de partida */
  lat: number;
  lng: number;
  /** polyline codificada (formato Google, precisão 5) já simplificada */
  line: string;
}

export interface StravaOverview {
  athlete: { id?: number; name: string; avatar?: string };
  startYear: number;
  currentYear: number;
  source: "strava" | "demo";
  fetchedAt: string;
}

export interface YearData {
  year: number;
  activities: Activity[];
  geo: GeoActivity[];
}

/** Subconjunto do SummaryActivity da API do Strava. */
export interface RawActivity {
  id: number;
  name: string;
  sport_type: string;
  type: string;
  distance: number;
  moving_time: number;
  elapsed_time: number;
  total_elevation_gain: number;
  start_date_local: string;
  private?: boolean;
  workout_type?: number | null;
  trainer?: boolean;
  average_heartrate?: number;
  max_heartrate?: number;
  average_cadence?: number;
  average_watts?: number;
  device_watts?: boolean;
  manual?: boolean;
  start_latlng?: number[] | null;
  map?: { summary_polyline?: string | null } | null;
}
