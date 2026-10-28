"use client";

import { createContext, useContext, type ReactNode } from "react";
import { SEED_PHASES, SEED_RACES, type SeasonData } from "@/lib/season-plan";

const SeasonContext = createContext<SeasonData>({ races: SEED_RACES, phases: SEED_PHASES, source: "seed" });

/** Gives every component of the page the season read on the server (races with priorities, phases). */
export function SeasonProvider({ season, children }: { season: SeasonData; children: ReactNode }) {
  return <SeasonContext.Provider value={season}>{children}</SeasonContext.Provider>;
}

export const useSeason = () => useContext(SeasonContext);
