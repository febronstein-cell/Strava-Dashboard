import "server-only";
import { cacheLife, cacheTag } from "next/cache";
import { siteConfig } from "@/site.config";
import type { Profile } from "@/lib/lab/profile";
import { readStreams, type StoredStreams } from "@/lib/streams-cache";
import type { Durability } from "@/lib/durability";
import { bucket, paceZones, powerZones, threeZone, type ThreeZoneLimits } from "@/lib/zones";

/** All stored stream summaries, cached with the rest of the Strava data (refreshed when new ones arrive). */
export async function getStreams(): Promise<Record<number, StoredStreams>> {
  "use cache";
  cacheLife({ stale: 120, revalidate: 900, expire: 86400 });
  cacheTag("strava-live");
  return readStreams();
}

export const HR_MAXES = siteConfig.heartRate.zones.map((z) => z.max);

/** Time in zone of one activity, in seconds, with the current thresholds. */
export interface ActivityZones {
  hr?: number[];
  power?: number[];
  pace?: number[];
  /** 3-zone model: below LT1, between, at or above LT2 */
  three?: [number, number, number];
  /** which signal the 3 zones came from */
  basis?: "power" | "hr";
  durability?: Durability;
}

export interface ZoneMeta {
  hrMaxes: number[];
  ftp: number | null;
  thresholdPace: number | null;
  three: ThreeZoneLimits;
}

export function threeLimits(p: Profile): ThreeZoneLimits {
  const ftp = p.ftp?.value;
  return {
    lt1Hr: p.lt1_hr?.value ?? HR_MAXES[1],
    lt2Hr: p.lthr?.value ?? HR_MAXES[3],
    lt1W: p.lt1_power?.value ?? (ftp ? Math.round(ftp * 0.75) : undefined),
    lt2W: p.lt2_power?.value ?? ftp,
  };
}

/** Zones of every stored activity with the profile's thresholds (the Lab). */
export function labZones(streams: Record<number, StoredStreams>, p: Profile): { byId: Record<number, ActivityZones>; meta: ZoneMeta } {
  const limits = threeLimits(p);
  const ftp = p.ftp?.value ?? null;
  const tp = p.run_threshold_pace?.value ?? null;
  const byId: Record<number, ActivityZones> = {};
  for (const [id, s] of Object.entries(streams)) {
    const z: ActivityZones = {};
    if (s.summary.hr) z.hr = bucket(s.summary.hr, HR_MAXES).map(Math.round);
    if (s.summary.power && ftp && s.sport === "ride") z.power = powerZones(s.summary.power, ftp).map(Math.round);
    if (s.summary.pace && tp && s.sport === "run") z.pace = paceZones(s.summary.pace, tp).map(Math.round);
    const three = threeZone(s.summary, s.sport, limits);
    if (three) {
      z.three = three.map(Math.round) as [number, number, number];
      z.basis = s.sport === "ride" && s.summary.power && limits.lt1W ? "power" : "hr";
    }
    if (s.summary.durability) z.durability = s.summary.durability;
    byId[Number(id)] = z;
  }
  return { byId, meta: { hrMaxes: HR_MAXES, ftp, thresholdPace: tp, three: limits } };
}

/**
 * What the public dashboard's heart-rate section needs, kept small: per activity the seconds in each HR zone of
 * site.config.ts and the seconds in 5-bpm bands as [first band start, s, s, ...].
 */
export function dashboardZones(streams: Record<number, StoredStreams>): Record<number, { z: number[]; b: number[] }> {
  const out: Record<number, { z: number[]; b: number[] }> = {};
  for (const [id, s] of Object.entries(streams)) {
    const hist = s.summary.hr;
    if (!hist) continue;
    const bins = new Map<number, number>();
    for (const [k, sec] of Object.entries(hist)) {
      const b = Math.floor(Number(k) / 5) * 5;
      bins.set(b, (bins.get(b) ?? 0) + sec);
    }
    const keys = [...bins.keys()].sort((a, b) => a - b);
    const first = keys[0];
    const row = [first];
    for (let b = first; b <= keys[keys.length - 1]; b += 5) row.push(Math.round(bins.get(b) ?? 0));
    out[Number(id)] = { z: bucket(hist, HR_MAXES).map(Math.round), b: row };
  }
  return out;
}
