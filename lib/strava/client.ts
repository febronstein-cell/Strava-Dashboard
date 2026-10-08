import "server-only";
import type { SportKey } from "@/site.config";
import type { Activity, RawActivity } from "./types";

const API = "https://www.strava.com/api/v3";
const TOKEN_URL = "https://www.strava.com/oauth/token";
const PER_PAGE = 200;
const MAX_PAGES = 15; // 3000 atividades no ano: mais que suficiente

export function hasStravaCredentials() {
  return Boolean(
    process.env.STRAVA_CLIENT_ID &&
      process.env.STRAVA_CLIENT_SECRET &&
      process.env.STRAVA_REFRESH_TOKEN,
  );
}

/**
 * O Strava pode devolver um refresh token novo a cada troca. Guardamos o mais
 * recente em memória para a mesma instância do servidor. O valor do .env
 * continua valendo como ponto de partida (na prática o Strava mantém o token
 * original válido; veja o README).
 */
let latestRefreshToken: string | undefined;

async function getAccessToken(): Promise<string> {
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
  const json = (await res.json()) as { access_token: string; refresh_token?: string };
  if (json.refresh_token) latestRefreshToken = json.refresh_token;
  return json.access_token;
}

async function stravaGet<T>(path: string, token: string): Promise<T> {
  const res = await fetch(`${API}${path}`, {
    headers: { Authorization: `Bearer ${token}` },
    cache: "no-store",
  });
  if (res.status === 429) {
    throw new Error("Strava: limite de requisições atingido (429). Tente novamente mais tarde.");
  }
  if (!res.ok) {
    throw new Error(`Strava: erro ${res.status} em ${path}`);
  }
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
};

function normalize(raw: RawActivity): Activity | null {
  const sport = SPORT_MAP[raw.sport_type] ?? SPORT_MAP[raw.type];
  if (!sport) return null; // musculação, yoga etc. ficam de fora
  return {
    id: raw.id,
    name: raw.name,
    sport,
    date: raw.start_date_local.replace("Z", ""),
    distance: raw.distance,
    movingTime: raw.moving_time,
    elevation: raw.total_elevation_gain,
  };
}

export async function fetchAthlete(): Promise<{ name: string; avatar?: string; token: string }> {
  const token = await getAccessToken();
  const athlete = await stravaGet<{ firstname: string; lastname: string; profile?: string }>(
    "/athlete",
    token,
  );
  const avatar = athlete.profile?.startsWith("http") ? athlete.profile : undefined;
  return { name: `${athlete.firstname} ${athlete.lastname}`.trim(), avatar, token };
}

/** Busca todas as atividades do ano (paginado) e normaliza. */
export async function fetchYearActivities(token: string, year: number): Promise<Activity[]> {
  const after = Math.floor(Date.UTC(year, 0, 1) / 1000) - 86400; // folga p/ fuso
  const before = Math.floor(Date.UTC(year + 1, 0, 1) / 1000) + 86400;
  const includePrivate = process.env.STRAVA_INCLUDE_PRIVATE === "true";

  const all: Activity[] = [];
  for (let page = 1; page <= MAX_PAGES; page++) {
    const batch = await stravaGet<RawActivity[]>(
      `/athlete/activities?after=${after}&before=${before}&per_page=${PER_PAGE}&page=${page}`,
      token,
    );
    for (const raw of batch) {
      if (raw.private && !includePrivate) continue;
      const act = normalize(raw);
      if (act && act.date.startsWith(String(year))) all.push(act);
    }
    if (batch.length < PER_PAGE) break;
  }
  return all.sort((a, b) => (a.date < b.date ? 1 : -1)); // mais recentes primeiro
}
