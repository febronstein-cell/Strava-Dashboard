import "server-only";
import { isComplete, sanitizeDays, totals } from "@/lib/lab/plan";
import type { PlanDay } from "@/lib/lab/types";
import { addDays, recordDays, type PlanVersion, type SessionMove, type VersionLabel, type VersionStatus } from "@/lib/lab/versions";
import { getSupabase } from "@/lib/supabase";

/** Reads and writes Plan A / B / C (table plan_versions) and the session moves. */

const COLS = "id,week_start,label,status,parent_version_id,created_at,activated_at,effective_from,reason,log_event_id,week_label,target_hours,days";

export function rowToVersion(r: Record<string, unknown>): PlanVersion {
  return {
    id: Number(r.id),
    weekStart: String(r.week_start).slice(0, 10),
    label: r.label as VersionLabel,
    status: r.status as VersionStatus,
    parentId: r.parent_version_id == null ? null : Number(r.parent_version_id),
    createdAt: String(r.created_at),
    activatedAt: r.activated_at == null ? null : String(r.activated_at),
    effectiveFrom: r.effective_from == null ? null : String(r.effective_from).slice(0, 10),
    reason: r.reason == null ? null : String(r.reason),
    logEventId: r.log_event_id == null ? null : Number(r.log_event_id),
    weekLabel: r.week_label == null ? null : String(r.week_label),
    targetHours: r.target_hours == null ? null : Number(r.target_hours),
    days: sanitizeDays(r.days) ?? [],
  };
}

/** The versions of some weeks (all weeks when none are given), by week start. Empty when the table does not exist yet. */
export async function readVersions(weeks?: string[]): Promise<Record<string, PlanVersion[]>> {
  let q = getSupabase().from("plan_versions").select(COLS).order("id");
  if (weeks) q = q.in("week_start", weeks);
  const { data, error } = await q;
  if (error) return {};
  const out: Record<string, PlanVersion[]> = {};
  for (const r of data ?? []) {
    const v = rowToVersion(r);
    (out[v.weekStart] ??= []).push(v);
  }
  return out;
}

export async function readVersion(id: number): Promise<PlanVersion | null> {
  const { data } = await getSupabase().from("plan_versions").select(COLS).eq("id", id).maybeSingle();
  return data ? rowToVersion(data) : null;
}

export async function readMoves(versionIds: number[]): Promise<SessionMove[]> {
  if (!versionIds.length) return [];
  const { data } = await getSupabase().from("session_moves").select("id,plan_version_id,session_id,from_date,to_date,created_at").in("plan_version_id", versionIds).order("created_at");
  return (data ?? []).map((r) => ({
    id: Number(r.id),
    versionId: Number(r.plan_version_id),
    sessionId: String(r.session_id),
    fromDate: String(r.from_date).slice(0, 10),
    toDate: String(r.to_date).slice(0, 10),
    createdAt: String(r.created_at),
  }));
}

/**
 * Writes the plan of record of the week into training_weeks (planned_sessions and planned_hours), so every reader of
 * that table (review, check-in, coach summary, Season and Builds totals) judges each day against the plan in force.
 */
export async function writeRecord(weekStart: string, versions?: PlanVersion[]): Promise<PlanDay[]> {
  const list = versions ?? (await readVersions([weekStart]))[weekStart] ?? [];
  const { days } = recordDays(list, weekStart);
  const { error } = await getSupabase()
    .from("training_weeks")
    .upsert({ week_start: weekStart, planned_hours: isComplete(days) ? Number(totals(days).hours.toFixed(2)) : null, planned_sessions: days }, { onConflict: "week_start" });
  if (error) throw new Error(error.message);
  return days;
}

/** A Monday within two years of today. */
export function validWeek(weekStart: string): boolean {
  const t = Date.parse(weekStart + "T00:00:00Z");
  return /^\d{4}-\d{2}-\d{2}$/.test(weekStart) && !Number.isNaN(t) && new Date(t).getUTCDay() === 1 && Math.abs(t - Date.now()) <= 2 * 365 * 86_400_000;
}

export const inWeek = (weekStart: string, date: string) => /^\d{4}-\d{2}-\d{2}$/.test(date) && date >= weekStart && date <= addDays(weekStart, 6);
