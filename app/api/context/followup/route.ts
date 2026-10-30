import { revalidateTag } from "next/cache";
import { type NextRequest } from "next/server";
import { CONTEXT_CONFIG, RED_FLAGS, type RedFlag } from "@/lib/context-config";
import { saveFollowup } from "@/lib/context-data";
import { noEmDash } from "@/lib/context-interpret";
import { checkPlanKey } from "@/lib/lab/plan-auth";

/**
 * One day's answer for an open event. Body: { eventId, date, score (1 to the scale max), trend, redFlags[], note? }.
 * The event closes by itself after 9 or better on two consecutive days. Needs the password or the edit key.
 */
export async function POST(request: NextRequest) {
  const denied = checkPlanKey(request);
  if (denied) return denied;
  const b = (await request.json().catch(() => null)) as { eventId?: number; date?: string; score?: number; trend?: string; redFlags?: string[]; note?: string } | null;
  const score = Number(b?.score);
  const max = CONTEXT_CONFIG.scaleMax;
  if (typeof b?.eventId !== "number" || !/^\d{4}-\d{2}-\d{2}$/.test(b.date ?? "") || !Number.isInteger(score) || score < 1 || score > max) return Response.json({ error: "Invalid answer." }, { status: 400 });
  if (!["worse", "same", "better"].includes(b.trend ?? "")) return Response.json({ error: "Invalid answer." }, { status: 400 });
  const flags = (Array.isArray(b.redFlags) ? b.redFlags : []).filter((f): f is RedFlag => (RED_FLAGS as readonly string[]).includes(f));
  // a score on a 5-point or 20-point scale is stored on the 1 to 10 scale the rules use
  const stored = max === 10 ? score : Math.max(1, Math.min(10, Math.round((score / max) * 10)));
  try {
    const out = await saveFollowup({ eventId: b.eventId, date: b.date!, score: stored, trend: b.trend as "worse" | "same" | "better", redFlags: flags, note: b.note ? noEmDash(String(b.note).slice(0, 400)) : undefined });
    revalidateTag("strava-live", { expire: 0 });
    return Response.json({ ok: true, ...out });
  } catch (e) {
    const m = e instanceof Error ? e.message : String(e);
    return Response.json({ error: /does not exist|schema cache/i.test(m) ? "Run supabase/schema-context.sql in the Supabase SQL Editor first." : m }, { status: 500 });
  }
}
