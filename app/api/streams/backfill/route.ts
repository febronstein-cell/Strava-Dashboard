import { revalidateTag } from "next/cache";
import { type NextRequest } from "next/server";
import { checkPlanKey } from "@/lib/lab/plan-auth";
import { labelContext } from "@/lib/lab/labeling";
import { backfillStreams } from "@/lib/streams-cache";

export const maxDuration = 60;

/** "Fetch more now": one batch of streams (newest first, last 12 months). Needs the planner unlock. */
export async function POST(request: NextRequest) {
  const denied = checkPlanKey(request);
  if (denied) return denied;
  const { acts } = await labelContext();
  const out = await backfillStreams(acts, 25);
  if (out.fetched) revalidateTag("strava-live", { expire: 0 });
  return Response.json(out);
}
