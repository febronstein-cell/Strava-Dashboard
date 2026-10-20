import { revalidateTag } from "next/cache";
import { type NextRequest } from "next/server";
import { checkPlanKey } from "@/lib/lab/plan-auth";
import { isComplete, sanitizeDays, totals } from "@/lib/lab/plan";
import { getSupabase } from "@/lib/supabase";

/** Saves the 7 days of one planned week. Needs the edit key (header x-plan-key). */
export async function POST(request: NextRequest) {
  const denied = checkPlanKey(request);
  if (denied) return denied;

  const body = (await request.json().catch(() => null)) as { weekStart?: string; days?: unknown } | null;
  const weekStart = body?.weekStart ?? "";
  const days = sanitizeDays(body?.days);
  const t = Date.parse(weekStart + "T00:00:00Z");
  // a Monday, within two years of today
  if (!days || !/^\d{4}-\d{2}-\d{2}$/.test(weekStart) || Number.isNaN(t) || new Date(t).getUTCDay() !== 1 || Math.abs(t - Date.now()) > 2 * 365 * 86_400_000) {
    return Response.json({ error: "Invalid week." }, { status: 400 });
  }

  const { error } = await getSupabase()
    .from("training_weeks")
    // the hours count for the race build only once the whole week is filled in
    .upsert({ week_start: weekStart, planned_hours: isComplete(days) ? Number(totals(days).hours.toFixed(2)) : null, planned_sessions: days }, { onConflict: "week_start" });
  if (error) return Response.json({ error: error.message }, { status: 500 });
  revalidateTag("strava-live", { expire: 0 });
  return Response.json({ ok: true });
}
