import { revalidateTag } from "next/cache";
import { type NextRequest } from "next/server";
import { checkPlanKey } from "@/lib/lab/plan-auth";
import { getSupabase } from "@/lib/supabase";

const MISSING = "Run supabase/schema-rpe.sql in the Supabase SQL Editor first.";
const err = (m: string) => Response.json({ error: /does not exist|schema cache/i.test(m) ? MISSING : m }, { status: 500 });

/**
 * Session RPE and manual sessions. Needs the planner unlock (cookie) or the edit key.
 * - { activityId, rpe }            rate a Strava session (rpe null removes it); a negative id is a manual session
 * - { manual: { startedAt, sport, elapsedMin, km?, rpe?, name?, notes? } }   add a session that Strava does not have
 * - { deleteManual: id }           remove a manual session (id as stored, positive)
 */
export async function POST(request: NextRequest) {
  const denied = checkPlanKey(request);
  if (denied) return denied;
  const b = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  const db = getSupabase();
  const validRpe = (v: unknown) => v === null || (Number.isInteger(Number(v)) && Number(v) >= 1 && Number(v) <= 10);

  if (b && typeof b.activityId === "number") {
    if (!validRpe(b.rpe)) return Response.json({ error: "RPE goes from 1 to 10." }, { status: 400 });
    const id = b.activityId;
    const q =
      id < 0
        ? db.from("manual_activities").update({ rpe: b.rpe }).eq("id", -id)
        : b.rpe === null
          ? db.from("activity_rpe").delete().eq("activity_id", id)
          : db.from("activity_rpe").upsert({ activity_id: id, rpe: b.rpe, updated_at: new Date().toISOString() }, { onConflict: "activity_id" });
    const { error } = await q;
    if (error) return err(error.message);
  } else if (b?.manual && typeof b.manual === "object") {
    const m = b.manual as Record<string, unknown>;
    const sport = String(m.sport);
    const minutes = Number(m.elapsedMin);
    const km = m.km == null || m.km === "" ? 0 : Number(m.km);
    if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(String(m.startedAt)) || !["run", "ride", "swim", "strength", "other"].includes(sport)) return Response.json({ error: "Invalid session." }, { status: 400 });
    if (!(minutes > 0 && minutes <= 1440) || !(km >= 0 && km <= 1000) || (m.rpe != null && !validRpe(m.rpe))) return Response.json({ error: "Invalid time, distance or RPE." }, { status: 400 });
    const { error } = await db.from("manual_activities").insert({
      started_at: String(m.startedAt).slice(0, 16),
      sport,
      elapsed_s: Math.round(minutes * 60),
      distance_m: km * 1000,
      rpe: m.rpe ?? null,
      name: typeof m.name === "string" && m.name.trim() ? m.name.trim().slice(0, 80) : null,
      notes: typeof m.notes === "string" && m.notes.trim() ? m.notes.trim().slice(0, 500) : null,
    });
    if (error) return err(error.message);
  } else if (b && typeof b.deleteManual === "number") {
    const { error } = await db.from("manual_activities").delete().eq("id", b.deleteManual);
    if (error) return err(error.message);
  } else {
    return Response.json({ error: "Invalid request." }, { status: 400 });
  }
  revalidateTag("strava-live", { expire: 0 });
  return Response.json({ ok: true });
}
