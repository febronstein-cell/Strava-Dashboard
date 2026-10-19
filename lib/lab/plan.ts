import type { PlanDay } from "./types";

/** Helpers of the training planner. Pure: used by the page and by the server routes. */

export const DAY_NAMES = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"] as const;

export const emptyDays = (): PlanDay[] => Array.from({ length: 7 }, (_, day) => ({ day, description: "", minutes: null, km: null }));

/** "1:30", "1h30", "90", "1.5h" -> minutes (null when empty or not understood). */
export function parseMinutes(text: string): number | null {
  const s = text.trim().toLowerCase().replace(",", ".");
  if (!s) return null;
  let m = s.match(/^(\d+):(\d{1,2})$/) ?? s.match(/^(\d+)\s*h\s*(\d{1,2})?\s*(?:min|m)?$/);
  if (m) return Number(m[1]) * 60 + Number(m[2] ?? 0);
  m = s.match(/^(\d+(?:\.\d+)?)\s*h$/);
  if (m) return Math.round(Number(m[1]) * 60);
  m = s.match(/^(\d+(?:\.\d+)?)\s*(?:min|m)?$/);
  return m ? Math.round(Number(m[1])) : null;
}

/** minutes -> "1:30" */
export const fmtMinutes = (min: number | null): string => (min == null ? "" : `${Math.floor(min / 60)}:${String(Math.round(min % 60)).padStart(2, "0")}`);

/** A week is complete when every one of the 7 days has a description (write "Rest" for a day off). */
export const isComplete = (days: PlanDay[]): boolean => days.length === 7 && days.every((d) => d.description.trim().length > 0);

export function totals(days: PlanDay[]): { hours: number; km: number; sessions: number } {
  const minutes = days.reduce((s, d) => s + (d.minutes ?? 0), 0);
  const km = days.reduce((s, d) => s + (d.km ?? 0), 0);
  const sessions = days.filter((d) => (d.minutes ?? 0) > 0 || (d.km ?? 0) > 0).length;
  return { hours: minutes / 60, km, sessions };
}

/** Fingerprint of the days: tells whether a written description still matches what is planned. */
export function planHash(days: PlanDay[]): string {
  const raw = days.map((d) => `${d.day}|${d.description.trim()}|${d.minutes ?? ""}|${d.km ?? ""}`).join("§");
  let h = 5381;
  for (let i = 0; i < raw.length; i++) h = ((h << 5) + h + raw.charCodeAt(i)) | 0;
  return (h >>> 0).toString(36);
}

/** Cleans what comes from the browser before it is saved. */
export function sanitizeDays(input: unknown): PlanDay[] | null {
  if (!Array.isArray(input) || input.length !== 7) return null;
  const out: PlanDay[] = [];
  for (let i = 0; i < 7; i++) {
    const d = input[i] as Partial<PlanDay> | null;
    const minutes = d?.minutes == null ? null : Number(d.minutes);
    const km = d?.km == null ? null : Number(d.km);
    if ((minutes !== null && !(minutes >= 0 && minutes <= 1440)) || (km !== null && !(km >= 0 && km <= 1000))) return null;
    out.push({ day: i, description: String(d?.description ?? "").slice(0, 600), minutes, km });
  }
  return out;
}
