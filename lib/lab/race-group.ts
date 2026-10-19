import type { Activity } from "@/lib/strava/types";

/**
 * Groups the activities of a race day into one triathlon: swim, T1, bike, T2, run, in chronological order.
 * It picks the swim -> bike -> run chain whose distances best match the race format and whose gaps are short
 * (transitions), so a warm-up before the start, a cool-down after the finish or a workout on another
 * day never gets mixed in. A short activity sitting between two legs (a transition recorded as a workout)
 * is absorbed into that transition. Pure functions: they run in the browser and on the server.
 */

export type RaceFormat = "sprint" | "olympic" | "70.3" | "ironman";

export const FORMATS: Record<RaceFormat, { label: string; swimM: number; bikeKm: number; runKm: number }> = {
  sprint: { label: "Sprint", swimM: 750, bikeKm: 20, runKm: 5 },
  olympic: { label: "Olympic", swimM: 1500, bikeKm: 40, runKm: 10 },
  "70.3": { label: "Ironman 70.3", swimM: 1900, bikeKm: 90, runKm: 21.1 },
  ironman: { label: "Ironman", swimM: 3800, bikeKm: 180, runKm: 42.2 },
};

/** Longest pause between two legs that still counts as a transition, in minutes. */
const MAX_TRANSITION_MIN = 30;

export interface RaceLeg {
  sport: "swim" | "ride" | "run";
  id: number;
  name: string;
  startMs: number;
  endMs: number;
  /** seconds, start to finish (includes pauses): what the race clock counted */
  elapsed: number;
  moving: number;
  distanceM: number;
  elevation: number;
  hr?: number;
  hrMax?: number;
  watts?: number;
  np?: number;
  cadence?: number;
  /** marked as a race on Strava */
  race?: boolean;
}

export interface Transition {
  /** seconds between the end of one leg and the start of the next */
  seconds: number;
  /** short activities recorded inside this transition (e.g. "Treino matinal" of 3 minutes) */
  absorbed: { id: number; name: string; seconds: number }[];
}

export interface LeftOut {
  id: number;
  name: string;
  sport: string;
  startMs: number;
  distanceM: number;
  seconds: number;
  /** before the swim start, after the run finish, or somewhere else in the day */
  kind: "warm-up" | "after the race" | "other";
}

export interface RaceResult {
  format: RaceFormat;
  swim: RaceLeg | null;
  bike: RaceLeg | null;
  run: RaceLeg | null;
  t1: Transition | null;
  t2: Transition | null;
  startMs: number;
  endMs: number;
  /** wall-clock seconds from the swim start to the run finish: the race time */
  totalSeconds: number;
  complete: boolean;
  left: LeftOut[];
}

const ms = (iso: string) => Date.parse(iso + "Z");

function toLeg(a: Activity): RaceLeg {
  const start = ms(a.date);
  return {
    sport: a.sport as RaceLeg["sport"],
    id: a.id,
    name: a.name,
    startMs: start,
    endMs: start + a.elapsedTime * 1000,
    elapsed: a.elapsedTime,
    moving: a.movingTime,
    distanceM: a.distance,
    elevation: a.elevation,
    hr: a.hr,
    hrMax: a.hrMax,
    watts: a.watts,
    np: a.np,
    cadence: a.cad,
    race: a.race,
  };
}

/** How far a distance is from the format's, as a relative log error (0 = exact). */
const err = (d: number, ref: number) => Math.abs(Math.log(Math.max(d, 1) / ref));

/** Gap between two legs in minutes: negative means they overlap. */
const gapMin = (before: RaceLeg, after: RaceLeg) => (after.startMs - before.endMs) / 60000;

function transition(from: RaceLeg, to: RaceLeg, day: Activity[], used: Set<number>): Transition {
  const absorbed: Transition["absorbed"] = [];
  for (const a of day) {
    if (used.has(a.id)) continue;
    const s = ms(a.date);
    const e = s + a.elapsedTime * 1000;
    // a short activity that sits between the two legs (give or take two minutes) is part of the transition
    if (a.elapsedTime <= 20 * 60 && s >= from.endMs - 2 * 60000 && e <= to.startMs + 2 * 60000) {
      absorbed.push({ id: a.id, name: a.name, seconds: a.elapsedTime });
      used.add(a.id);
    }
  }
  return { seconds: Math.max(0, Math.round((to.startMs - from.endMs) / 1000)), absorbed };
}

