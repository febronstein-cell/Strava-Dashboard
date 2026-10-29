import "server-only";
import { mergeImport, MEASURED, type Checkin, type MeasuredField } from "@/lib/checkin";
import { readCheckins, saveCheckin } from "@/lib/checkin-data";
import { getSupabase } from "@/lib/supabase";

/**
 * Morning import of what the watch measured overnight (sleep, resting HR, HRV, training readiness).
 *
 * 1. Garmin Connect personal API key (GARMIN_API_KEY), pull-only. The key is exchanged for an access token at the
 *    documented token endpoint. The data endpoints of the personal API were not publicly readable when this was
 *    written, so the paths tried are the Garmin Health API ones (dailies, sleeps, hrv) and can be changed with
 *    GARMIN_API_BASE; every call that fails is logged with its status, and so is every field Garmin does not return.
 * 2. intervals.icu (INTERVALS_API_KEY, INTERVALS_ATHLETE_ID or "0" for the key's own account), as a fallback for any
 *    field Garmin did not give: GET /api/v1/athlete/{id}/wellness/{date}, basic auth API_KEY:<key>.
 * A field typed in the check-in is never overwritten. Each day is fetched once per run, and only today and yesterday
 * are asked for, so the providers' rate limits are never close.
 */

type Values = Partial<Record<MeasuredField, unknown>>;
interface ProviderLog {
  source: "garmin" | "intervals";
  configured: boolean;
  ok: boolean;
  /** fields received, by day */
  received: Record<string, string[]>;
  /** fields the provider never returned in this run */
  missing: string[];
  /** names (never values) of the fields the provider did send for each day, to see what it knows */
  seen: Record<string, string[]>;
  errors: string[];
}

const GARMIN_TOKEN_URL = "https://personal.connectapi.garmin.com/personalapitoken-service/personal-api/personal-api-key/token";
const garminBase = () => process.env.GARMIN_API_BASE || "https://personal.connectapi.garmin.com";
const DAY = 86_400_000;
const dayStart = (d: string) => Math.floor(Date.parse(`${d}T00:00:00-03:00`) / 1000);

