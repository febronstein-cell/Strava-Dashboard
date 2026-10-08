import { ALL_SPORTS, siteConfig, TRI_SPORTS, type SportKey } from "@/site.config";
import type { Activity } from "./strava/types";

export { ALL_SPORTS, TRI_SPORTS };
/** Ano específico ou "all" (histórico inteiro). */
export type Period = number | "all";

const zero = (): Record<SportKey, number> => ({ run: 0, ride: 0, swim: 0, strength: 0 });
const dayMs = 86_400_000;
const parse = (iso: string) => new Date(iso.slice(0, 10) + "T00:00:00Z");
const isoDay = (d: Date) => d.toISOString().slice(0, 10);

export function inPeriod(acts: Activity[], period: Period): Activity[] {
  return period === "all" ? acts : acts.filter((a) => a.date.startsWith(String(period)));
}

/** Segunda-feira da semana de `d` (UTC). */
function weekStart(d: Date): Date {
  const dow = (d.getUTCDay() + 6) % 7; // seg = 0
  return new Date(d.getTime() - dow * dayMs);
}

// ---------------------------------------------------------------- totais

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
  /** segundos por modalidade */
  secs: Record<SportKey, number>;
  /** metros por modalidade */
  dist: Record<SportKey, number>;
}

const emptyPoint = (key: string): VolumePoint => ({ key, secs: zero(), dist: zero() });

function addTo(p: VolumePoint, a: Activity) {
  p.secs[a.sport] += a.movingTime;
  p.dist[a.sport] += a.distance;
}

/** Semanas (seg–dom) de um ano, até `today`. key = segunda-feira (AAAA-MM-DD). */
export function weeklyVolume(acts: Activity[], year: number, today: Date): VolumePoint[] {
  const first = weekStart(new Date(Date.UTC(year, 0, 1)));
  const lastDay = new Date(Math.min(Date.UTC(year, 11, 31), today.getTime()));
  const points = new Map<string, VolumePoint>();
  for (let w = first; w <= lastDay; w = new Date(w.getTime() + 7 * dayMs)) {
    points.set(isoDay(w), emptyPoint(isoDay(w)));
  }
  for (const a of acts) {
    const p = points.get(isoDay(weekStart(parse(a.date))));
    if (p) addTo(p, a);
  }
  return [...points.values()];
}

/** Meses de um ano (12) ou de todo o histórico até o mês atual. key = AAAA-MM. */
export function monthlyVolume(acts: Activity[], period: Period, firstYear: number, today: Date): VolumePoint[] {
  const keys: string[] = [];
  if (period === "all") {
    const last = `${today.getUTCFullYear()}-${String(today.getUTCMonth() + 1).padStart(2, "0")}`;
    for (let y = firstYear; y <= today.getUTCFullYear(); y++) {
      for (let m = 1; m <= 12; m++) {
        const k = `${y}-${String(m).padStart(2, "0")}`;
        if (k <= last) keys.push(k);
      }
    }
  } else {
    for (let m = 1; m <= 12; m++) keys.push(`${period}-${String(m).padStart(2, "0")}`);
  }
  const map = new Map(keys.map((k) => [k, emptyPoint(k)]));
  for (const a of acts) {
    const p = map.get(a.date.slice(0, 7));
    if (p) addTo(p, a);
  }
  return [...map.values()];
}

// --------------------------------------------------------------- heatmap

export interface HeatDay {
  date: string; // AAAA-MM-DD
  seconds: number;
  activities: Activity[];
  /** modalidade com mais tempo no dia */
  dominant: SportKey | null;
  future: boolean;
  /** coluna (semana) e linha (0 = segunda) */
  col: number;
  row: number;
}

