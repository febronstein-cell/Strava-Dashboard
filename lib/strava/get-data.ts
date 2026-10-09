import { cacheLife, cacheTag } from "next/cache";
import { siteConfig } from "@/site.config";
import { fetchAthlete, fetchYear, hasStravaCredentials } from "./client";
import { dbAthlete, dbBackfilled, dbRoutes, dbYear } from "./db";
import { generateDemoYear } from "./mock";
import { syncRecent } from "./sync";
import type { GeoActivity, StravaOverview, YearData } from "./types";

/**
 * Data sources of the page, all cached.
 *
 * Preferred path: the SUPABASE DATABASE (after scripts/strava-backfill.mjs has run). The page then
 * reads the stored history and the Strava API is only asked for what is new:
 *   - getOverview() asks for the latest activities at most every 10 minutes (1 request);
 *   - the Strava webhook saves each new activity right away (1 request).
 * Fallback path: no database (or not filled yet) -> downloads the history from Strava, year by year,
 * exactly as before. Without Strava credentials either, demo data.
 *
 * Tag "strava-live": the webhook invalidates it as soon as a new activity arrives.
 */

/** True when the database is configured AND already holds the full history. */
async function dbIsReady(): Promise<boolean> {
  return dbBackfilled();
}

export async function getOverview(): Promise<StravaOverview> {
  "use cache";
  cacheLife({ stale: 120, revalidate: 900, expire: 86400 });
  cacheTag("strava-live");

  const now = new Date();
  // current year in Brasília time (the server runs in UTC, which would flip the year 3 h early)
  const currentYear = Number(
    new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo", year: "numeric" }).format(now),
  );

  if (await dbIsReady()) {
    try {
      await syncRecent({ minIntervalMs: 10 * 60_000 }); // only what is new; a failure keeps the stored data
    } catch (e) {
      console.error("Incremental sync failed (the stored data is still served):", e);
    }
    const a = await dbAthlete();
    if (a) {
      return {
        athlete: { id: a.id, name: a.name, avatar: a.avatar },
        startYear: Math.min(siteConfig.startYear ?? a.createdYear, currentYear),
        currentYear,
        source: "strava",
        fetchedAt: now.toISOString(),
      };
    }
  }

  if (!hasStravaCredentials()) {
    return {
      athlete: { name: "Atleta Demo" },
      startYear: siteConfig.startYear ?? currentYear - 3,
      currentYear,
      source: "demo",
      fetchedAt: now.toISOString(),
    };
  }

  const athlete = await fetchAthlete();
  const created = new Date(athlete.createdAt).getFullYear();
  return {
    athlete: { id: athlete.id, name: athlete.name, avatar: athlete.avatar },
    startYear: Math.min(siteConfig.startYear ?? created, currentYear),
    currentYear,
    source: "strava",
    fetchedAt: now.toISOString(),
  };
}

/**
 * `use cache: remote`: keeps the result in a shared cache (on Vercel, across instances).
 * Without it, every refresh would redo the whole history, because Vercel servers are ephemeral.
 */
export async function getYearData(year: number, currentYear: number, demo: boolean): Promise<YearData> {
  "use cache: remote";
  if (year >= currentYear) {
    cacheLife({ stale: 120, revalidate: 900, expire: 86400 });
    cacheTag("strava-live");
  } else {
    cacheLife({ stale: 3600, revalidate: 86400, expire: 604800 });
  }

  if (demo) return { year, ...generateDemoYear(year, new Date()) };
  if (await dbIsReady()) return { year, activities: await dbYear(year), geo: [] };
  return { year, ...(await fetchYear(year)) };
}

/** Routes for the map and the weather: from the database, or (fallback) from the Strava download. */
export async function getRoutes(): Promise<GeoActivity[]> {
  "use cache: remote";
  cacheLife({ stale: 120, revalidate: 3600, expire: 86400 });
  cacheTag("strava-live");

  if (await dbIsReady()) return dbRoutes();
  const { years } = await getAllData();
  return years.flatMap((y) => y.geo);
}

/** Overview + every year (oldest -> newest). */
export async function getAllData() {
  const overview = await getOverview();
  const years: number[] = [];
  for (let y = overview.startYear; y <= overview.currentYear; y++) years.push(y);
  const data = await Promise.all(
    years.map((y) => getYearData(y, overview.currentYear, overview.source === "demo")),
  );
  return { overview, years: data };
}
