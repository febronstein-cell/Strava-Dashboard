import type { UpcomingRace } from "@/site.config";
import { SEED_RACES, triFormat, type SeasonRaceEntry } from "@/lib/season-plan";

const DAY = 86_400_000;

export interface RaceCountdown extends UpcomingRace {
  /** dias até a prova (0 = é hoje) */
  days: number;
}

/** A season race in the shape the countdown cards use. */
function toUpcoming(r: SeasonRaceEntry): UpcomingRace {
  return {
    name: r.name,
    location: r.location,
    date: r.date,
    cycleStart: r.cycleStart,
    format: triFormat(r.type),
    type: r.type,
    priority: r.priority,
    goal: r.goal,
    status: r.status,
    result: r.result,
    note: r.notes,
  };
}

/**
 * Provas que ainda não passaram, da mais próxima para a mais distante.
 * A hora fixa (07:00, fuso de Brasília) deixa o resultado igual no servidor e no navegador.
 */
export function upcoming(nowMs: number, races: SeasonRaceEntry[] = SEED_RACES): RaceCountdown[] {
  return races
    .filter((r) => r.status === "upcoming")
    .map((r) => ({ r: toUpcoming(r), target: new Date(`${r.date}T07:00:00-03:00`).getTime() }))
    .filter(({ target }) => !Number.isNaN(target) && target + DAY > nowMs)
    .sort((a, b) => a.target - b.target)
    .map(({ r, target }) => ({ ...r, days: Math.max(0, Math.ceil((target - nowMs) / DAY)) }));
}
