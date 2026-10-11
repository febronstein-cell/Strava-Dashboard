import { type NextRequest } from "next/server";
import { analyzeAndStore, hasAnthropic, workoutPayload } from "@/lib/lab/ai";
import { commentOnForm, formFacts } from "@/lib/lab/form-ai";
import { applyBrick, getLabels, labelAndStore, labelContext, previewLabel } from "@/lib/lab/labeling";
import { getSupabase } from "@/lib/supabase";
import { detectAndStoreRaces } from "@/lib/lab/races-sync";

export const maxDuration = 300;

/**
 * Local helper (development only) to fill in the past. It is disabled in production so nobody can
 * spend your API credit or your Strava request quota.
 *
 *   ?task=analyze&last=10&days=30&min=20   AI analysis of up to 10 swim/bike/run workouts of 20+ min from the
 *                             last 30 days that have no analysis yet (default task); add &count=1 to only count them
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

  // numbers only (no AI call): used to write the analyses by hand
  if (task === "facts") {
    if (q.get("form") === "1") return Response.json(await formFacts());
    const ctx0 = await labelContext();
    const ids = id ? [id] : [...ctx0.acts].sort((a, b) => (a.date < b.date ? 1 : -1)).slice(0, last).map((a) => a.id);
    const out = [];
    for (const i of ids) out.push(await workoutPayload(i));
    return Response.json({ workouts: out });
  }

  if (task === "races") return Response.json(await detectAndStoreRaces(undefined, { reset: q.get("reset") === "1" }));

  if ((task === "analyze" || task === "form") && !hasAnthropic()) {
    return Response.json({ error: "ANTHROPIC_API_KEY is not set in .env.local" }, { status: 400 });
  }
  if (task === "form") return Response.json({ saved: await commentOnForm({ force: true }) });

  const ctx = await labelContext();

  // no Strava requests: only adds "T2 brick run" / "Triathlon bike" to names saved before that rule existed
  if (task === "bricks") {
    const have = await getLabels();
    const changed: { id: number; from: string; to: string }[] = [];
    for (const [idText, label] of Object.entries(have)) {
      const a = ctx.acts.find((x) => x.id === Number(idText));
      if (!a || /^(T2|Triathlon)|bike to run brick/.test(label)) continue;
      const next = applyBrick(label, a, ctx.acts);
      if (next === label) continue;
      await getSupabase().from("activity_labels").update({ label: next }).eq("activity_id", a.id);
      changed.push({ id: a.id, from: label, to: next });
    }
    return Response.json({ changed });
  }

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

  if (id) return Response.json({ id, saved: await analyzeAndStore(id, { force: true }) });

  // a batch of PAST workouts: only swim/bike/run of at least `min` minutes, from the last `days` days, not analyzed yet
  // read the table directly: the cached lab data would not show what this very batch just wrote
  const { data: doneRows } = await getSupabase().from("workout_analysis").select("activity_id");
  const have: Record<number, true> = Object.fromEntries((doneRows ?? []).map((r) => [Number(r.activity_id), true]));
  const days = Math.max(1, Number(q.get("days") ?? 30));
  const minMin = Math.max(1, Number(q.get("min") ?? 20));
  const since = new Date(Date.now() - days * 86_400_000).toISOString().slice(0, 10);
  const recent = [...ctx.acts]
    .filter((a) => ["ride", "run", "swim"].includes(a.sport) && a.movingTime >= minMin * 60 && a.date.slice(0, 10) >= since && !have[a.id])
    .sort((a, b) => (a.date < b.date ? 1 : -1))
    .slice(0, Math.max(last, Number(q.get("max") ?? 0)));
  if (q.get("count") === "1") return Response.json({ wouldAnalyze: recent.length });
  const done: { id: number; saved: boolean; error?: string }[] = [];
  for (const a of recent) {
    try {
      done.push({ id: a.id, saved: await analyzeAndStore(a.id) });
    } catch (e) {
      const error = e instanceof Error ? e.message.slice(0, 300) : String(e);
      done.push({ id: a.id, saved: false, error });
      if (/credit balance|401|authentication/i.test(error)) break; // no point in trying the rest
    }
  }
  return Response.json({ analyzed: done });
}
