import { cacheLife, cacheTag } from "next/cache";
import { clusterPlaces, haversineKm, type Place } from "@/lib/geo";
import { getOverview, getRoutes } from "./get-data";
import { reverseGeocode } from "./geocode";
import { DEMO_PLACES } from "./mock";
import type { GeoActivity } from "./types";

export interface GeoSummary {
  routes: GeoActivity[];
  /** todos os lugares, do mais frequente ao menos (os de cima têm nome) */
  places: (Place & { distanceKm: number })[];
  facts: {
    uniqueLocations: number;
    countries: number;
    furthestKm: number;
    mappedActivities: number;
  };
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** How many places get a name (Nominatim asks for ~1 request/s; names are cached, so only new places cost time). */
const MAX_NAMED = 60;

export async function getGeoSummary(): Promise<GeoSummary> {
  "use cache";
  cacheLife({ stale: 120, revalidate: 900, expire: 86400 });
  cacheTag("strava-live");

  const overview = await getOverview();
  const routes = [...(await getRoutes())].sort((a, b) => (a.date < b.date ? 1 : -1));
  const clusters = clusterPlaces(routes);
  const home = clusters[0];

  const places = clusters.map((c) => ({
    ...c,
    distanceKm: home ? haversineKm([home.lat, home.lng], [c.lat, c.lng]) : 0,
  }));

  if (overview.source === "demo") {
    for (const p of places) {
      const near = DEMO_PLACES.find((d) => haversineKm([d.lat, d.lng], [p.lat, p.lng]) < 120);
      if (near) Object.assign(p, { name: near.name, country: near.country, countryCode: near.countryCode });
    }
  } else {
    for (const p of places.slice(0, MAX_NAMED)) {
      const started = Date.now();
      for (let attempt = 0; attempt < 2 && !p.name; attempt++) {
        try {
          Object.assign(p, await reverseGeocode(Math.round(p.lat * 100) / 100, Math.round(p.lng * 100) / 100));
        } catch {
          await sleep(1500); // unnamed places show their coordinates
        }
      }
      // a cached name returns instantly; only real requests need the pause
      if (Date.now() - started > 300) await sleep(1100);
    }
  }

  // junta células vizinhas que viraram o mesmo lugar (ex.: duas células de São Paulo)
  const merged: typeof places = [];
  const byName = new Map<string, (typeof places)[number]>();
  for (const p of places) {
    const key = p.name ? `${p.name}|${p.countryCode ?? ""}` : null;
    const prev = key ? byName.get(key) : undefined;
    if (!prev) {
      merged.push(p);
      if (key) byName.set(key, p);
      continue;
    }
    const n = prev.count + p.count;
    prev.lat = (prev.lat * prev.count + p.lat * p.count) / n;
    prev.lng = (prev.lng * prev.count + p.lng * p.count) / n;
    prev.count = n;
    if (p.firstDate < prev.firstDate) prev.firstDate = p.firstDate;
    if (p.lastDate > prev.lastDate) prev.lastDate = p.lastDate;
  }
  merged.sort((a, b) => b.count - a.count);
  places.length = 0;
  places.push(...merged);

  const countries = new Set(places.map((p) => p.countryCode).filter(Boolean));
  return {
    routes,
    places,
    facts: {
      uniqueLocations: places.length,
      countries: countries.size,
      furthestKm: Math.round(Math.max(0, ...places.map((p) => p.distanceKm))),
      mappedActivities: routes.length,
    },
  };
}
