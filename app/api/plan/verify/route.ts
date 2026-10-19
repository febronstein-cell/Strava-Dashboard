import { type NextRequest } from "next/server";
import { checkPlanKey } from "@/lib/lab/plan-auth";

/** Tells the planner whether the edit key is the right one (the page only unlocks after this says yes). */
export async function POST(request: NextRequest) {
  const denied = checkPlanKey(request);
  if (denied) {
    // slows down guessing
    await new Promise((r) => setTimeout(r, 700));
    return denied;
  }
  return Response.json({ ok: true });
}
