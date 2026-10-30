import { revalidateTag } from "next/cache";
import { type NextRequest } from "next/server";
import { interpretNote } from "@/lib/context-ai";
import { sanitizeDraft } from "@/lib/context-interpret";
import { saveNote } from "@/lib/context-data";
import { checkPlanKey } from "@/lib/lab/plan-auth";
import { getSupabase } from "@/lib/supabase";

export const maxDuration = 60;

const MISSING = "Run supabase/schema-context.sql in the Supabase SQL Editor first.";
const fail = (e: unknown) => {
  const m = e instanceof Error ? e.message : String(e);
  return Response.json({ error: /does not exist|schema cache/i.test(m) ? MISSING : m }, { status: 500 });
};

/**
 * Stores a note. Needs the password (cookie) or the edit key, the same as the planner: there is no public write route.
 * - { date, text, draft }: the draft the athlete confirmed (events and session impacts, possibly edited)
 * - { date, text, autoConfirm: true }: for Claude entering a note on the athlete's behalf: the server reads the note
 *   itself and stores the result marked as NOT confirmed, so the athlete can review it in the Log
 */
export async function POST(request: NextRequest) {
  const denied = checkPlanKey(request);
  if (denied) return denied;
  const b = (await request.json().catch(() => null)) as { date?: string; text?: string; draft?: unknown; autoConfirm?: boolean } | null;
  const text = (b?.text ?? "").trim();
  const date = b?.date ?? "";
  if (!text || text.length > 4000 || !/^\d{4}-\d{2}-\d{2}$/.test(date) || Math.abs(Date.parse(date) - Date.now()) > 400 * 86_400_000) return Response.json({ error: "Invalid note." }, { status: 400 });

  try {
    let draft;
    let confirmed = true;
    if (b?.autoConfirm) {
      const out = await interpretNote(text, date);
      if (!out) return Response.json({ error: "ANTHROPIC_API_KEY is not set on the server, or the model did not answer." }, { status: 503 });
      draft = out.draft;
      confirmed = false;
    } else {
      draft = sanitizeDraft(b?.draft);
    }
    const saved = await saveNote({ date, text, draft, confirmed });
    revalidateTag("strava-live", { expire: 0 });
    return Response.json({ ok: true, ...saved, confirmed, draft });
  } catch (e) {
    return fail(e);
  }
}

/** Deletes a note and its events. Body: { id }. */
export async function DELETE(request: NextRequest) {
  const denied = checkPlanKey(request);
  if (denied) return denied;
  const b = (await request.json().catch(() => null)) as { id?: number } | null;
  if (typeof b?.id !== "number") return Response.json({ error: "Invalid request." }, { status: 400 });
  const { error } = await getSupabase().from("context_notes").delete().eq("id", b.id);
  if (error) return fail(error.message);
  revalidateTag("strava-live", { expire: 0 });
  return Response.json({ ok: true });
}
