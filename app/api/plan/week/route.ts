import { type NextRequest } from "next/server";
import { checkContextRead } from "@/lib/lab/plan-auth";
import { weekVersionsSnapshot } from "@/lib/plan-week-snapshot";
import { validWeek } from "@/lib/plan-versions-data";

export const maxDuration = 30;

/**
 * GET /api/plan/week?start=YYYY-MM-DD
 * Every version of the week (Plan A / B / C), which one is active, the effective dates, the sessions of each version,
 * the session moves, the plan of record per day, the change from Plan A and the linked Log events (with the athlete's
 * own words). Read-only: the edit cookie, the edit key or the read token (x-context-token) opens it.
 */
export async function GET(request: NextRequest) {
  const denied = checkContextRead(request);
  if (denied) return denied;
  const start = request.nextUrl.searchParams.get("start") ?? "";
  if (!validWeek(start)) return Response.json({ error: "start must be a Monday (YYYY-MM-DD)." }, { status: 400 });
  return Response.json(await weekVersionsSnapshot(start));
}
