import "server-only";
import type { Activity } from "@/lib/strava/types";
import { stravaGet } from "@/lib/strava/client";
import { getSupabase, hasSupabase } from "@/lib/supabase";
import { summarizeStreams, SUMMARY_VERSION, type StreamSummary, type Streams } from "@/lib/zones";
import { durabilityOf, type Durability } from "@/lib/durability";

export interface StoredStreams {
  sport: string;
  date: string;
  summary: StreamSummary & { durability?: Durability };
}

const KEYS = "time,heartrate,watts,velocity_smooth,moving,distance";
/** Sessions shorter than this are not worth a request. */
const MIN_MOVING_S = 5 * 60;

/** All stored summaries (or those of some activities), by activity id. Empty before the migration. */
export async function readStreams(ids?: number[]): Promise<Record<number, StoredStreams>> {
  if (!hasSupabase()) return {};
  const db = getSupabase();
  const out: Record<number, StoredStreams> = {};
  // paged: a full year is a few hundred rows
  for (let from = 0; from < 20000; from += 1000) {
    let q = db.from("activity_streams").select("activity_id,sport,start_date,summary").order("start_date", { ascending: false }).range(from, from + 999);
    if (ids) q = q.in("activity_id", ids);
    const { data, error } = await q;
    if (error) return out;
    for (const r of data ?? []) out[Number(r.activity_id)] = { sport: String(r.sport), date: String(r.start_date).slice(0, 10), summary: r.summary as StoredStreams["summary"] };
    if (!data || data.length < 1000 || ids) break;
  }
  return out;
}

class RateLimited extends Error {}

/** Fetches one activity's streams from Strava, reduces them and stores the result. */
export async function fetchAndStore(a: Activity): Promise<StoredStreams> {
  let raw: Record<string, { data: unknown[] }>;
  try {
    raw = await stravaGet<Record<string, { data: unknown[] }>>(`/activities/${a.id}/streams?keys=${KEYS}&key_by_type=true`);
  } catch (e) {
    const m = e instanceof Error ? e.message : String(e);
    if (/429/.test(m)) throw new RateLimited(m);
    // 404: no streams (a manual entry on Strava): store an empty summary so it is not asked again
    if (!/404/.test(m)) throw e;
    raw = {};
  }
  const streams: Streams = Object.fromEntries(Object.entries(raw).map(([k, v]) => [k, v?.data])) as Streams;
  const summary = { ...summarizeStreams(streams, a.sport), durability: durabilityOf(streams, a) };
  const row = { activity_id: a.id, sport: a.sport, start_date: a.date.slice(0, 10), summary, version: SUMMARY_VERSION, fetched_at: new Date().toISOString() };
  const { error } = await getSupabase().from("activity_streams").upsert(row, { onConflict: "activity_id" });
  if (error) throw new Error(error.message);
  return { sport: a.sport, date: row.start_date, summary };
}

/**
 * Backfills a small batch: newest activities first, within the last 12 months, skipping the ones stored. Stops at
 * the first rate-limit answer. `limit` keeps each run far below Strava's 100 requests per 15 minutes.
 */
export async function backfillStreams(acts: Activity[], limit = 25): Promise<{ fetched: number; remaining: number; stopped?: string }> {
  const since = new Date(Date.now() - 365 * 86_400_000).toISOString().slice(0, 10);
  const stored = await readStreams();
  const todo = acts
    .filter((a) => !a.manual && a.id > 0 && a.date.slice(0, 10) >= since && a.movingTime >= MIN_MOVING_S && !(a.id in stored))
    .sort((a, b) => (a.date < b.date ? 1 : -1));
  let fetched = 0;
  for (const a of todo.slice(0, limit)) {
    try {
      await fetchAndStore(a);
      fetched++;
    } catch (e) {
      return { fetched, remaining: todo.length - fetched, stopped: e instanceof Error ? e.message.slice(0, 120) : String(e) };
    }
  }
  return { fetched, remaining: todo.length - fetched };
}
