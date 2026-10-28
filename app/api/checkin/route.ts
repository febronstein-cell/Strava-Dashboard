import { revalidateTag } from "next/cache";
import { type NextRequest } from "next/server";
import { applyManual } from "@/lib/checkin";
import { readCheckins, saveCheckin } from "@/lib/checkin-data";
import { checkPlanKey } from "@/lib/lab/plan-auth";

const MISSING = "The checkins table does not exist yet: run supabase/schema-checkin.sql in the Supabase SQL Editor.";

/** Last 60 days of check-ins (needs the unlock: health data is personal). */
export async function GET(request: NextRequest) {
  const denied = checkPlanKey(request);
  if (denied) return denied;
  return Response.json(await readCheckins(60), { headers: { "Cache-Control": "no-store" } });
}

/**
 * Saves the check-in of a day. Body: { day: "YYYY-MM-DD", ...fields }. Every field sent counts as typed by hand
 * and is never overwritten by an import. Needs the planner unlock (cookie) or the edit key.
 */
export async function POST(request: NextRequest) {
  const denied = checkPlanKey(request);
  if (denied) return denied;
  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  const day = typeof body?.day === "string" ? body.day : "";
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day) || Math.abs(Date.parse(day) - Date.now()) > 400 * 86_400_000) return Response.json({ error: "Invalid day." }, { status: 400 });
  const { day: _day, ...fields } = body!;
  void _day;
  const stored = (await readCheckins(5)).find((c) => c.day === day) ?? null;
  const next = applyManual(stored, day, fields);
  if (!next) return Response.json({ error: "A value is out of range." }, { status: 400 });
  try {
    const saved = await saveCheckin(next);
    revalidateTag("strava-live", { expire: 0 });
    return Response.json(saved);
  } catch (e) {
    const m = e instanceof Error ? e.message : String(e);
    return Response.json({ error: /does not exist|schema cache/i.test(m) ? MISSING : m }, { status: 500 });
  }
}
