import { cacheLife } from "next/cache";
import { clusterPlaces, haversineKm, type Place } from "@/lib/geo";
import { getAllData } from "./get-data";
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

/** Quantos lugares nomear (a política do Nominatim pede ~1 requisição/s). */
const NAMED_TOP = 6;
const NAMED_FAR = 10;

export async function getGeoSummary(): Promise<GeoSummary> {
  "use cache";
  cacheLife({ stale: 300, revalidate: 3600, expire: 86400 });

  const { overview, years } = await getAllData();
  const routes = years.flatMap((y) => y.geo).sort((a, b) => (a.date < b.date ? 1 : -1));
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
    const far = places
      .filter((p) => p.distanceKm > 50)
      .sort((a, b) => b.count - a.count)
      .slice(0, NAMED_FAR);
    const toName = [...new Set([...places.slice(0, NAMED_TOP), ...far])];
    for (const p of toName) {
      try {
        const g = await reverseGeocode(Math.round(p.lat * 10) / 10, Math.round(p.lng * 10) / 10);
        Object.assign(p, g);
      } catch {
        /* sem nome: a interface mostra as coordenadas */
      }
      await sleep(1100);
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
