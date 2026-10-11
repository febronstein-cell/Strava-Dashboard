import { type NextRequest } from "next/server";
import { analyzeAndStore, hasAnthropic } from "@/lib/lab/ai";
import { commentOnForm } from "@/lib/lab/form-ai";
import { labelAndStore, labelContext } from "@/lib/lab/labeling";
import { detectAndStoreRaces } from "@/lib/lab/races-sync";
import { dbBackfilled } from "@/lib/strava/db";
import { syncRecent } from "@/lib/strava/sync";
import { getSupabase } from "@/lib/supabase";

export const maxDuration = 60;

/**
 * Daily safety net (Vercel Cron, see vercel.json). The Strava webhook already does all of this the
 * moment a workout arrives; this only catches whatever a missed webhook left behind, for the last 2 days:
 * sync, workout names, written analyses (swim/bike/run of 10+ min), triathlon detection, the daily comment.
 * It only works on what is MISSING and the daily comment is rate-limited, so calling it again costs nothing.
 * If CRON_SECRET is set (Vercel then sends it automatically) the call must carry it.
 */
export async function GET(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (secret && request.headers.get("authorization") !== `Bearer ${secret}`) return new Response("Unauthorized", { status: 401 });
  if (!(await dbBackfilled())) return Response.json({ skipped: "database not ready" });

  const log: Record<string, unknown> = {};
  const step = async (name: string, fn: () => Promise<unknown>) => {
    try {
      log[name] = await fn();
    } catch (e) {
      log[name] = `failed: ${e instanceof Error ? e.message.slice(0, 160) : String(e)}`;
    }
  };

  await step("sync", () => syncRecent());

  const ctx = await labelContext();
  const since = new Date(Date.now() - 2 * 86_400_000).toISOString().slice(0, 10);
  const recent = ctx.acts.filter((a) => a.date.slice(0, 10) >= since && a.movingTime >= 600 && ["ride", "run", "swim", "strength"].includes(a.sport));
  const ids = recent.map((a) => a.id);

  const db = getSupabase();
  const [labelled, analysed] = await Promise.all([
    db.from("activity_labels").select("activity_id").in("activity_id", ids),
    db.from("workout_analysis").select("activity_id").in("activity_id", ids),
  ]);
  const haveLabel = new Set((labelled.data ?? []).map((r) => Number(r.activity_id)));
  const haveAnalysis = new Set((analysed.data ?? []).map((r) => Number(r.activity_id)));

  await step("names", async () => {
    let n = 0;
    for (const a of recent.filter((x) => !haveLabel.has(x.id)).slice(0, 8)) if (await labelAndStore(a.id, ctx)) n++;
    return n;
  });

  await step("races", () => detectAndStoreRaces(since).then((r) => r.inserted.length));

  if (hasAnthropic()) {
    await step("analyses", async () => {
      let n = 0;
      for (const a of recent.filter((x) => !haveAnalysis.has(x.id) && x.sport !== "strength").slice(0, 6)) if (await analyzeAndStore(a.id)) n++;
      return n;
    });
    await step("form comment", () => commentOnForm());
  }

  return Response.json(log);
}
