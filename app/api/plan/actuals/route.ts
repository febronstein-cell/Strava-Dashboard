import { type NextRequest } from "next/server";
import { matchWeek } from "@/lib/compliance";
import { getLaps, getOverrides } from "@/lib/laps-cache";
import { checkPlanKey } from "@/lib/lab/plan-auth";
import { labelContext } from "@/lib/lab/labeling";
import { sanitizeDays } from "@/lib/lab/plan";
import { fetchAndStore, readStreams } from "@/lib/streams-cache";
import { statusFromRow } from "@/lib/context-data";
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
  // the status of each planned session of the week (typed by hand or from the Context Log), by planned reference
  const end = new Date(Date.parse(week + "T00:00:00Z") + 6 * 86_400_000).toISOString().slice(0, 10);
  const { data: st, error: stErr } = await getSupabase().from("session_status").select("*").gte("status_date", week).lte("status_date", end);
  const statuses = Object.fromEntries((stErr ? [] : (st ?? [])).map((r) => [String(r.planned_ref), statusFromRow(r)]));
  if (!days) return Response.json({ overrides, laps: {}, pending: [], statuses });

  const matched = matchWeek(days, week, acts, overrides).flatMap((d) => d.entries);
  const ids = matched.filter((e) => e.activity && (e.entry.target || e.entry.structure?.reps)).map((e) => e.activity!.id);
  const { laps, pending } = await getLaps(ids);

  // HR caps are checked on the second-by-second heart rate (read now when missing, a few at a time)
  const capped = matched.filter((e) => e.activity && e.entry.target?.type === "hr-cap").map((e) => e.activity!);
  const streams = await readStreams(capped.map((a) => a.id));
  for (const a of capped.filter((x) => !streams[x.id]).slice(0, 4)) {
    try {
      streams[a.id] = await fetchAndStore(a);
    } catch {
      /* laps are used instead */
    }
  }
  const hrHist = Object.fromEntries(capped.filter((a) => streams[a.id]?.summary.hr).map((a) => [a.id, streams[a.id].summary.hr]));
  return Response.json({ overrides, laps, pending, hrHist, statuses }, { headers: { "Cache-Control": "no-store" } });
}
