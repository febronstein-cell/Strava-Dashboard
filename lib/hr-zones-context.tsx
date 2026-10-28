"use client";

import { createContext, useContext, type ReactNode } from "react";

/** Per activity: seconds in each HR zone of site.config.ts, and seconds in 5-bpm bands as [first band, s, s, ...]. */
export type HrZoneMap = Record<number, { z: number[]; b: number[] }>;

const Ctx = createContext<HrZoneMap>({});

/** True time in heart-rate zones (from the streams) for the dashboard's heart-rate section. */
export function HrZonesProvider({ value, children }: { value: HrZoneMap; children: ReactNode }) {
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export const useHrZones = () => useContext(Ctx);
