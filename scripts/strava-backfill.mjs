#!/usr/bin/env node
/**
 * One-time import of your WHOLE Strava history into the Supabase database.
 *
 *   npm run strava:backfill            (or: node --env-file=.env.local scripts/strava-backfill.mjs)
 *
 * It is safe to run again at any time: activities are upserted by id, activities that no longer
 * exist on Strava are removed from the database, and the history is never duplicated.
 * Costs about 11 Strava requests (200 activities per request) for ~2000 activities.
 *
 * Needs in .env.local: STRAVA_CLIENT_ID, STRAVA_CLIENT_SECRET, STRAVA_REFRESH_TOKEN,
 * SUPABASE_URL, SUPABASE_SECRET_KEY. The tables come from supabase/schema.sql.
 *
 * NOTE: the mapping below repeats lib/strava/client.ts (normalize) + lib/strava/db.ts (toRow)
 * in plain JS. If you change one, change the other.
 */
import { createClient } from "@supabase/supabase-js";

const e = process.env;
for (const k of ["STRAVA_CLIENT_ID", "STRAVA_CLIENT_SECRET", "STRAVA_REFRESH_TOKEN", "SUPABASE_URL", "SUPABASE_SECRET_KEY"]) {
  if (!e[k]) {
    console.error(`Missing ${k} in .env.local`);
    process.exit(1);
  }
}

const db = createClient(new URL(e.SUPABASE_URL).origin, e.SUPABASE_SECRET_KEY, { auth: { persistSession: false } });
const log = (...a) => console.log(new Date().toLocaleTimeString(), ...a);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const includePrivate = e.STRAVA_INCLUDE_PRIVATE === "true";

// ------------------------------------------------------------------ Strava
let token;
async function refreshToken() {
  const res = await fetch("https://www.strava.com/oauth/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: e.STRAVA_CLIENT_ID,
      client_secret: e.STRAVA_CLIENT_SECRET,
      grant_type: "refresh_token",
      refresh_token: e.STRAVA_REFRESH_TOKEN,
    }),
  });
  if (!res.ok) throw new Error(`Token refresh failed (${res.status})`);
  token = (await res.json()).access_token;
}

async function get(path) {
  for (let attempt = 0; attempt < 4; attempt++) {
    const res = await fetch(`https://www.strava.com/api/v3${path}`, { headers: { Authorization: `Bearer ${token}` } });
    if (res.status === 401) {
      await refreshToken();
      continue;
    }
    if (res.status === 429) {
      const wait = 15 * 60_000 - (Date.now() % (15 * 60_000)) + 5000; // until the next 15-minute window
      log(`Strava rate limit (429). Waiting ${Math.ceil(wait / 60000)} min...`);
      await sleep(wait);
      continue;
    }
    if (!res.ok) throw new Error(`Strava ${res.status} on ${path}`);
    return res.json();
  }
  throw new Error(`Too many retries on ${path}`);
}

// ----------------------------------------------------------------- mapping
const SPORT_MAP = {
  Run: "run", TrailRun: "run", VirtualRun: "run",
  Ride: "ride", GravelRide: "ride", MountainBikeRide: "ride", EBikeRide: "ride", EMountainBikeRide: "ride", VirtualRide: "ride",
  Swim: "swim",
  WeightTraining: "strength", Workout: "strength", Crossfit: "strength",
};

function toRow(raw) {
  const sport = SPORT_MAP[raw.sport_type] ?? SPORT_MAP[raw.type] ?? "other";
  const race = (raw.type === "Run" && raw.workout_type === 1) || (raw.type === "Ride" && raw.workout_type === 11);
  const indoor = sport !== "strength" && (raw.sport_type.startsWith("Virtual") || !!raw.trainer || !raw.map?.summary_polyline);
  return {
    id: raw.id,
    name: raw.name,
    sport,
    start_local: raw.start_date_local.replace("Z", ""),
    distance: sport === "strength" ? 0 : raw.distance,
    moving_time: raw.moving_time,
    elapsed_time: raw.elapsed_time ?? raw.moving_time,
    elevation: sport === "strength" ? 0 : raw.total_elevation_gain,
    race: !!race,
    indoor: !!indoor,
    hr: raw.average_heartrate ? Math.round(raw.average_heartrate) : null,
    hr_max: raw.max_heartrate ? Math.round(raw.max_heartrate) : null,
    cad: raw.average_cadence ? Math.round(raw.average_cadence * 10) / 10 : null,
    watts: raw.average_watts ? Math.round(raw.average_watts) : null,
    np: raw.weighted_average_watts && raw.device_watts ? Math.round(raw.weighted_average_watts) : null,
    device_watts: raw.average_watts ? !!raw.device_watts : null,
    start_lat: raw.start_latlng?.[0] ?? null,
    start_lng: raw.start_latlng?.[1] ?? null,
    polyline: raw.map?.summary_polyline ?? null,
    synced_at: new Date().toISOString(),
  };
}

// -------------------------------------------------------------------- main
const startedAt = new Date().toISOString();
await refreshToken();

log("Reading your Strava profile...");
const athlete = await get("/athlete");
const athleteJson = JSON.stringify({
  id: athlete.id,
  name: `${athlete.firstname} ${athlete.lastname}`.trim(),
  avatar: athlete.profile?.startsWith("http") ? athlete.profile : undefined,
  createdYear: new Date(athlete.created_at).getFullYear(),
});

log("Downloading the whole history from Strava...");
const all = [];
for (let page = 1; ; page++) {
  const batch = await get(`/athlete/activities?per_page=200&page=${page}`);
  if (!Array.isArray(batch) || batch.length === 0) break;
  all.push(...batch);
  log(`  page ${page}: ${all.length} activities so far`);
  if (batch.length < 200) break;
}

const kept = all.filter((a) => includePrivate || !a.private);
const rows = kept.map(toRow);
log(`${all.length} downloaded; ${all.length - kept.length} private skipped; ${rows.length} to save.`);

log("Saving to the database...");
for (let i = 0; i < rows.length; i += 500) {
  const { error } = await db.from("activities").upsert(rows.slice(i, i + 500), { onConflict: "id" });
  if (error) throw new Error(`Supabase upsert failed: ${error.message}`);
  log(`  saved ${Math.min(i + 500, rows.length)}/${rows.length}`);
}

// remove activities that no longer exist on Strava (deleted or turned private)
const keep = new Set(rows.map((r) => r.id));
const stale = [];
for (let from = 0; ; from += 1000) {
  const { data, error } = await db.from("activities").select("id").range(from, from + 999);
  if (error) throw new Error(`Supabase read failed: ${error.message}`);
  for (const r of data) if (!keep.has(Number(r.id))) stale.push(Number(r.id));
  if (data.length < 1000) break;
}
for (let i = 0; i < stale.length; i += 200) {
  const { error } = await db.from("activities").delete().in("id", stale.slice(i, i + 200));
  if (error) throw new Error(`Supabase delete failed: ${error.message}`);
}
if (stale.length) log(`Removed ${stale.length} activities that are no longer on Strava.`);

const state = [
  { key: "athlete", value: athleteJson },
  { key: "last_sync", value: startedAt },
  { key: "backfill_done", value: new Date().toISOString() },
].map((s) => ({ ...s, updated_at: new Date().toISOString() }));
const { error: stateError } = await db.from("sync_state").upsert(state, { onConflict: "key" });
if (stateError) throw new Error(`Supabase sync_state failed: ${stateError.message}`);

const { count } = await db.from("activities").select("*", { count: "exact", head: true });
log(`Done. The database now holds ${count} activities. The site will switch to it on the next refresh.`);
