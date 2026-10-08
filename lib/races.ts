import { siteConfig, type UpcomingRace } from "@/site.config";

const DAY = 86_400_000;

export interface RaceCountdown extends UpcomingRace {
  /** dias até a prova (0 = é hoje) */
  days: number;
}

/**
 * Provas que ainda não passaram, da mais próxima para a mais distante.
 * A hora fixa (07:00, fuso de Brasília) deixa o resultado igual no servidor e no navegador.
 */
export function upcoming(nowMs: number): RaceCountdown[] {
  return siteConfig.upcomingRaces
    .map((r) => ({ r, target: new Date(`${r.date}T07:00:00-03:00`).getTime() }))
    .filter(({ target }) => !Number.isNaN(target) && target + DAY > nowMs)
    .sort((a, b) => a.target - b.target)
    .map(({ r, target }) => ({ ...r, days: Math.max(0, Math.ceil((target - nowMs) / DAY)) }));
}
