/** Data kept in the Supabase tables and shown on the /lab page. */

export type ThresholdKind =
  | "ftp"
  | "lthr"
  | "max_hr"
  | "resting_hr"
  | "vo2max"
  | "lt1_hr"
  | "lt2_hr"
  | "vt1_hr"
  | "vt2_hr"
  | "lt1_power"
  | "lt2_power"
  | "lt1_pace"
  | "lt2_pace"
  | "run_threshold_pace"
  | "css";

export interface ThresholdRow {
  kind: ThresholdKind;
  /** YYYY-MM-DD */
  testDate: string;
  value: number;
  unit: string;
  notes?: string;
}

export interface RaceRow {
  id: number;
  name: string;
  /** YYYY-MM-DD */
  date: string;
  location?: string;
  distanceLabel?: string;
  finishSeconds?: number;
  swimSeconds?: number;
  t1Seconds?: number;
  bikeSeconds?: number;
  t2Seconds?: number;
  runSeconds?: number;
  overallRank?: number;
  categoryRank?: number;
  category?: string;
  notes?: string;
}

export interface PlannedWeekRow {
  /** Monday, YYYY-MM-DD */
  weekStart: string;
  title?: string;
  plannedHours?: number;
}

export interface LabData {
  /** false when Supabase is not configured: the page then shows only estimates */
  dbReady: boolean;
  thresholds: ThresholdRow[];
  races: RaceRow[];
  plannedWeeks: PlannedWeekRow[];
  /** best power in watts by duration in seconds (from the power curve) */
  power: Record<string, number>;
}
