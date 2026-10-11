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
  | "css"
  | "run_3k_pace"
  | "run_2mi_pace"
  | "run_10k_time"
  | "weight_kg";

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

/** Written analysis of one workout (made once, when the workout arrives). */
export interface WorkoutAnalysisRow {
  activityId: number;
  model?: string;
  createdAt: string;
  en: string;
  pt: string;
}

/** Written comment on the day's fitness / fatigue / form. */
export interface FormComment {
  day: string;
  model?: string;
  createdAt: string;
  en: string;
  pt: string;
}

export interface LabData {
  /** false when Supabase is not configured: the page then shows only estimates */
  dbReady: boolean;
  thresholds: ThresholdRow[];
  races: RaceRow[];
  plannedWeeks: PlannedWeekRow[];
  /** best power in watts by duration in seconds (from the power curve) */
  power: Record<string, number>;
  /** written analyses by activity id */
  analyses: Record<number, WorkoutAnalysisRow>;
  /** daily comments on fitness / fatigue / form, newest first */
  formComments: FormComment[];
}
