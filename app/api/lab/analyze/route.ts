import { type NextRequest } from "next/server";
import { analyzeAndStore, hasAnthropic } from "@/lib/lab/ai";
import { commentOnForm } from "@/lib/lab/form-ai";
import { labelAndStore, labelContext, previewLabel } from "@/lib/lab/labeling";
import { detectAndStoreRaces } from "@/lib/lab/races-sync";

export const maxDuration = 300;

/**
 * Local helper (development only) to fill in the past. It is disabled in production so nobody can
 * spend your API credit or your Strava request quota.
 *
 *   ?task=analyze&last=10     AI analysis of the 10 most recent workouts without one (default task)
 *   ?task=analyze&id=123      AI analysis of one workout
 *   ?task=label&last=30       name the 30 most recent workouts that have no name yet (Strava: ~1 request each)
 *   ?task=label&last=10&dry=1 same, but only shows the names (nothing is saved)
 *   ?task=races               look for triathlons in the whole history
 *   ?task=form                today's comment on fitness, fatigue and form
 */
export async function GET(request: NextRequest) {
  if (process.env.NODE_ENV === "production") return new Response("Not found", { status: 404 });

  const q = request.nextUrl.searchParams;
  const task = q.get("task") ?? "analyze";
  const last = Math.min(100, Math.max(1, Number(q.get("last") ?? 5)));
  const id = Number(q.get("id"));

  if (task === "races") return Response.json(await detectAndStoreRaces(undefined, { reset: q.get("reset") === "1" }));

  if ((task === "analyze" || task === "form") && !hasAnthropic()) {
    return Response.json({ error: "ANTHROPIC_API_KEY is not set in .env.local" }, { status: 400 });
  }
  if (task === "form") return Response.json({ saved: await commentOnForm() });

  const ctx = await labelContext();
  if (task === "label") {
    const { getLabels } = await import("@/lib/lab/labeling");
    const have = await getLabels();
    const todo = id
      ? [id]
      : ctx.acts
          .filter((a) => ["ride", "run", "swim", "strength"].includes(a.sport) && !have[a.id] && a.movingTime >= 300)
          .sort((a, b) => (a.date < b.date ? 1 : -1))
          .slice(0, last)
          .map((a) => a.id);
    const done: { id: number; name?: string; date?: string; label: string | null; basis?: string; error?: string }[] = [];
    for (const i of todo) {
      try {
        if (q.get("dry") === "1") {
          const r = await previewLabel(i, ctx);
          const a = ctx.acts.find((x) => x.id === i);
          done.push({ id: i, name: a?.name, date: a?.date.slice(0, 10), label: r?.label ?? null, basis: r?.basis });
          continue;
        }
        done.push({ id: i, label: await labelAndStore(i, ctx) });
      } catch (e) {
        done.push({ id: i, label: null, error: e instanceof Error ? e.message : String(e) });
        if (e instanceof Error && /429/.test(e.message)) break; // Strava rate limit: stop here and try later
      }
    }
    return Response.json({ named: done });
  }

  if (id) return Response.json({ id, saved: await analyzeAndStore(id) });
  const recent = [...ctx.acts].sort((a, b) => (a.date < b.date ? 1 : -1)).slice(0, last);
  const done: { id: number; saved: boolean }[] = [];
  for (const a of recent) done.push({ id: a.id, saved: await analyzeAndStore(a.id).catch(() => false) });
  return Response.json({ analyzed: done });
}
