import "server-only";
import { reverseGeocode } from "@/lib/strava/geocode";
import { getSupabase } from "@/lib/supabase";
import { detectTriathlons, type DetectedRace, type DetectItem } from "./race-detect";

/** Marker kept in the `notes` column so automatic rows can be told apart from the ones you typed. */
export const AUTO = "auto:";

async function loadItems(onlyDate?: string): Promise<DetectItem[]> {
  const db = getSupabase();
  const items: DetectItem[] = [];
  for (let from = 0; ; from += 1000) {
    let q = db.from("activities").select("id,name,sport,start_local,distance,elapsed_time,race,start_lat,start_lng").in("sport", ["swim", "ride", "run"]);
    if (onlyDate) q = q.gte("start_local", `${onlyDate}T00:00:00`).lte("start_local", `${onlyDate}T23:59:59`);
    const { data, error } = await q.range(from, from + 999);
    if (error) throw new Error(`Race detection could not read activities: ${error.message}`);
    for (const r of data ?? []) {
      items.push({
        id: Number(r.id),
        name: String(r.name),
        sport: String(r.sport),
        date: String(r.start_local).slice(0, 19),
        distance: Number(r.distance),
        elapsed: Number(r.elapsed_time),
        race: !!r.race,
        lat: r.start_lat,
        lng: r.start_lng,
      });
    }
    if ((data ?? []).length < 1000) break;
  }
  return items;
}

const cellKey = (lat: number, lng: number) => `${Math.round(lat * 10)}:${Math.round(lng * 10)}`;

/** Places (0.1° cells, about 11 km) where you have started 8 or more workouts: your usual training spots. */
function regularPlaces(items: DetectItem[]): (p: [number, number]) => boolean {
  const counts = new Map<string, number>();
  for (const it of items) if (it.lat != null && it.lng != null) counts.set(cellKey(it.lat, it.lng), (counts.get(cellKey(it.lat, it.lng)) ?? 0) + 1);
  return (p) => (counts.get(cellKey(p[0], p[1])) ?? 0) >= 8;
}

/** Where most of the outdoor training starts (0.1° grid, about 11 km): "home". */
function homeOf(items: DetectItem[]): [number, number] | undefined {
  const cells = new Map<string, { n: number; lat: number; lng: number }>();
  for (const it of items) {
    if (it.lat == null || it.lng == null) continue;
    const key = `${Math.round(it.lat * 10)}:${Math.round(it.lng * 10)}`;
    const c = cells.get(key) ?? { n: 0, lat: 0, lng: 0 };
    c.n++;
    c.lat += it.lat;
    c.lng += it.lng;
    cells.set(key, c);
  }
  const best = [...cells.values()].sort((a, b) => b.n - a.n)[0];
  return best ? [best.lat / best.n, best.lng / best.n] : undefined;
}

async function placeName(r: DetectedRace): Promise<string | undefined> {
  if (r.lat == null || r.lng == null) return undefined;
  try {
    const g = await reverseGeocode(Math.round(r.lat * 100) / 100, Math.round(r.lng * 100) / 100);
    return g.country && g.countryCode !== "BR" ? `${g.name}, ${g.country}` : g.name;
  } catch {
    return undefined;
  }
}

/**
 * Looks for triathlons (the whole history, or just `onlyDate`) and saves the new ones in the `races`
 * table. A day that already has a race row (typed by you or found before) is left alone.
 */
export async function detectAndStoreRaces(onlyDate?: string, opts: { reset?: boolean } = {}): Promise<{ found: number; inserted: DetectedRace[] }> {
  const db = getSupabase();
  // "reset" removes the rows this detector made before (never the ones you typed), to start over with new rules
  if (opts.reset) {
    const { error: e } = await db.from("races").delete().like("notes", `${AUTO}%`);
    if (e) throw new Error(`Could not clear the automatic races: ${e.message}`);
  }

  const all = await loadItems();
  const found = detectTriathlons(onlyDate ? all.filter((x) => x.date.startsWith(onlyDate)) : all, { home: homeOf(all), isRegular: regularPlaces(all) });
  if (found.length === 0) return { found: 0, inserted: [] };

  const { data: existing, error } = await db.from("races").select("race_date");
  if (error) throw new Error(`Race detection could not read races: ${error.message}`);
  const taken = new Set((existing ?? []).map((r) => String(r.race_date).slice(0, 10)));

  const inserted: DetectedRace[] = [];
  for (const r of found) {
    if (taken.has(r.date)) continue;
    const place = await placeName(r);
    const name = place ? `${r.format} triathlon · ${place}` : `${r.format} triathlon`;
    const { error: e } = await db.from("races").insert({
      name,
      race_date: r.date,
      location: place ?? null,
      distance_label: r.format,
      finish_seconds: r.finishSeconds,
      swim_seconds: r.swimSeconds,
      t1_seconds: r.t1Seconds,
      bike_seconds: r.bikeSeconds,
      t2_seconds: r.t2Seconds,
      run_seconds: r.runSeconds,
      notes: `${AUTO}${r.swimId},${r.rideId},${r.runId}${r.confirmed ? "" : " · not marked as a race on Strava: check it"}`,
    });
    if (e) throw new Error(`Could not save the race of ${r.date}: ${e.message}`);
    inserted.push(r);
    taken.add(r.date);
  }
  return { found: found.length, inserted };
}
