import { cacheLife } from "next/cache";
import { siteConfig } from "@/site.config";
import { fetchAthlete, fetchYearActivities, hasStravaCredentials } from "./client";
import { generateDemoActivities } from "./mock";
import type { StravaData } from "./types";

/**
 * Fonte única de dados da página.
 *
 * Cacheada por 1 hora (revalidate: 3600): o Next serve o resultado em cache e
 * atualiza em segundo plano, então o Strava recebe poucas requisições
 * (limite: 100 / 15 min e 1000 / dia). Sem credenciais no ambiente, devolve
 * dados de demonstração para o site funcionar já no primeiro `npm run dev`.
 */
export async function getStravaData(): Promise<StravaData> {
  "use cache";
  cacheLife({ stale: 300, revalidate: 3600, expire: 86400 });

  const now = new Date();
  const year = siteConfig.year ?? now.getFullYear();

  if (!hasStravaCredentials()) {
    return {
      athlete: { name: "Atleta Demo" },
      activities: generateDemoActivities(year, now),
      year,
      source: "demo",
      fetchedAt: now.toISOString(),
    };
  }

  const athlete = await fetchAthlete();
  const activities = await fetchYearActivities(athlete.token, year);
  return {
    athlete: { name: athlete.name, avatar: athlete.avatar },
    activities,
    year,
    source: "strava",
    fetchedAt: now.toISOString(),
  };
}
