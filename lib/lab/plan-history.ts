import type { SportKey } from "@/site.config";
import type { Activity } from "@/lib/strava/types";
import { mondayOf } from "./progress";

/** What was really trained in past weeks, per sport: the yardstick the planner's weeks are compared with. */

const DAY = 86_400_000;
const addDays = (key: string, n: number) => new Date(Date.parse(key + "T00:00:00Z") + n * DAY).toISOString().slice(0, 10);
const SPORTS: SportKey[] = ["run", "ride", "swim", "strength", "other"];
/** Sessions shorter than this are not counted as a session (warm-ups, short walks). */
const MIN_SESSION_S = 600;

export interface RealWeek {
  /** Monday */
  start: string;
  hours: number;
  /** run + bike + swim */
  km: number;
  sessions: number;
  /** per sport: hours, km (run, ride, swim) and sessions */
  sport: Record<string, { h: number; km: number; n: number }>;
}

export function realWeeks(acts: Activity[], from: string, to: string): RealWeek[] {
  const byWeek = new Map<string, RealWeek>();
  for (let k = from; k <= to; k = addDays(k, 7)) {
    byWeek.set(k, { start: k, hours: 0, km: 0, sessions: 0, sport: Object.fromEntries(SPORTS.map((s) => [s, { h: 0, km: 0, n: 0 }])) });
  }
  for (const a of acts) {
    const w = byWeek.get(mondayOf(a.date));
    if (!w) continue;
    const s = w.sport[a.sport] ?? w.sport.other;
    s.h += a.elapsedTime / 3600;
    w.hours += a.elapsedTime / 3600;
    if (a.sport === "run" || a.sport === "ride" || a.sport === "swim") {
      s.km += a.distance / 1000;
      w.km += a.distance / 1000;
    }
    if (a.elapsedTime >= MIN_SESSION_S) {
      s.n++;
      w.sessions++;
    }
  }
  return [...byWeek.values()].map((w) => ({
    ...w,
    hours: round(w.hours),
    km: Math.round(w.km),
    sport: Object.fromEntries(Object.entries(w.sport).map(([k, v]) => [k, { h: round(v.h), km: Math.round(v.km), n: v.n }])),
  }));
}

const round = (n: number) => Math.round(n * 10) / 10;

/** Mean and peak of a block of weeks, for the one-line summary of a past cycle. */
export function summarize(weeks: RealWeek[]): { weeks: number; meanHours: number; peakHours: number; peakWeek: string } {
  const peak = weeks.reduce((b, w) => (w.hours > b.hours ? w : b), weeks[0] ?? { hours: 0, start: "" });
  return { weeks: weeks.length, meanHours: round(weeks.reduce((s, w) => s + w.hours, 0) / Math.max(1, weeks.length)), peakHours: peak.hours, peakWeek: peak.start };
}
