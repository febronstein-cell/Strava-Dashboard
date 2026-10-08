import { cacheLife, cacheTag } from "next/cache";
import { siteConfig } from "@/site.config";
import { fetchAthlete, fetchYear, hasStravaCredentials } from "./client";
import { generateDemoYear } from "./mock";
import type { StravaOverview, YearData } from "./types";

/**
 * Fontes de dados da página, todas cacheadas:
 *  - visão geral (nome, 1º ano): 15 min
 *  - cada ano: ano corrente 15 min; anos passados 1 dia (quase nunca mudam)
 *
 * Tag "strava-live": o webhook do Strava (app/api/strava/webhook) a invalida assim que
 * você salva uma atividade, então o site atualiza em segundos, sem esperar o intervalo.
 * Assim o Strava recebe poucas requisições (limite: 100 / 15 min e 1000 / dia),
 * mesmo com o histórico completo. Sem credenciais, devolve dados de demonstração.
 */

export async function getOverview(): Promise<StravaOverview> {
  "use cache";
  cacheLife({ stale: 120, revalidate: 900, expire: 86400 });
  cacheTag("strava-live");

  const now = new Date();
  // current year in Brasília time (the server runs in UTC, which would flip the year 3 h early)
  const currentYear = Number(
    new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo", year: "numeric" }).format(now),
  );

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
 * `use cache: remote`: guarda o resultado num cache compartilhado (na Vercel, entre
 * instâncias). Sem isso, cada atualização horária refaria o histórico inteiro,
 * porque os servidores da Vercel são efêmeros.
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
  return { year, ...(await fetchYear(year)) };
}

/** Visão geral + todos os anos (mais antigo → mais recente). */
export async function getAllData() {
  const overview = await getOverview();
  const years: number[] = [];
  for (let y = overview.startYear; y <= overview.currentYear; y++) years.push(y);
  const data = await Promise.all(
    years.map((y) => getYearData(y, overview.currentYear, overview.source === "demo")),
  );
  return { overview, years: data };
}
