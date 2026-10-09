import { cacheLife, cacheTag } from "next/cache";
import type { SportKey } from "@/site.config";
import { bandOf, CONDITIONS, conditionOf, TEMP_BANDS } from "@/lib/weather";
import { getOverview, getRoutes } from "./get-data";
import type { GeoActivity } from "./types";

type BySport = Record<SportKey, number>;
const zero = (): BySport => ({ run: 0, ride: 0, swim: 0, strength: 0, other: 0 });

export interface WeatherSummary {
  /** contagem por faixa de temperatura (mesma ordem de TEMP_BANDS) */
  temp: BySport[];
  /** contagem por condição (mesma ordem de CONDITIONS) */
  cond: BySport[];
  /** atividades ao ar livre com clima encontrado */
  total: number;
  avgTemp: number | null;
}

const DAY = 86_400_000;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const dayIndex = (from: string, to: string) =>
  Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / DAY);

/**
 * Temperatura e código do tempo, hora a hora, de um local (Open-Meteo, sem chave).
 * O resultado fica em cache compartilhado; só é refeito quando surge uma atividade
 * nova naquele local (a data final muda).
 */
async function fetchHourly(lat: number, lng: number, start: string, end: string) {
  "use cache: remote";
  cacheLife("days");

  const url =
    `https://archive-api.open-meteo.com/v1/archive?latitude=${lat}&longitude=${lng}` +
    `&start_date=${start}&end_date=${end}&hourly=temperature_2m,weather_code&timezone=auto`;
  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) throw new Error(`Open-Meteo ${res.status}`);
  const j = (await res.json()) as { hourly?: { temperature_2m: (number | null)[]; weather_code: (number | null)[] } };
  if (!j.hourly) throw new Error("Open-Meteo sem dados");
  return { temp: j.hourly.temperature_2m, code: j.hourly.weather_code };
}

function tally(
  out: WeatherSummary,
  sums: { t: number; n: number },
  r: GeoActivity,
  temp: number | null | undefined,
  code: number | null | undefined,
) {
  if (temp == null || code == null) return;
  out.temp[bandOf(temp)][r.sport]++;
  out.cond[CONDITIONS.findIndex((c) => c.id === conditionOf(code))][r.sport]++;
  out.total++;
  sums.t += temp;
  sums.n++;
}

export async function getWeatherSummary(): Promise<WeatherSummary> {
  "use cache";
  cacheLife({ stale: 120, revalidate: 3600, expire: 86400 });
  cacheTag("strava-live");

  const overview = await getOverview();
  const out: WeatherSummary = {
    temp: TEMP_BANDS.map(zero),
    cond: CONDITIONS.map(zero),
    total: 0,
    avgTemp: null,
  };
  const sums = { t: 0, n: 0 };
  const routes = await getRoutes();

  if (overview.source === "demo") {
    // dados de demonstração: clima sintético, estável por atividade
    for (const r of routes) {
      const month = Number(r.date.slice(5, 7));
      const wobble = ((r.id * 9301 + 49297) % 233280) / 233280;
      const temp = 22 + 7 * Math.cos(((month - 1) / 12) * Math.PI * 2) + (wobble - 0.5) * 8;
      const codes = [0, 1, 2, 3, 3, 45, 51, 61, 80];
      tally(out, sums, r, temp, codes[Math.floor(wobble * codes.length) % codes.length]);
    }
  } else {
    // agrupa por região (~0,2°) e busca o clima de cada uma
    const groups = new Map<string, GeoActivity[]>();
    for (const r of routes) {
      const k = `${Math.round(r.lat / 0.2)}:${Math.round(r.lng / 0.2)}`;
      (groups.get(k) ?? groups.set(k, []).get(k)!).push(r);
    }
    // o arquivo histórico tem ~5 dias de atraso
    const limit = new Date(Date.now() - 6 * DAY).toISOString().slice(0, 10);

    for (const list of groups.values()) {
      const dates = list.map((r) => r.date.slice(0, 10)).sort();
      const start = dates[0];
      const end = dates.filter((d) => d <= limit).at(-1);
      if (!end) continue;
      const lat = Math.round((list.reduce((s, r) => s + r.lat, 0) / list.length) * 10) / 10;
      const lng = Math.round((list.reduce((s, r) => s + r.lng, 0) / list.length) * 10) / 10;
      try {
        const h = await fetchHourly(lat, lng, start, end);
        for (const r of list) {
          const d = r.date.slice(0, 10);
          if (d > end) continue;
          const i = dayIndex(start, d) * 24 + Number(r.date.slice(11, 13));
          tally(out, sums, r, h.temp[i], h.code[i]);
        }
      } catch {
        /* região sem clima: segue com as outras */
      }
      await sleep(120);
    }
  }

  out.avgTemp = sums.n ? Math.round((sums.t / sums.n) * 10) / 10 : null;
  return out;
}
