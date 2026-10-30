import { revalidateTag } from "next/cache";
import { type NextRequest } from "next/server";
import { REASON_TAGS } from "@/lib/context-config";
import { noEmDash } from "@/lib/context-interpret";
import { checkPlanKey } from "@/lib/lab/plan-auth";
import { getSupabase } from "@/lib/supabase";

/**
 * Sets the status of a planned session by hand, over what Strava shows. Body: { plannedRef, date, sport, status
 * ("done" | "partial" | "skipped" | "changed"), percentDone?, reasonTag?, note? } or { plannedRef, clear: true } to go
 * back to what Strava shows. Needs the password or the edit key.
 */
export async function POST(request: NextRequest) {
  const denied = checkPlanKey(request);
  if (denied) return denied;
  const b = (await request.json().catch(() => null)) as { plannedRef?: string; date?: string; sport?: string; status?: string; percentDone?: number; reasonTag?: string; note?: string; clear?: boolean } | null;
  if (!b?.plannedRef || !/^\d{4}-\d{2}-\d{2}:\d:\d{1,2}$/.test(b.plannedRef)) return Response.json({ error: "Invalid session." }, { status: 400 });
  const db = getSupabase();
  if (b.clear) {
    const { error } = await db.from("session_status").delete().eq("planned_ref", b.plannedRef);
    if (error) return Response.json({ error: error.message }, { status: 500 });
    revalidateTag("strava-live", { expire: 0 });
    return Response.json({ ok: true });
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(b.date ?? "") || !["done", "partial", "skipped", "changed"].includes(b.status ?? "") || !["run", "ride", "swim", "strength", "other"].includes(b.sport ?? "")) return Response.json({ error: "Invalid status." }, { status: 400 });
  const pct = b.status === "skipped" ? 0 : b.status === "done" ? 100 : Math.round(Number(b.percentDone ?? 50));
  if (!(pct >= 0 && pct <= 100)) return Response.json({ error: "Percent goes from 0 to 100." }, { status: 400 });
  const { error } = await db.from("session_status").upsert(
    {
      status_date: b.date,
      sport: b.sport,
      planned_ref: b.plannedRef,
      status: b.status,
      percent_done: pct,
      reason_tag: (REASON_TAGS as readonly string[]).includes(String(b.reasonTag)) ? b.reasonTag : null,
      note: b.note ? noEmDash(String(b.note).slice(0, 240)) : null,
      source: "manual",
      updated_at: new Date().toISOString(),
    },
    { onConflict: "planned_ref" },
  );
  if (error) {
    const m = error.message;
    return Response.json({ error: /does not exist|schema cache/i.test(m) ? "Run supabase/schema-context.sql in the Supabase SQL Editor first." : m }, { status: 500 });
  }
  revalidateTag("strava-live", { expire: 0 });
  return Response.json({ ok: true });
}
