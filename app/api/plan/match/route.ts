import { type NextRequest } from "next/server";
import { checkPlanKey } from "@/lib/lab/plan-auth";
import { getSupabase } from "@/lib/supabase";

/**
 * Re-matches an activity by hand. Body: { activityId, weekStart, day, slot } to attach it to a planned entry,
 * { activityId, weekStart, slot: null } to mark it as unplanned, or { activityId, clear: true } to go back to automatic.
 */
export async function POST(request: NextRequest) {
  const denied = checkPlanKey(request);
  if (denied) return denied;
  const b = (await request.json().catch(() => null)) as { activityId?: number; weekStart?: string; day?: number | null; slot?: number | null; clear?: boolean } | null;
  if (!b || typeof b.activityId !== "number") return Response.json({ error: "Invalid request." }, { status: 400 });
  const db = getSupabase();
  if (b.clear) {
    const { error } = await db.from("plan_matches").delete().eq("activity_id", b.activityId);
    return error ? Response.json({ error: error.message }, { status: 500 }) : Response.json({ ok: true });
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(b.weekStart ?? "")) return Response.json({ error: "Invalid week." }, { status: 400 });
  const day = b.slot == null ? null : Number(b.day);
  if (day !== null && !(day >= 0 && day <= 6)) return Response.json({ error: "Invalid day." }, { status: 400 });
  const { error } = await db
    .from("plan_matches")
    .upsert({ activity_id: b.activityId, week_start: b.weekStart, day, slot: b.slot ?? null, updated_at: new Date().toISOString() }, { onConflict: "activity_id" });
  if (error) {
    const missing = /does not exist|schema cache/i.test(error.message);
    return Response.json({ error: missing ? "Run supabase/schema-compliance.sql in the Supabase SQL Editor first." : error.message }, { status: 500 });
  }
  return Response.json({ ok: true });
}
