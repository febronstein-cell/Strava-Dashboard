import { type NextRequest } from "next/server";
import { coachDaily, coachSecretOk } from "@/lib/coach-daily";

export const maxDuration = 60;

/**
 * Read-only summary of one day for the nightly review: GET /api/coach/<COACH_PATH_SECRET>/daily?date=YYYY-MM-DD
 * (date defaults to today, America/Sao_Paulo). Health data, so a wrong or missing secret gets a plain 404, like a
 * page that does not exist. Never cached, never indexed.
 */
export async function GET(request: NextRequest, ctx: { params: Promise<{ secret: string }> }) {
  const { secret } = await ctx.params;
  if (!coachSecretOk(secret)) return new Response("Not found", { status: 404 });
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(new Date());
  const date = request.nextUrl.searchParams.get("date") ?? today;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || Number.isNaN(Date.parse(date))) return Response.json({ error: "Invalid date." }, { status: 400 });
  return Response.json(await coachDaily(date), { headers: { "Cache-Control": "no-store", "X-Robots-Tag": "noindex, nofollow" } });
}