async function garmin(days: string[]): Promise<{ log: ProviderLog; values: Record<string, Values> }> {
  const log: ProviderLog = { source: "garmin", configured: !!process.env.GARMIN_API_KEY, ok: false, received: {}, missing: [], seen: {}, errors: [] };
  const values: Record<string, Values> = {};
  if (!log.configured) return { log, values };

  let token: string | undefined;
  try {
    const res = await fetch(GARMIN_TOKEN_URL, { method: "POST", headers: { Authorization: `ApiKey ${process.env.GARMIN_API_KEY}` }, cache: "no-store" });
    const text = await res.text();
    const found = findToken(text);
    token = found.token;
    if (!res.ok || !token) log.errors.push(`token: HTTP ${res.status}, no token found in the answer (${found.shape})`);
  } catch (e) {
    log.errors.push(`token: ${e instanceof Error ? e.message : String(e)}`);
  }
  if (!token) return { log, values };

  const get = async (path: string, from: string, to: string) => {
    const url = `${garminBase()}${path}?uploadStartTimeInSeconds=${dayStart(from)}&uploadEndTimeInSeconds=${dayStart(to) + 86_399}`;
    const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` }, cache: "no-store" });
    if (!res.ok) throw new Error(`${path}: HTTP ${res.status}`);
    return (await res.json()) as Record<string, unknown>[];
  };
  const [from, to] = [days[0], days[days.length - 1]];
  const put = (d: unknown, f: MeasuredField, v: unknown) => {
    const day = typeof d === "string" ? d.slice(0, 10) : null;
    if (!day || !days.includes(day) || v == null) return;
    (values[day] ??= {})[f] = v;
  };

  for (const [path, read] of [
    ["/wellness-api/rest/dailies", (r: Record<string, unknown>) => put(r.calendarDate, "restingHR", r.restingHeartRateInBeatsPerMinute)],
    [
      "/wellness-api/rest/sleeps",
      (r: Record<string, unknown>) => {
        put(r.calendarDate, "sleepHours", typeof r.durationInSeconds === "number" ? Math.round((r.durationInSeconds / 3600) * 100) / 100 : null);
        put(r.calendarDate, "sleepScore", (r.overallSleepScore as { value?: number } | undefined)?.value);
        if (typeof r.startTimeInSeconds === "number" && typeof r.durationInSeconds === "number") {
          const wake = new Date((r.startTimeInSeconds + r.durationInSeconds + (Number(r.startTimeOffsetInSeconds) || -3 * 3600)) * 1000);
          put(r.calendarDate, "wakeTime", `${wake.getUTCHours()}:${String(wake.getUTCMinutes()).padStart(2, "0")}`);
        }
      },
    ],
    [
      "/wellness-api/rest/hrv",
      (r: Record<string, unknown>) => {
        put(r.calendarDate, "hrv", r.lastNightAvg);
        const s = String(r.status ?? "").toLowerCase();
        if (["balanced", "unbalanced", "low", "poor"].includes(s)) put(r.calendarDate, "hrvStatus", s);
      },
    ],
    ["/wellness-api/rest/trainingReadiness", (r: Record<string, unknown>) => put(r.calendarDate, "trainingReadiness", r.score)],
  ] as const) {
    try {
      for (const r of await get(path, from, to)) read(r);
      log.ok = true;
    } catch (e) {
      log.errors.push(e instanceof Error ? e.message : String(e));
    }
  }
  finish(log, values);
  return { log, values };
}

/**
 * The access token in Garmin's answer, whatever its shape: a bare token, or JSON with a token under any key that
 * looks like one (searched through nested objects). `shape` lists the field NAMES only, for the log: never values.
 */
export function findToken(text: string): { token?: string; shape: string } {
  const t = text.trim();
  if (/^[\w-]+\.[\w-]+\.[\w-]+$/.test(t)) return { token: t, shape: "bare token" };
  let json: unknown;
  try {
    json = JSON.parse(t);
  } catch {
    return { shape: t ? "not JSON" : "empty" };
  }
  if (typeof json === "string" && json.length > 20) return { token: json, shape: "JSON string" };
  const names: string[] = [];
  const walk = (o: unknown, path: string): string | undefined => {
    if (!o || typeof o !== "object") return undefined;
    for (const [k, v] of Object.entries(o as Record<string, unknown>)) {
      names.push(path + k);
      if (typeof v === "string" && /token|jwt|bearer/i.test(k) && v.length > 20) return v;
    }
    for (const [k, v] of Object.entries(o as Record<string, unknown>)) {
      const r = walk(v, path + k + ".");
      if (r) return r;
    }
    return undefined;
  };
  const token = walk(json, "");
  return { token, shape: `fields: ${names.slice(0, 12).join(", ") || "none"}` };
}

async function intervals(days: string[]): Promise<{ log: ProviderLog; values: Record<string, Values> }> {
  const key = process.env.INTERVALS_API_KEY;
  const log: ProviderLog = { source: "intervals", configured: !!key, ok: false, received: {}, missing: [], seen: {}, errors: [] };
  const values: Record<string, Values> = {};
  if (!key) return { log, values };
  const athlete = process.env.INTERVALS_ATHLETE_ID || "0";
  const auth = `Basic ${Buffer.from(`API_KEY:${key}`).toString("base64")}`;

  for (const day of days) {
    try {
      // the single-day endpoint (the list one can blank resting HR that is still provisional)
      const res = await fetch(`https://intervals.icu/api/v1/athlete/${encodeURIComponent(athlete)}/wellness/${day}`, { headers: { Authorization: auth }, cache: "no-store" });
      if (res.status === 404) continue;
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const w = (await res.json()) as Record<string, unknown>;
      log.seen[day] = Object.entries(w).filter(([, x]) => x !== null && x !== undefined && x !== "").map(([k]) => k);
      const v: Values = {};
      if (typeof w.restingHR === "number") v.restingHR = w.restingHR;
      if (typeof w.hrv === "number") v.hrv = w.hrv;
      if (typeof w.sleepSecs === "number") v.sleepHours = Math.round((w.sleepSecs / 3600) * 100) / 100;
      if (typeof w.sleepScore === "number") v.sleepScore = w.sleepScore;
      if (typeof w.readiness === "number") v.trainingReadiness = w.readiness;
      values[day] = v;
      log.ok = true;
    } catch (e) {
      log.errors.push(`${day}: ${e instanceof Error ? e.message : String(e)}`);
    }
  }
  finish(log, values);
  return { log, values };
}

function finish(log: ProviderLog, values: Record<string, Values>) {
  const seen = new Set<string>();
  for (const [day, v] of Object.entries(values)) {
    log.received[day] = Object.keys(v);
    Object.keys(v).forEach((k) => seen.add(k));
  }
  log.missing = MEASURED.filter((f) => !seen.has(f));
}

const brtDay = (offset = 0) => new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(new Date(Date.now() + offset * DAY));

/** Imports today and yesterday (America/Sao_Paulo), saves the check-ins with their signals and logs the run. */
export async function importCheckins(days: string[] = [brtDay(-1), brtDay()]) {
  const [g, i] = await Promise.all([garmin(days), intervals(days)]);
  const stored = await readCheckins(10);
  const saved: string[] = [];
  for (const day of days) {
    // intervals.icu first, then Garmin on top: Garmin is the primary source, intervals fills what it lacks
    let c: Checkin | null = stored.find((s) => s.day === day) ?? null;
    if (i.values[day] && Object.keys(i.values[day]).length) c = mergeImport(c, day, i.values[day], "intervals");
    if (g.values[day] && Object.keys(g.values[day]).length) c = mergeImport(c, day, g.values[day], "garmin");
    if (!c) continue;
    await saveCheckin(c);
    saved.push(day);
  }
  const log = { at: new Date().toISOString(), days, saved, providers: [g.log, i.log] };
  await getSupabase()
    .from("sync_state")
    .upsert({ key: "checkin_import", value: JSON.stringify(log), updated_at: new Date().toISOString() }, { onConflict: "key" })
    .then(() => undefined, () => undefined);
  return log;
}
