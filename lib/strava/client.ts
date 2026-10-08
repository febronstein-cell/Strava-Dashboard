import "server-only";
import { siteConfig, type SportKey } from "@/site.config";
import { decimate, decodePolyline, encodePolyline, trimAroundHome, type LatLng } from "@/lib/geo";
import type { Activity, GeoActivity, RawActivity } from "./types";

const API = "https://www.strava.com/api/v3";
const TOKEN_URL = "https://www.strava.com/oauth/token";
const PER_PAGE = 200;
const MAX_PAGES = 15; // 3000 atividades por ano: mais que suficiente
const MAX_POINTS = 60; // pontos por trajeto no mapa

export function hasStravaCredentials() {
  return Boolean(
    process.env.STRAVA_CLIENT_ID &&
      process.env.STRAVA_CLIENT_SECRET &&
      process.env.STRAVA_REFRESH_TOKEN,
  );
}

/**
 * O Strava pode devolver um refresh token novo a cada troca. Guardamos o mais
 * recente em memória (mesma instância do servidor). O valor do .env continua
 * valendo como ponto de partida.
 */
let latestRefreshToken: string | undefined;
/** Access token vale 6 h: reaproveitamos para não renovar a cada requisição. */
let tokenCache: { token: string; expiresAt: number } | undefined;

async function getAccessToken(): Promise<string> {
  if (tokenCache && tokenCache.expiresAt - Date.now() > 120_000) return tokenCache.token;

  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: process.env.STRAVA_CLIENT_ID!,
      client_secret: process.env.STRAVA_CLIENT_SECRET!,
      grant_type: "refresh_token",
      refresh_token: latestRefreshToken ?? process.env.STRAVA_REFRESH_TOKEN!,
    }),
    cache: "no-store",
  });

  if (!res.ok) {
    throw new Error(
      `Strava: falha ao renovar o token (${res.status}). Confira STRAVA_CLIENT_ID, STRAVA_CLIENT_SECRET e STRAVA_REFRESH_TOKEN.`,
    );
  }
  const json = (await res.json()) as { access_token: string; refresh_token?: string; expires_at?: number };
  if (json.refresh_token) latestRefreshToken = json.refresh_token;
  tokenCache = {
    token: json.access_token,
    expiresAt: json.expires_at ? json.expires_at * 1000 : Date.now() + 5 * 3600_000,
  };
  return json.access_token;
}

async function stravaGet<T>(path: string): Promise<T> {
  const token = await getAccessToken();
  const res = await fetch(`${API}${path}`, {
    headers: { Authorization: `Bearer ${token}` },
    cache: "no-store",
  });
  if (res.status === 429) {
    throw new Error("Strava: limite de requisições atingido (429). Tente novamente mais tarde.");
  }
  if (!res.ok) throw new Error(`Strava: erro ${res.status} em ${path}`);
  return (await res.json()) as T;
}

const SPORT_MAP: Record<string, SportKey> = {
  Run: "run",
  TrailRun: "run",
  VirtualRun: "run",
  Ride: "ride",
  GravelRide: "ride",
  MountainBikeRide: "ride",
  EBikeRide: "ride",
  EMountainBikeRide: "ride",
  VirtualRide: "ride",
  Swim: "swim",
  WeightTraining: "strength",
  Workout: "strength",
  Crossfit: "strength",
};

/** Anything not listed above (walk, hike, yoga, rowing...) counts as "other". */

function normalize(raw: RawActivity): Activity | null {
  const sport: SportKey = SPORT_MAP[raw.sport_type] ?? SPORT_MAP[raw.type] ?? "other";
  // workout_type 1 = corrida de competição; 11 = pedal de competição
  const race = (raw.type === "Run" && raw.workout_type === 1) || (raw.type === "Ride" && raw.workout_type === 11);
  // sem GPS (esteira, rolo, piscina) ou virtual/rolo marcado = ambiente fechado
  const indoor =
    sport !== "strength" && (raw.sport_type.startsWith("Virtual") || !!raw.trainer || !raw.map?.summary_polyline);
  return {
    id: raw.id,
    name: raw.name,
    sport,
    date: raw.start_date_local.replace("Z", ""),
    distance: sport === "strength" ? 0 : raw.distance,
    movingTime: raw.moving_time,
    elapsedTime: raw.elapsed_time ?? raw.moving_time,
    elevation: sport === "strength" ? 0 : raw.total_elevation_gain,
    ...(race ? { race: true } : {}),
    ...(indoor ? { indoor: true } : {}),
    ...(raw.average_heartrate ? { hr: Math.round(raw.average_heartrate) } : {}),
    ...(raw.max_heartrate ? { hrMax: Math.round(raw.max_heartrate) } : {}),
    ...(raw.average_cadence ? { cad: Math.round(raw.average_cadence * 10) / 10 } : {}),
    ...(raw.average_watts ? { watts: Math.round(raw.average_watts), deviceWatts: !!raw.device_watts } : {}),
  };
}

function toGeo(raw: RawActivity, act: Activity, year: number): GeoActivity | null {
  const poly = raw.map?.summary_polyline;
  // Zwift/rolo/manual têm "GPS" de um mundo fictício: não entram no mapa
  const indoor = raw.sport_type.startsWith("Virtual") || raw.trainer || raw.manual;
  if (!poly || act.sport === "strength" || indoor) return null;
  let points: LatLng[] = decodePolyline(poly);
  const { home, radiusKm } = siteConfig.geo.privacy;
  if (home) points = trimAroundHome(points, [home.lat, home.lng], radiusKm);
  if (points.length < 2) return null;
  const line = encodePolyline(decimate(points, MAX_POINTS));
  const [lat, lng] = points[0];
  return {
    id: act.id,
    sport: act.sport,
    year,
    date: act.date,
    distance: act.distance,
    lat: Math.round(lat * 1e4) / 1e4,
    lng: Math.round(lng * 1e4) / 1e4,
    line,
  };
}

export async function fetchAthlete(): Promise<{ id: number; name: string; avatar?: string; createdAt: string }> {
  const a = await stravaGet<{ id: number; firstname: string; lastname: string; profile?: string; created_at: string }>(
    "/athlete",
  );
  return {
    id: a.id,
    name: `${a.firstname} ${a.lastname}`.trim(),
    avatar: a.profile?.startsWith("http") ? a.profile : undefined,
    createdAt: a.created_at,
  };
}

/** Busca todas as atividades de um ano (paginado) e normaliza. */
export async function fetchYear(year: number): Promise<{ activities: Activity[]; geo: GeoActivity[] }> {
  const after = Math.floor(Date.UTC(year, 0, 1) / 1000) - 86400; // folga p/ fuso
  const before = Math.floor(Date.UTC(year + 1, 0, 1) / 1000) + 86400;
  const includePrivate = process.env.STRAVA_INCLUDE_PRIVATE === "true";

  const activities: Activity[] = [];
  const geo: GeoActivity[] = [];
  for (let page = 1; page <= MAX_PAGES; page++) {
    const batch = await stravaGet<RawActivity[]>(
      `/athlete/activities?after=${after}&before=${before}&per_page=${PER_PAGE}&page=${page}`,
    );
    for (const raw of batch) {
      if (raw.private && !includePrivate) continue;
      const act = normalize(raw);
      if (!act || !act.date.startsWith(String(year))) continue;
      activities.push(act);
      const g = toGeo(raw, act, year);
      if (g) geo.push(g);
    }
    if (batch.length < PER_PAGE) break;
  }
  activities.sort((a, b) => (a.date < b.date ? 1 : -1)); // mais recentes primeiro
  return { activities, geo };
}
