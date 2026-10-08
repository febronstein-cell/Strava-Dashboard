import { siteConfig, type SportKey } from "@/site.config";
import type { Activity } from "./strava/types";

export const SPORTS: SportKey[] = ["run", "ride", "swim"];

export interface Totals {
  distance: number;
  movingTime: number;
  elevation: number;
  count: number;
}

export function totals(acts: Activity[]): Totals {
  return acts.reduce<Totals>(
    (t, a) => ({
      distance: t.distance + a.distance,
      movingTime: t.movingTime + a.movingTime,
      elevation: t.elevation + a.elevation,
      count: t.count + 1,
    }),
    { distance: 0, movingTime: 0, elevation: 0, count: 0 },
  );
}

export interface SportStats extends Totals {
  sport: SportKey;
  /** m/s médio ponderado (distância total / tempo total) */
  avgSpeed: number;
  longest: Activity | null;
}

export function sportStats(acts: Activity[], sport: SportKey): SportStats {
  const mine = acts.filter((a) => a.sport === sport);
  const t = totals(mine);
  const longest = mine.reduce<Activity | null>((best, a) => (!best || a.distance > best.distance ? a : best), null);
  return { sport, ...t, avgSpeed: t.movingTime ? t.distance / t.movingTime : 0, longest };
}

// ---------------------------------------------------------------- volume

export interface VolumePoint {
  key: string;
  label: string;
  /** segundos por modalidade */
  run: number;
  ride: number;
  swim: number;
  /** distância (m) por modalidade, para o tooltip */
  dist: Record<SportKey, number>;
}

const dayMs = 86_400_000;
const parse = (iso: string) => new Date(iso.slice(0, 10) + "T00:00:00Z");
const isoDay = (d: Date) => d.toISOString().slice(0, 10);

/** Segunda-feira da semana de `d` (UTC). */
function weekStart(d: Date): Date {
  const dow = (d.getUTCDay() + 6) % 7; // seg=0
  return new Date(d.getTime() - dow * dayMs);
}

function emptyPoint(key: string, label: string): VolumePoint {
  return { key, label, run: 0, ride: 0, swim: 0, dist: { run: 0, ride: 0, swim: 0 } };
}

export function weeklyVolume(acts: Activity[], year: number, today: Date): VolumePoint[] {
  const first = weekStart(new Date(Date.UTC(year, 0, 1)));
  const lastDay = new Date(Math.min(Date.UTC(year, 11, 31), today.getTime()));
  const points = new Map<string, VolumePoint>();
  for (let w = first; w <= lastDay; w = new Date(w.getTime() + 7 * dayMs)) {
    const key = isoDay(w);
    points.set(key, emptyPoint(key, key));
  }
  for (const a of acts) {
    const p = points.get(isoDay(weekStart(parse(a.date))));
    if (!p) continue;
    p[a.sport] += a.movingTime;
    p.dist[a.sport] += a.distance;
  }
  return [...points.values()];
}

export function monthlyVolume(acts: Activity[], year: number): VolumePoint[] {
  const points = Array.from({ length: 12 }, (_, m) => {
    const key = `${year}-${String(m + 1).padStart(2, "0")}`;
    return emptyPoint(key, key);
  });
  for (const a of acts) {
    const p = points[Number(a.date.slice(5, 7)) - 1];
    if (!p) continue;
    p[a.sport] += a.movingTime;
    p.dist[a.sport] += a.distance;
  }
  return points;
}

// --------------------------------------------------------------- heatmap

export interface HeatDay {
  date: string; // YYYY-MM-DD
  seconds: number;
  count: number;
  /** modalidade com mais tempo no dia */
  dominant: SportKey | null;
  future: boolean;
  /** coluna (semana) e linha (0 = segunda) */
  col: number;
  row: number;
}

export function heatmapDays(acts: Activity[], year: number, today: Date): HeatDay[] {
  const bySport = new Map<string, Record<SportKey, number>>();
  const counts = new Map<string, number>();
  for (const a of acts) {
    const k = a.date.slice(0, 10);
    const rec = bySport.get(k) ?? { run: 0, ride: 0, swim: 0 };
    rec[a.sport] += a.movingTime;
    bySport.set(k, rec);
    counts.set(k, (counts.get(k) ?? 0) + 1);
  }

  const jan1 = new Date(Date.UTC(year, 0, 1));
  const dec31 = new Date(Date.UTC(year, 11, 31));
  const gridStart = weekStart(jan1);
  const todayKey = isoDay(today);
  const days: HeatDay[] = [];

  for (let d = new Date(jan1); d <= dec31; d = new Date(d.getTime() + dayMs)) {
    const key = isoDay(d);
    const rec = bySport.get(key);
    const seconds = rec ? rec.run + rec.ride + rec.swim : 0;
    const dominant = rec ? (SPORTS.reduce((best, s) => (rec[s] > rec[best] ? s : best), "run" as SportKey)) : null;
    const offset = Math.round((d.getTime() - gridStart.getTime()) / dayMs);
    days.push({
      date: key,
      seconds,
      count: counts.get(key) ?? 0,
      dominant: seconds > 0 ? dominant : null,
      future: key > todayKey,
      col: Math.floor(offset / 7),
      row: offset % 7,
    });
  }
  return days;
}

export function streaks(days: HeatDay[]) {
  let longest = 0;
  let run = 0;
  let activeDays = 0;
  for (const d of days) {
    if (d.future) break;
    if (d.seconds > 0) {
      activeDays++;
      run++;
      longest = Math.max(longest, run);
    } else run = 0;
  }
  // sequência atual: conta de trás pra frente, tolerando "hoje ainda sem treino"
  const past = days.filter((d) => !d.future);
  let current = 0;
  for (let i = past.length - 1; i >= 0; i--) {
    if (past[i].seconds > 0) current++;
    else if (i === past.length - 1) continue;
    else break;
  }
  return { longest, current, activeDays, totalDays: past.length };
}

// --------------------------------------------------------------- records

/** Recordes são montados em `components/sections/Records.tsx` com os formatadores. */
export function bestPace(acts: Activity[], sport: SportKey): Activity | null {
  const min = siteConfig.rules.minDistanceForBestPace[sport];
  return acts
    .filter((a) => a.sport === sport && a.distance >= min && a.movingTime > 0)
    .reduce<Activity | null>(
      (best, a) => (!best || a.distance / a.movingTime > best.distance / best.movingTime ? a : best),
      null,
    );
}

export function maxBy(acts: Activity[], pick: (a: Activity) => number, sport?: SportKey): Activity | null {
  return acts
    .filter((a) => !sport || a.sport === sport)
    .reduce<Activity | null>((best, a) => (!best || pick(a) > pick(best) ? a : best), null);
}
