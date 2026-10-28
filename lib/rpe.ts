import type { Activity } from "@/lib/strava/types";

/** The activities with their session RPE attached, plus the sessions added by hand. Pure (pages and server). */
export function withRpe(acts: Activity[], rpe: Record<number, number>, manual: Activity[]): Activity[] {
  const out = acts.map((a) => (rpe[a.id] ? { ...a, rpe: rpe[a.id] } : a));
  return manual.length ? [...out, ...manual].sort((a, b) => (a.date < b.date ? 1 : -1)) : out;
}
