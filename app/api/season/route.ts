import { revalidateTag } from "next/cache";
import { type NextRequest } from "next/server";
import { checkPlanKey } from "@/lib/lab/plan-auth";
import { readSeason } from "@/lib/season-data";
import { sanitizePhase, sanitizeRace } from "@/lib/season-plan";
import { getSupabase } from "@/lib/supabase";

const MISSING = "The season tables do not exist yet: run supabase/schema-season.sql in the Supabase SQL Editor.";

/** The season as stored (fresh, no cache). */
export async function GET() {
  return Response.json(await readSeason(), { headers: { "Cache-Control": "no-store" } });
}

/**
 * Saves a race or a phase. Body: { kind: "race" | "phase", item }. With item.id it updates that row, otherwise it adds
 * one. Needs the planner unlock (cookie) or the edit key.
 */
export async function POST(request: NextRequest) {
  const denied = checkPlanKey(request);
  if (denied) return denied;
  const body = (await request.json().catch(() => null)) as { kind?: string; item?: unknown } | null;
  const db = getSupabase();

  if (body?.kind === "race") {
    const r = sanitizeRace(body.item);
    if (!r) return Response.json({ error: "Invalid race." }, { status: 400 });
    const row = {
      name: r.name,
      race_date: r.date,
      location: r.location ?? null,
      type: r.type,
      priority: r.priority,
      goal: r.goal ?? null,
      status: r.status,
      result: r.result ?? null,
      cycle_start: r.cycleStart ?? null,
      notes: r.notes ?? null,
    };
    const q = r.id ? db.from("season_races").update(row).eq("id", r.id).select("id").single() : db.from("season_races").insert(row).select("id").single();
    const { data, error } = await q;
    if (error) return Response.json({ error: tableError(error.message) }, { status: 500 });
    revalidateTag("strava-live", { expire: 0 });
    return Response.json({ ok: true, id: data?.id });
  }

  if (body?.kind === "phase") {
    const p = sanitizePhase(body.item);
    if (!p) return Response.json({ error: "Invalid phase." }, { status: 400 });
    const row = {
      start_date: p.start,
      end_date: p.end,
      name: p.name,
      focus: p.focus,
      hours_min: p.hoursMin,
      hours_max: p.hoursMax,
      run_km_min: p.runKmMin ?? null,
      run_km_max: p.runKmMax ?? null,
      notes: p.notes ?? null,
    };
    const q = p.id ? db.from("season_phases").update(row).eq("id", p.id).select("id").single() : db.from("season_phases").insert(row).select("id").single();
    const { data, error } = await q;
    if (error) return Response.json({ error: tableError(error.message) }, { status: 500 });
    revalidateTag("strava-live", { expire: 0 });
    return Response.json({ ok: true, id: data?.id });
  }

  return Response.json({ error: "Unknown kind." }, { status: 400 });
}

/** Removes a race or a phase. Body: { kind, id }. */
export async function DELETE(request: NextRequest) {
  const denied = checkPlanKey(request);
  if (denied) return denied;
  const body = (await request.json().catch(() => null)) as { kind?: string; id?: number } | null;
  const table = body?.kind === "race" ? "season_races" : body?.kind === "phase" ? "season_phases" : null;
  if (!table || typeof body?.id !== "number") return Response.json({ error: "Invalid request." }, { status: 400 });
  const { error } = await getSupabase().from(table).delete().eq("id", body.id);
  if (error) return Response.json({ error: tableError(error.message) }, { status: 500 });
  revalidateTag("strava-live", { expire: 0 });
  return Response.json({ ok: true });
}

const tableError = (m: string) => (/does not exist|schema cache/i.test(m) ? MISSING : m);
