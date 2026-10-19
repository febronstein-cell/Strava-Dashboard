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

export type PlanSport = "run" | "ride" | "swim" | "strength" | "other";

/** One sport of one day, as filled in the planner. */
export interface PlanSlot {
  sport: PlanSport;
  description: string;
  /** time in minutes */
  minutes: number | null;
  /** distance in km (run, bike and swim only) */
  km: number | null;
}

/** One day of a planned week: five slots (run, bike, swim, strength, extra) or a rest day. */
export interface PlanDay {
  /** 0 = Monday ... 6 = Sunday */
  day: number;
  rest?: boolean;
  slots: PlanSlot[];
}

export interface PlannedWeekRow {
  /** Monday, YYYY-MM-DD */
  weekStart: string;
  /** the label the analysis gave the week: "Base week", "Build week", "Speed week", "Lighter week"... */
  title?: string;
  plannedHours?: number;
  /** the 7 days written in the planner (empty when only the hours were typed in the database) */
  days?: PlanDay[];
  /** the written description of the week, in both languages, and the fingerprint of the days it was written for */
  description?: { en: string; pt: string; hash?: string };
}

/** Laps of one leg, summarised for the pacing charts. */
export interface LapSummary {
  unit: "pace" | "speed";
  /** one entry per lap: v is seconds per km (pace) or km/h (speed) */
  laps: { km: number; v: number; hr?: number; watts?: number }[];
  /** average of the first and of the second half of the distance, same unit as v */
  first: number;
  second: number;
  hrFirst?: number;
  hrSecond?: number;
}

/** Stored analysis of one race: the laps and the written comment. */
export interface RaceAnalysisStored {
  date: string;
  laps: { swim?: LapSummary; bike?: LapSummary; run?: LapSummary };
  en: string;
  pt: string;
  model?: string;
  createdAt: string;
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
  /** written analyses of races, by race date */
  raceAnalyses: Record<string, RaceAnalysisStored>;
}
