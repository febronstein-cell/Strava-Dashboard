import { type NextRequest } from "next/server";
import { contextSnapshot } from "@/lib/context-data";
import { checkContextRead } from "@/lib/lab/plan-auth";

export const maxDuration = 30;

const brtDay = () => new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(new Date());

/**
 * The structured Context Log: notes, events (with follow-ups, cost and the days they have been open), session
 * statuses, patterns and the signal of the day with its reasons. For the pages (unlocked device) and for the
 * scheduled nightly review (read-only token in the x-context-token header). Health data: never public, never cached.
 *
 * GET /api/context?days=14&date=YYYY-MM-DD
 */
export async function GET(request: NextRequest) {
  const denied = checkContextRead(request);
  if (denied) return denied;
  const q = request.nextUrl.searchParams;
  const date = q.get("date") ?? brtDay();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || Number.isNaN(Date.parse(date))) return Response.json({ error: "Invalid date." }, { status: 400 });
  const days = Math.min(90, Math.max(1, Number(q.get("days")) || 14));
  return Response.json(await contextSnapshot(date, days), { headers: { "Cache-Control": "no-store", "X-Robots-Tag": "noindex, nofollow" } });
}
