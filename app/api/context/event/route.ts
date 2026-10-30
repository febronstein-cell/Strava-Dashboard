import { revalidateTag } from "next/cache";
import { type NextRequest } from "next/server";
import { BODY_AREAS, EVENT_TYPES } from "@/lib/context-config";
import { noEmDash } from "@/lib/context-interpret";
import { checkPlanKey } from "@/lib/lab/plan-auth";
import { getSupabase } from "@/lib/supabase";

/**
 * Edits an event. Body: { id, action: "close" | "reopen" } or { id, patch: { type?, bodyArea?, severity?, causeStated?, tags? } }.
 * Needs the password or the edit key.
 */
export async function POST(request: NextRequest) {
  const denied = checkPlanKey(request);
  if (denied) return denied;
  const b = (await request.json().catch(() => null)) as { id?: number; action?: string; patch?: Record<string, unknown> } | null;
  if (typeof b?.id !== "number") return Response.json({ error: "Invalid request." }, { status: 400 });
  const db = getSupabase();
  let update: Record<string, unknown> | null = null;

  if (b.action === "close") update = { status: "closed", closed_reason: "manual", ended_at: new Date().toISOString().slice(0, 16) };
  else if (b.action === "reopen") update = { status: "open", closed_reason: null, ended_at: null };
  else if (b.patch) {
    const p = b.patch;
    update = {};
    if (p.type !== undefined) {
      if (!(EVENT_TYPES as readonly string[]).includes(String(p.type))) return Response.json({ error: "Invalid event type." }, { status: 400 });
      update.type = p.type;
    }
    if (p.bodyArea !== undefined) update.body_area = (BODY_AREAS as readonly string[]).includes(String(p.bodyArea)) ? p.bodyArea : null;
    if (p.severity !== undefined) {
      const s = Number(p.severity);
      if (!Number.isInteger(s) || s < 1 || s > 5) return Response.json({ error: "Invalid severity." }, { status: 400 });
      update.severity = s;
    }
    if (p.causeStated !== undefined) update.cause_stated = p.causeStated ? noEmDash(String(p.causeStated).slice(0, 240)) : null;
    if (Array.isArray(p.tags)) update.tags = p.tags.map((t) => noEmDash(String(t).slice(0, 24)).toLowerCase()).filter(Boolean).slice(0, 6);
  }
  if (!update || !Object.keys(update).length) return Response.json({ error: "Nothing to change." }, { status: 400 });
  const { error } = await db.from("context_events").update(update).eq("id", b.id);
  if (error) return Response.json({ error: error.message }, { status: 500 });
  revalidateTag("strava-live", { expire: 0 });
  return Response.json({ ok: true });
}
