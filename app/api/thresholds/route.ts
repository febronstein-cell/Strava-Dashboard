import { revalidateTag } from "next/cache";
import { type NextRequest } from "next/server";
import { checkPlanKey } from "@/lib/lab/plan-auth";
import { getSupabase } from "@/lib/supabase";

/**
 * Adds a swim test (CSS). Body: { date, t400, t200 } with the 400 m and 200 m times in seconds.
 * CSS (s per 100 m) = (t400 - t200) / 2. Needs the planner unlock (cookie) or the edit key.
 */
export async function POST(request: NextRequest) {
  const denied = checkPlanKey(request);
  if (denied) return denied;
  const b = (await request.json().catch(() => null)) as { date?: string; t400?: number; t200?: number } | null;
  const date = b?.date ?? "";
  const t400 = Number(b?.t400);
  const t200 = Number(b?.t200);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return Response.json({ error: "Invalid date." }, { status: 400 });
  if (!(t200 > 60 && t200 < 600 && t400 > t200 * 1.8 && t400 < 1200)) return Response.json({ error: "Check the times: the 400 m should take about twice the 200 m." }, { status: 400 });
  const css = (t400 - t200) / 2;
  const { error } = await getSupabase()
    .from("thresholds")
    .insert({ test_date: date, kind: "css", value: Number(css.toFixed(1)), unit: "s/100m", notes: `swim test: 400 m ${t400}s, 200 m ${t200}s` });
  if (error) return Response.json({ error: error.message }, { status: 500 });
  revalidateTag("strava-live", { expire: 0 });
  return Response.json({ ok: true, css });
}