/** The triathlon of `date` (YYYY-MM-DD) in `format`, or null when the day has no swim, bike or run to group. */
export function groupRace(all: Activity[], date: string, format: RaceFormat): RaceResult | null {
  const f = FORMATS[format];
  const day = all.filter((a) => a.date.slice(0, 10) === date).sort((a, b) => (a.date < b.date ? -1 : 1));

  const swims = day.filter((a) => a.sport === "swim" && a.distance >= f.swimM * 0.4).map(toLeg);
  const bikes = day.filter((a) => a.sport === "ride" && a.distance >= f.bikeKm * 1000 * 0.5).map(toLeg);
  const runs = day.filter((a) => a.sport === "run" && a.distance >= f.runKm * 1000 * 0.4).map(toLeg);
  if (swims.length + bikes.length + runs.length === 0) return null;

  const ok = (g: number) => g >= -10 && g <= MAX_TRANSITION_MIN;
  const score = (s: RaceLeg | null, b: RaceLeg | null, r: RaceLeg | null) =>
    (s ? err(s.distanceM, f.swimM) * 0.7 : 0.6) + (b ? err(b.distanceM, f.bikeKm * 1000) : 0.8) + (r ? err(r.distanceM, f.runKm * 1000) : 0.8);

  let best: { s: RaceLeg | null; b: RaceLeg | null; r: RaceLeg | null; score: number; legs: number } | null = null;
  const consider = (s: RaceLeg | null, b: RaceLeg | null, r: RaceLeg | null) => {
    const legs = [s, b, r].filter(Boolean).length;
    const cand = { s, b, r, score: score(s, b, r), legs };
    // more legs beat fewer; then the closest distances; then the earliest chain
    if (!best || legs > best.legs || (legs === best.legs && cand.score < best.score - 1e-9)) best = cand;
  };

  for (const s of swims) for (const b of bikes) for (const r of runs) if (ok(gapMin(s, b)) && b.startMs >= s.startMs && ok(gapMin(b, r)) && r.startMs >= b.startMs) consider(s, b, r);
  if (!best) {
    for (const s of swims) for (const b of bikes) if (ok(gapMin(s, b)) && b.startMs >= s.startMs) consider(s, b, null);
    for (const b of bikes) for (const r of runs) if (ok(gapMin(b, r)) && r.startMs >= b.startMs) consider(null, b, r);
  }
  if (!best) return null;
  const { s, b, r } = best as { s: RaceLeg | null; b: RaceLeg | null; r: RaceLeg | null };

  const used = new Set<number>([s?.id, b?.id, r?.id].filter((x): x is number => x != null));
  const t1 = s && b ? transition(s, b, day, used) : null;
  const t2 = b && r ? transition(b, r, day, used) : null;

  const startMs = (s ?? b ?? r)!.startMs;
  const endMs = (r ?? b ?? s)!.endMs;
  const left: LeftOut[] = day
    .filter((a) => !used.has(a.id))
    .map((a) => {
      const st = ms(a.date);
      return {
        id: a.id,
        name: a.name,
        sport: a.sport,
        startMs: st,
        distanceM: a.distance,
        seconds: a.elapsedTime,
        kind: (st + a.elapsedTime * 1000 <= startMs + 60000 ? "warm-up" : st >= endMs - 60000 ? "after the race" : "other") as LeftOut["kind"],
      };
    });

  return { format, swim: s, bike: b, run: r, t1, t2, startMs, endMs, totalSeconds: Math.round((endMs - startMs) / 1000), complete: !!(s && b && r), left };
}

// ============================================================ automatic recognition

/** Words that make a swim, bike or run read as part of a race. */
const RACE_WORDS = /ironman|70\.3|triathlon|triatlo|prova|race|troféu|trofeu|etapa|campeonato|copa|challenge|kona|\bleg\b/i;

/** Do the three legs match the format closely enough to be that race (race courses are measured)? */
export function fitsFormat(r: RaceResult, format: RaceFormat): boolean {
  if (!r.swim || !r.bike || !r.run) return false;
  const f = FORMATS[format];
  const sw = r.swim.distanceM / f.swimM;
  const bk = r.bike.distanceM / 1000 / f.bikeKm;
  const rn = r.run.distanceM / 1000 / f.runKm;
  return sw >= 0.75 && sw <= 1.35 && bk >= 0.85 && bk <= 1.2 && rn >= 0.85 && rn <= 1.2;
}

/** Closeness of the three legs to a format (lower is closer). */
function mismatch(r: RaceResult, format: RaceFormat): number {
  const f = FORMATS[format];
  return err(r.swim!.distanceM, f.swimM) * 0.7 + err(r.bike!.distanceM, f.bikeKm * 1000) + err(r.run!.distanceM, f.runKm * 1000);
}

export interface RaceDay {
  date: string;
  format: RaceFormat;
  result: RaceResult;
  /** a name read from the activities, when one of them looks like a race name */
  nameHint?: string;
}

/**
 * Finds the triathlons in the history by itself: a day with a swim, a bike and a run chained with short
 * transitions, with the distances of a standard format AND some evidence that it was a race (marked as a
 * race on Strava, or a leg named like one). A brick workout with race distances but no such sign is not listed.
 */
export function detectRaceDays(all: Activity[]): RaceDay[] {
  const bySport = new Map<string, Set<string>>();
  for (const a of all) {
    if (a.sport !== "swim" && a.sport !== "ride" && a.sport !== "run") continue;
    const d = a.date.slice(0, 10);
    bySport.set(d, (bySport.get(d) ?? new Set()).add(a.sport));
  }
  const out: RaceDay[] = [];
  for (const [date, sports] of bySport) {
    if (!(sports.has("swim") && sports.has("ride") && sports.has("run"))) continue;
    let best: { format: RaceFormat; result: RaceResult; m: number } | null = null;
    for (const format of Object.keys(FORMATS) as RaceFormat[]) {
      const result = groupRace(all, date, format);
      if (!result?.complete || !fitsFormat(result, format)) continue;
      const m = mismatch(result, format);
      if (!best || m < best.m) best = { format, result, m };
    }
    if (!best) continue;
    const legs = [best.result.swim!, best.result.bike!, best.result.run!];
    const flagged = legs.some((l) => l.race);
    const named = legs.find((l) => RACE_WORDS.test(l.name));
    if (!flagged && !named) continue;
    out.push({ date, format: best.format, result: best.result, nameHint: named?.name });
  }
  return out.sort((a, b) => (a.date < b.date ? 1 : -1));
}
