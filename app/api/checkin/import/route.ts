import { revalidateTag } from "next/cache";
import { type NextRequest } from "next/server";
import { importCheckins } from "@/lib/checkin-import";
import { checkPlanKey } from "@/lib/lab/plan-auth";

export const maxDuration = 60;

/** "Import now": pulls today's and yesterday's watch data. Needs the planner unlock (cookie) or the edit key. */
export async function POST(request: NextRequest) {
  const denied = checkPlanKey(request);
  if (denied) return denied;
  try {
    const log = await importCheckins();
    revalidateTag("strava-live", { expire: 0 });
    return Response.json(log);
  } catch (e) {
    return Response.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}
