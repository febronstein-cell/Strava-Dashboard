import "server-only";
import type { SportKey } from "@/site.config";
import type { Activity } from "@/lib/strava/types";
import { getSupabase, hasSupabase } from "@/lib/supabase";

/** Session RPE by activity id, and the sessions added by hand (as activities with negative ids). Empty before the migration. */
export async function readRpeData(): Promise<{ rpe: Record<number, number>; manual: Activity[] }> {
  if (!hasSupabase()) return { rpe: {}, manual: [] };
  const db = getSupabase();
  const [r, m] = await Promise.all([db.from("activity_rpe").select("activity_id,rpe"), db.from("manual_activities").select("*").order("started_at", { ascending: false }).limit(500)]);
  const rpe: Record<number, number> = {};
  for (const row of r.error ? [] : (r.data ?? [])) rpe[Number(row.activity_id)] = Number(row.rpe);
  const manual: Activity[] = (m.error ? [] : (m.data ?? [])).map((row) => ({
    id: -Number(row.id),
    name: row.name ? String(row.name) : "Manual session",
    sport: row.sport as SportKey,
    date: String(row.started_at).slice(0, 19),
    distance: Number(row.distance_m) || 0,
    movingTime: Number(row.elapsed_s),
    elapsedTime: Number(row.elapsed_s),
    elevation: 0,
    rpe: row.rpe != null ? Number(row.rpe) : undefined,
    manual: true,
  }));
  return { rpe, manual };
}
