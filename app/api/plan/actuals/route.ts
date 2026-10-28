import { type NextRequest } from "next/server";
import { matchWeek } from "@/lib/compliance";
import { getLaps, getOverrides } from "@/lib/laps-cache";
import { checkPlanKey } from "@/lib/lab/plan-auth";
import { labelContext } from "@/lib/lab/labeling";
import { sanitizeDays } from "@/lib/lab/plan";
import { getSupabase } from "@/lib/supabase";

export const maxDuration = 60;

/**
 * What the "plan vs done" view needs from the server for one week: the manual re-matches and the laps of every
 * matched session that has an intensity target or an interval structure (fetched from Strava once, then stored).
 * Needs the planner unlock, so nobody else can spend the Strava quota.
 */
export async function GET(request: NextRequest) {
  const denied = checkPlanKey(request);
  if (denied) return denied;
  const week = request.nextUrl.searchParams.get("week") ?? "";
  if (!/^\d{4}-\d{2}-\d{2}$/.test(week)) return Response.json({ error: "Invalid week." }, { status: 400 });

  const [{ acts }, overrides, { data: row }] = await Promise.all([
    labelContext(),
    getOverrides(week),
    getSupabase().from("training_weeks").select("planned_sessions").eq("week_start", week).maybeSingle(),
  ]);
  const days = sanitizeDays(row?.planned_sessions);
  if (!days) return Response.json({ overrides, laps: {}, pending: [] });

  const ids = matchWeek(days, week, acts, overrides)
    .flatMap((d) => d.entries)
    .filter((e) => e.activity && (e.entry.target || e.entry.structure?.reps))
    .map((e) => e.activity!.id);
  const { laps, pending } = await getLaps(ids);
  return Response.json({ overrides, laps, pending }, { headers: { "Cache-Control": "no-store" } });
}
