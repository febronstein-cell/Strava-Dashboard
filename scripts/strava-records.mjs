#!/usr/bin/env node
/**
 * Computes your bike POWER CURVE (best average power from 5 s up to 3 h) and saves it to
 * data/records.json, which feeds the "Notable power outputs" card.
 *
 *   npm run strava:records                      (or: node --env-file=.env.local scripts/strava-records.mjs)
 *   node --env-file=.env.local scripts/strava-records.mjs --window 60 --daily 700
 *
 * REQUIRES the Strava permission `activity:read_all`: without it Strava does not return the power
 * stream. Authorize once with:  node scripts/strava-auth.mjs --all   (see the README).
 *
 * Why a script? Strava only exposes the power stream ONE RIDE AT A TIME. Doing that on every page
 * refresh would blow the API rate limit (100 requests / 15 min, 1000 / day). So it runs locally,
 * remembers what it already analyzed (data/records-cache.json) and can be stopped and resumed at
 * any time. After the first run only NEW rides cost requests.
 *
 * It pauses on its own to stay inside a budget, leaving room for the live site to keep syncing:
 *   --window N   max requests per 15-minute window (default 60)
 *   --daily N    max requests per day (default 700)
 *   --max N      stop after N requests in this run (default: no limit)
 *
 * Includes indoor rides (trainer, Zwift).
 */
import fs from "node:fs";
import path from "node:path";

const API = "https://www.strava.com/api/v3";
const CACHE_PATH = path.resolve("data/records-cache.json");
const OUT_PATH = path.resolve("data/records.json");
const POWER_DURATIONS = [5, 10, 30, 60, 300, 600, 1200, 3600, 7200, 10800];
const RIDE_TYPES = new Set(["Ride", "VirtualRide", "GravelRide", "MountainBikeRide"]);
const WINDOW_MS = 15 * 60 * 1000;

const arg = (name, fallback) => {
  const i = process.argv.indexOf(`--${name}`);
  return i > -1 ? Number(process.argv[i + 1]) : fallback;
};
const windowBudget = arg("window", 60);
const dailyBudget = arg("daily", 700);
const maxRequests = arg("max", Infinity);

const e = process.env;
if (!e.STRAVA_CLIENT_ID || !e.STRAVA_CLIENT_SECRET || !e.STRAVA_REFRESH_TOKEN) {
  console.error("Missing STRAVA_* variables. Run with: node --env-file=.env.local scripts/strava-records.mjs");
  process.exit(1);
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const log = (...a) => console.log(new Date().toLocaleTimeString(), ...a);

// ------------------------------------------------------------ request budget
let usedInWindow = 0;
let windowStart = Math.floor(Date.now() / WINDOW_MS) * WINDOW_MS;
let usedToday = 0;
let day = new Date().toISOString().slice(0, 10);
let requestsThisRun = 0;

async function budget() {
  for (;;) {
    const now = Date.now();
    const w = Math.floor(now / WINDOW_MS) * WINDOW_MS;
    if (w !== windowStart) {
      windowStart = w;
      usedInWindow = 0;
    }
    const d = new Date(now).toISOString().slice(0, 10);
    if (d !== day) {
      day = d;
      usedToday = 0;
    }
    if (requestsThisRun >= maxRequests) return false;
    if (usedToday >= dailyBudget) {
      log(`Daily budget (${dailyBudget}) reached. Run again tomorrow; progress is saved.`);
      return false;
    }
    if (usedInWindow < windowBudget) return true;
    const wait = windowStart + WINDOW_MS - now + 3000;
    log(`Window budget used (${windowBudget}). Waiting ${Math.ceil(wait / 60000)} min...`);
    await sleep(wait);
  }
}

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
  const json = await res.json();
  token = json.access_token;
  if (!String(json.scope ?? "").includes("activity:read_all")) {
    log("Note: this token does not have activity:read_all, so Strava may not return power streams.");
  }
}

/** GET with budget, token refresh and 429 handling. Returns null when the budget says stop. */
async function get(pathAndQuery) {
  for (let attempt = 0; attempt < 4; attempt++) {
    if (!(await budget())) return null;
    usedInWindow++;
    usedToday++;
    requestsThisRun++;
    const res = await fetch(API + pathAndQuery, { headers: { Authorization: `Bearer ${token}` } });
    if (res.status === 401) {
      await refreshToken();
      continue;
    }
    if (res.status === 429) {
      const wait = windowStart + WINDOW_MS - Date.now() + 5000;
      log(`Strava said 429. Waiting ${Math.ceil(wait / 60000)} min...`);
      usedInWindow = windowBudget; // force the wait
      await sleep(Math.max(wait, 60_000));
      continue;
    }
    if (res.status === 404) return {};
    if (!res.ok) throw new Error(`Strava ${res.status} on ${pathAndQuery}`);
    return res.json();
  }
  throw new Error(`Too many retries on ${pathAndQuery}`);
}

