import { type NextRequest } from "next/server";
import { analyzeAndStore, hasAnthropic } from "@/lib/lab/ai";
import { dbYear } from "@/lib/strava/db";

export const maxDuration = 300;

/**
 * Local helper (development only): writes the AI analysis of old workouts.
 *   /api/lab/analyze?id=123456789      one workout
 *   /api/lab/analyze?last=10           the 10 most recent workouts without an analysis
 * It is disabled in production so nobody can spend your API credit.
 */
export async function GET(request: NextRequest) {
  if (process.env.NODE_ENV === "production") return new Response("Not found", { status: 404 });
  if (!hasAnthropic()) return Response.json({ error: "ANTHROPIC_API_KEY is not set in .env.local" }, { status: 400 });

  const q = request.nextUrl.searchParams;
  const id = Number(q.get("id"));
  if (id) return Response.json({ id, saved: await analyzeAndStore(id) });

  const last = Math.min(50, Math.max(1, Number(q.get("last") ?? 5)));
  const year = new Date().getFullYear();
  const recent = [...(await dbYear(year)), ...(await dbYear(year - 1))].sort((a, b) => (a.date < b.date ? 1 : -1)).slice(0, last);
  const done: { id: number; saved: boolean }[] = [];
  for (const a of recent) done.push({ id: a.id, saved: await analyzeAndStore(a.id).catch(() => false) });
  return Response.json({ analyzed: done });
}
