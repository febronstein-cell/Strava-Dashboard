import { revalidateTag } from "next/cache";
import { type NextRequest } from "next/server";
import { commentOnDurability, readDurabilityComment } from "@/lib/durability-ai";
import { checkPlanKey } from "@/lib/lab/plan-auth";

export const maxDuration = 60;

/** The latest durability comment (public: it holds no raw health data). */
export async function GET() {
  return Response.json(await readDurabilityComment(), { headers: { "Cache-Control": "no-store" } });
}

/** Writes a new comment now (Sonnet, a couple of cents). Needs the planner unlock. */
export async function POST(request: NextRequest) {
  const denied = checkPlanKey(request);
  if (denied) return denied;
  try {
    const saved = await commentOnDurability();
    if (saved) revalidateTag("strava-live", { expire: 0 });
    return Response.json({ saved, comment: await readDurabilityComment() });
  } catch (e) {
    return Response.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}
