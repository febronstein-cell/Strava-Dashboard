import "server-only";
import { cacheLife, cacheTag } from "next/cache";
import { SEED_PHASES, SEED_RACES, type PhaseEntry, type SeasonData, type SeasonRaceEntry } from "@/lib/season-plan";
import { getSupabase, hasSupabase } from "@/lib/supabase";

const num = (v: unknown) => (v === null || v === undefined ? undefined : Number(v));
const str = (v: unknown) => (v === null || v === undefined || v === "" ? undefined : String(v));
const day = (v: unknown) => (v ? String(v).slice(0, 10) : undefined);

/**
 * The season (races with priorities, phases) from the season_races and season_phases tables. A missing or empty
 * table falls back to the seeds, so the site works before the migration runs.
 */
export async function getSeason(): Promise<SeasonData> {
  "use cache";
  cacheLife({ stale: 120, revalidate: 900, expire: 86400 });
  cacheTag("strava-live");
  return readSeason();
}

/** Same as getSeason, without the cache (for writes and the routes that need fresh data). */
export async function readSeason(): Promise<SeasonData> {
  const seed: SeasonData = { races: SEED_RACES, phases: SEED_PHASES, source: "seed" };
  if (!hasSupabase()) return seed;
  try {
    const db = getSupabase();
    const [rc, ph] = await Promise.all([
      db.from("season_races").select("*").order("race_date", { ascending: true }),
      db.from("season_phases").select("*").order("start_date", { ascending: true }),
    ]);
    if (rc.error || ph.error || !rc.data?.length) return seed;
    const races: SeasonRaceEntry[] = rc.data.map((r) => ({
      id: Number(r.id),
      name: String(r.name),
      date: day(r.race_date)!,
      location: str(r.location),
      type: r.type,
      priority: r.priority,
      goal: str(r.goal),
      status: r.status,
      result: str(r.result),
      cycleStart: day(r.cycle_start),
      notes: str(r.notes),
    }));
    const phases: PhaseEntry[] = (ph.data ?? []).map((p) => ({
      id: Number(p.id),
      start: day(p.start_date)!,
      end: day(p.end_date)!,
      name: String(p.name),
      focus: p.focus,
      hoursMin: Number(p.hours_min),
      hoursMax: Number(p.hours_max),
      runKmMin: num(p.run_km_min),
      runKmMax: num(p.run_km_max),
      notes: str(p.notes),
    }));
    return { races, phases, source: "db" };
  } catch {
    return seed;
  }
}