// ------------------------------------------------------------------ cache
const readJson = (p, fallback) => (fs.existsSync(p) ? JSON.parse(fs.readFileSync(p, "utf8")) : fallback);
const cache = readJson(CACHE_PATH, { rides: {} });
fs.mkdirSync(path.dirname(CACHE_PATH), { recursive: true });

function saveAll(totalRides) {
  fs.writeFileSync(CACHE_PATH, JSON.stringify(cache));
  const power = {};
  for (const [id, r] of Object.entries(cache.rides)) {
    for (const d of POWER_DURATIONS) {
      const w = r.power?.[d];
      if (w && (!power[d] || w > power[d].watts)) {
        power[d] = { watts: w, id: Number(id), name: r.name, date: r.date, indoor: !!r.indoor };
      }
    }
  }
  const body = {
    analyzed: { rides: Object.keys(cache.rides).length },
    total: { rides: totalRides },
    power,
  };
  // Only rewrite the file when something really changed (so the daily automation does not
  // create a commit, and a site deploy, when there is no new ride).
  const prev = readJson(OUT_PATH, null);
  if (prev && JSON.stringify({ analyzed: prev.analyzed, total: prev.total, power: prev.power }) === JSON.stringify(body)) {
    return;
  }
  fs.writeFileSync(OUT_PATH, JSON.stringify({ generatedAt: new Date().toISOString(), ...body }, null, 2));
}

/** Best average of `d` consecutive seconds, for each duration, from a 1 Hz watts series. */
function powerCurve(watts) {
  const prefix = new Float64Array(watts.length + 1);
  for (let i = 0; i < watts.length; i++) prefix[i + 1] = prefix[i] + (watts[i] || 0);
  const out = {};
  for (const d of POWER_DURATIONS) {
    if (watts.length < d) continue;
    let best = 0;
    for (let i = 0; i + d <= watts.length; i++) best = Math.max(best, prefix[i + d] - prefix[i]);
    out[d] = Math.round(best / d);
  }
  return out;
}

// ------------------------------------------------------------------- main
await refreshToken();

log("Listing activities...");
const all = [];
for (let page = 1; ; page++) {
  const batch = await get(`/athlete/activities?per_page=200&page=${page}`);
  if (!batch) break;
  if (!Array.isArray(batch) || batch.length === 0) break;
  all.push(...batch);
  if (batch.length < 200) break;
}

const rides = all.filter((a) => RIDE_TYPES.has(a.sport_type) && a.device_watts === true && a.moving_time >= 5);
const isIndoor = (a) => a.sport_type.startsWith("Virtual") || !!a.trainer || !a.map?.summary_polyline;
log(`${all.length} activities | ${rides.length} rides with a power meter`);

let done = 0;
let noPowerStreak = 0;
for (const a of rides) {
  if (cache.rides[a.id]) continue;
  const s = await get(`/activities/${a.id}/streams?keys=watts,time&key_by_type=true`);
  if (s === null) break;
  const w = s.watts?.data;
  const t = s.time?.data;
  if (!w) {
    // Strava only serves the power stream to apps authorized with activity:read_all
    if (++noPowerStreak >= 3) {
      log("Strava is not returning power streams for these rides.");
      log("Authorize the bigger permission with:  node scripts/strava-auth.mjs --all");
      log("then update STRAVA_REFRESH_TOKEN (.env.local and Vercel) and run this again.");
      break;
    }
    continue;
  }
  noPowerStreak = 0;
  // rebuild a 1 Hz series (stopped seconds count as 0 W)
  const len = t?.length ? t[t.length - 1] + 1 : w.length;
  const series = new Array(len).fill(0);
  for (let i = 0; i < w.length; i++) series[t ? t[i] : i] = w[i];
  cache.rides[a.id] = { name: a.name, date: a.start_date_local.replace("Z", ""), indoor: isIndoor(a), power: powerCurve(series) };
  if (++done % 10 === 0) {
    saveAll(rides.length);
    log(`rides analyzed: ${Object.keys(cache.rides).length}/${rides.length}`);
  }
}

saveAll(rides.length);
const analyzed = Object.keys(cache.rides).length;
log(`Saved. Rides ${analyzed}/${rides.length}.`, analyzed >= rides.length ? "All done." : "Run again to continue.");