/** Dias entre `startKey` e `endKey` (inclusive), dispostos em semanas. */
export function heatmapDays(acts: Activity[], startKey: string, endKey: string, todayKey: string): HeatDay[] {
  const byDay = new Map<string, Activity[]>();
  for (const a of acts) {
    const k = a.date.slice(0, 10);
    if (k < startKey || k > endKey) continue;
    const arr = byDay.get(k);
    if (arr) arr.push(a);
    else byDay.set(k, [a]);
  }

  const start = new Date(startKey + "T00:00:00Z");
  const end = new Date(endKey + "T00:00:00Z");
  const gridStart = weekStart(start);
  const days: HeatDay[] = [];

  for (let d = new Date(start); d <= end; d = new Date(d.getTime() + dayMs)) {
    const key = isoDay(d);
    const list = byDay.get(key) ?? [];
    const secs = zero();
    for (const a of list) secs[a.sport] += a.movingTime;
    const seconds = secs.run + secs.ride + secs.swim + secs.strength;
    const dominant =
      seconds > 0 ? ALL_SPORTS.reduce<SportKey>((best, s) => (secs[s] > secs[best] ? s : best), "run") : null;
    const offset = Math.round((d.getTime() - gridStart.getTime()) / dayMs);
    days.push({
      date: key,
      seconds,
      activities: list,
      dominant,
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
  const past = days.filter((d) => !d.future);
  for (const d of past) {
    if (d.seconds > 0) {
      activeDays++;
      run++;
      longest = Math.max(longest, run);
    } else run = 0;
  }
  // sequência atual: de trás pra frente, tolerando "hoje ainda sem treino"
  let current = 0;
  for (let i = past.length - 1; i >= 0; i--) {
    if (past[i].seconds > 0) current++;
    else if (i === past.length - 1) continue;
    else break;
  }
  return { longest, current, activeDays, totalDays: past.length, restDays: past.length - activeDays };
}

// ------------------------------------------------------ estatísticas extra

export interface YearTotals {
  year: number;
  dist: Record<SportKey, number>;
  secs: Record<SportKey, number>;
  count: number;
}

export function annualTotals(acts: Activity[], firstYear: number, lastYear: number): YearTotals[] {
  const list: YearTotals[] = [];
  for (let y = firstYear; y <= lastYear; y++) list.push({ year: y, dist: zero(), secs: zero(), count: 0 });
  for (const a of acts) {
    const t = list[Number(a.date.slice(0, 4)) - firstYear];
    if (!t) continue;
    t.dist[a.sport] += a.distance;
    t.secs[a.sport] += a.movingTime;
    t.count++;
  }
  return list;
}

/** Quantidade de atividades por hora do dia (0–23). */
export function hourHistogram(acts: Activity[]): number[] {
  const h = Array<number>(24).fill(0);
  for (const a of acts) h[Number(a.date.slice(11, 13))]++;
  return h;
}

/** Distância média (m) por dia da semana (seg…dom), por semana do período. */
export function weekdayAverages(acts: Activity[]): number[] {
  if (acts.length === 0) return Array<number>(7).fill(0);
  const sums = Array<number>(7).fill(0);
  let min = Infinity;
  let max = -Infinity;
  for (const a of acts) {
    const d = parse(a.date);
    sums[(d.getUTCDay() + 6) % 7] += a.distance;
    min = Math.min(min, d.getTime());
    max = Math.max(max, d.getTime());
  }
  const weeks = Math.max(1, Math.round((max - min) / (7 * dayMs)) + 1);
  return sums.map((s) => s / weeks);
}

// --------------------------------------------------------------- recordes

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

/** Maior valor entre os pontos (para "semana/mês mais pesado"). */
export function peak(points: VolumePoint[]): { point: VolumePoint; seconds: number } | null {
  let best: { point: VolumePoint; seconds: number } | null = null;
  for (const p of points) {
    const seconds = p.secs.run + p.secs.ride + p.secs.swim + p.secs.strength;
    if (!best || seconds > best.seconds) best = { point: p, seconds };
  }
  return best && best.seconds > 0 ? best : null;
}
