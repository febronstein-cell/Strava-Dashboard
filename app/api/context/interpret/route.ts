import { type NextRequest } from "next/server";
import { interpretNote } from "@/lib/context-ai";
import { checkPlanKey } from "@/lib/lab/plan-auth";

export const maxDuration = 60;

/**
 * Reads a note and returns the draft for the athlete to confirm: nothing is stored here. Needs the password
 * (cookie) or the edit key. Body: { text, date }.
 */
export async function POST(request: NextRequest) {
  const denied = checkPlanKey(request);
  if (denied) return denied;
  const b = (await request.json().catch(() => null)) as { text?: string; date?: string } | null;
  const text = (b?.text ?? "").trim();
  const date = b?.date ?? "";
  if (!text || text.length > 4000 || !/^\d{4}-\d{2}-\d{2}$/.test(date)) return Response.json({ error: "Invalid note." }, { status: 400 });
  try {
    const out = await interpretNote(text, date);
    if (!out) return Response.json({ error: "ANTHROPIC_API_KEY is not set on the server, or the model did not answer." }, { status: 503 });
    return Response.json({ draft: out.draft, planned: out.context.planned, activities: out.context.activities });
  } catch (e) {
    return Response.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}
