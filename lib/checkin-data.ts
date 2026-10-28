import "server-only";
import { cacheLife, cacheTag } from "next/cache";
import { readiness, type Checkin, type Pain, type Reason, type Signal } from "@/lib/checkin";
import { getSupabase, hasSupabase } from "@/lib/supabase";

export interface StoredCheckin extends Checkin {
  signal?: Signal;
  reasons: Reason[];
}

const num = (v: unknown) => (v === null || v === undefined ? undefined : Number(v));
const str = (v: unknown) => (v === null || v === undefined || v === "" ? undefined : String(v));

export function fromRow(r: Record<string, unknown>): StoredCheckin {
  return {
    day: String(r.day).slice(0, 10),
    wakeTime: str(r.wake_time),
    sleepHours: num(r.sleep_hours),
    sleepSource: str(r.sleep_source) as Checkin["sleepSource"],
    sleepScore: num(r.sleep_score),
    restingHR: num(r.resting_hr),
    hrv: num(r.hrv),
    hrvStatus: str(r.hrv_status) as Checkin["hrvStatus"],
    trainingReadiness: num(r.training_readiness),
    legs: num(r.legs),
    energy: num(r.energy),
    pain: Array.isArray(r.pain) ? (r.pain as Pain[]) : [],
    notes: str(r.notes),
    sources: (r.sources as Checkin["sources"]) ?? {},
    signal: str(r.signal) as Signal | undefined,
    reasons: Array.isArray(r.signal_reasons) ? (r.signal_reasons as Reason[]) : [],
  };
}

export function toRow(c: Checkin) {
  return {
    day: c.day,
    wake_time: c.wakeTime ?? null,
    sleep_hours: c.sleepHours ?? null,
    sleep_source: c.sleepSource ?? null,
    sleep_score: c.sleepScore ?? null,
    resting_hr: c.restingHR ?? null,
    hrv: c.hrv ?? null,
    hrv_status: c.hrvStatus ?? null,
    training_readiness: c.trainingReadiness ?? null,
    legs: c.legs ?? null,
    energy: c.energy ?? null,
    pain: c.pain,
    notes: c.notes ?? null,
    sources: c.sources,
  };
}

/** The last `days` check-ins, oldest first. Empty when the table does not exist yet. */
export async function readCheckins(days = 60): Promise<StoredCheckin[]> {
  if (!hasSupabase()) return [];
  const from = new Date(Date.now() - days * 86_400_000).toISOString().slice(0, 10);
  const { data, error } = await getSupabase().from("checkins").select("*").gte("day", from).order("day", { ascending: true });
  if (error) return [];
  return (data ?? []).map(fromRow);
}

/** Cached for the pages (refreshed whenever a check-in is saved or imported). */
export async function getCheckins(): Promise<StoredCheckin[]> {
  "use cache";
  cacheLife({ stale: 60, revalidate: 900, expire: 86400 });
  cacheTag("strava-live");
  return readCheckins(60);
}

/**
 * Saves one check-in and refreshes the signal of that day and of the next day (whose baseline and "two days in a
 * row" rules depend on it).
 */
export async function saveCheckin(c: Checkin): Promise<StoredCheckin> {
  const db = getSupabase();
  const history = await readCheckins(30);
  const others = history.filter((h) => h.day !== c.day);
  const r = readiness(c, others);
  const row = { ...toRow(c), signal: r?.signal ?? null, signal_reasons: r?.reasons ?? [], updated_at: new Date().toISOString() };
  const { error } = await db.from("checkins").upsert(row, { onConflict: "day" });
  if (error) throw new Error(error.message);

  const next = history.find((h) => h.day === new Date(Date.parse(c.day + "T00:00:00Z") + 86_400_000).toISOString().slice(0, 10));
  if (next) {
    const rn = readiness(next, [...others.filter((h) => h.day !== next.day), c]);
    await db.from("checkins").update({ signal: rn?.signal ?? null, signal_reasons: rn?.reasons ?? [] }).eq("day", next.day);
  }
  return { ...c, signal: r?.signal, reasons: r?.reasons ?? [] };
}
