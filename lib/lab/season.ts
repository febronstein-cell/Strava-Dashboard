import { mondayOf } from "./progress";
import type { RaceFormat } from "./race-group";

/**
 * The season: every week from the current one to a year ahead, built from the race calendar. Each race is a
 * goal with its own cycle (build-up, taper, race week, recovery), the weeks between cycles are base blocks, and
 * the hours progress from what was really trained lately. Pure: the planner shows it and the AI week analysis
 * reads it, so both talk about the same place in the cycle.
 */

const DAY = 86_400_000;
const addDays = (key: string, n: number) => new Date(Date.parse(key + "T00:00:00Z") + n * DAY).toISOString().slice(0, 10);
const weeksBetween = (a: string, b: string) => Math.round((Date.parse(b) - Date.parse(a)) / (7 * DAY));

export type SeasonPhase = "base" | "build" | "peak" | "taper" | "race" | "recovery";
export type SeasonKind = "load" | "deload" | "taper" | "race" | "recovery";

export interface SeasonRace {
  name: string;
  /** YYYY-MM-DD */
  date: string;
  format?: RaceFormat;
  /** A = the goal of the season (full cycle), B/C = secondary races (shorter cycle) */
  priority: "A" | "B" | "C";
  /** optional hand-fixed start of the cycle (a Monday, or any day of that week) */
  cycleStart?: string;
}

export interface SeasonWeek {
  /** Monday, YYYY-MM-DD */
  start: string;
  phase: SeasonPhase;
  kind: SeasonKind;
  /** suggested hours for the week (elapsed time) */
  target: number;
  /** the race this week builds towards or recovers from; null in a base block with no race ahead */
  race: SeasonRace | null;
  /** position inside the cycle of that race, when the week belongs to one */
  cycle: { length: number; week: number; weeksToRace: number } | null;
  /** true when the race itself is in this week */
  raceWeek: boolean;
  /** race-specific things the week should contain, in English (translated by the page) */
  focus: string[];
}

/** Length of a full cycle (weeks, including the race week), taper weeks and recovery weeks after the race. */
const SHAPE: Record<RaceFormat | "other", { cycle: number; taper: number; recovery: number }> = {
  sprint: { cycle: 6, taper: 1, recovery: 1 },
  olympic: { cycle: 8, taper: 1, recovery: 1 },
  "70.3": { cycle: 12, taper: 2, recovery: 2 },
  ironman: { cycle: 16, taper: 3, recovery: 3 },
  other: { cycle: 8, taper: 1, recovery: 1 },
};
/** Share of the peak week for the weeks before the race week, in order, and for the race week. */
const TAPER_FACTOR: Record<number, number[]> = { 1: [0.7], 2: [0.75, 0.55], 3: [0.8, 0.6, 0.45] };
const RACE_WEEK_FACTOR = 0.4;

export function defaultPriority(format?: RaceFormat): "A" | "B" {
  return format === "70.3" || format === "ironman" ? "A" : "B";
}

/** Race-specific suggestions for a phase, by race format. */
function focusFor(phase: SeasonPhase, kind: SeasonKind, format?: RaceFormat): string[] {
  const long = format === "70.3" || format === "ironman";
  if (kind === "deload") return ["Recovery week: about 30% less volume", "Keep one moderate session so the legs stay awake", "Sleep and food are part of the training"];
  switch (phase) {
    case "base":
      return ["Aerobic volume, mostly easy (zone 2)", "Technique: swim drills, run strides, pedalling cadence", "Strength training twice a week", "One long session per sport, kept easy"];
    case "build":
      return long
        ? ["Long ride (2.5 to 3.5 h) with race-pace blocks", "Brick: bike followed by a 20 to 40 minute run", "Long run of 90 to 110 minutes plus one threshold session", "Continuous swim of 2 to 3 km or threshold sets"]
        : ["Threshold and VO2 sessions (bike 3x12', run 5x1 km)", "Short brick: 40 to 60 minute bike and a 15 minute run", "Open-water practice with sighting and drafting", "Keep the easy days truly easy"];
    case "peak":
      return long
        ? ["Race-simulation brick: 90 minutes at race power and a 40 minute run", "Practice nutrition and the transitions at race pace", "Highest volume of the cycle, then stop adding"]
        : ["Race-pace efforts: bike 3x10' at race power, run 3x2 km", "Practice transitions and the swim start", "Highest intensity of the cycle, volume held"];
    case "taper":
      return ["Cut volume by a quarter to a half, keep short intensity", "Race-pace touches such as 3 to 4 x 2 minutes", "Sleep, food and logistics: gear, route, transitions"];
    case "race":
      return ["Short shakeout in each sport (20 to 30 minutes)", "Pre-race routine: gear check, meals, early nights", "Race day"];
    case "recovery":
      return ["Easy movement only: swim, spin, walk", "No intensity until the body feels fresh", "Review the race and set the next goal"];
  }
}

/**
 * Builds the season from `todayKey` to `horizon` weeks ahead.
 * `recentHours` is the average of the last finished weeks (the starting level of the progression).
 */
export function buildSeason(races: SeasonRace[], todayKey: string, recentHours: number, horizon = 52): SeasonWeek[] {
  const current = mondayOf(todayKey);
  const last = addDays(current, 7 * (horizon - 1));
  const upcoming = races
    .filter((r) => mondayOf(r.date) >= current && mondayOf(r.date) <= last)
    .sort((a, b) => (a.date < b.date ? -1 : 1));

  const weeks: SeasonWeek[] = Array.from({ length: horizon }, (_, i) => ({
    start: addDays(current, 7 * i),
    phase: "base",
    kind: "load",
    target: 0,
    race: null,
    cycle: null,
    raceWeek: false,
    focus: [],
  }));
  const idx = (date: string) => weeksBetween(current, mondayOf(date));

  // ---- phases around each race (the earlier race claims its recovery weeks first)
  let level = Math.max(4, recentHours);
  let claimed = -1; // last week index already assigned
  for (const race of upcoming) {
    const shape = SHAPE[race.format ?? "other"];
    const ri = idx(race.date);
    const fullLen = race.priority === "A" ? shape.cycle : Math.min(shape.cycle, 6);
    let start = race.cycleStart ? Math.max(0, idx(race.cycleStart)) : ri - (fullLen - 1);
    start = Math.max(start, claimed + 1, 0);
    const length = ri - start + 1;
    const taper = Math.min(shape.taper, Math.max(0, length - 1));
    const loadWeeks = Math.max(0, length - 1 - taper);

    // progression of this cycle: it starts from the level reached so far and rises towards a peak
    const startLevel = Math.max(level, recentHours);
    const peak = Math.min(startLevel * 1.25, startLevel + 5);
    const isDeload = (i: number) => (i + 1) % 4 === 0 && i !== loadWeeks - 1 && loadWeeks > 3;
    const loadCount = Array.from({ length: loadWeeks }, (_, i) => i).filter((i) => !isDeload(i)).length;
    let k = 0;
    let lastLoad = startLevel;
    for (let i = 0; i < length; i++) {
      const w = weeks[start + i];
      if (!w) continue;
      w.race = race;
      w.cycle = { length, week: i + 1, weeksToRace: ri - (start + i) };
      if (i < loadWeeks) {
        w.phase = i < loadWeeks * 0.4 ? "base" : i < loadWeeks * 0.8 ? "build" : "peak";
        if (isDeload(i)) {
          w.kind = "deload";
          w.target = lastLoad * 0.7;
        } else {
          lastLoad = startLevel + (peak - startLevel) * (loadCount > 1 ? k / (loadCount - 1) : 1);
          w.kind = "load";
          w.target = lastLoad;
          k++;
        }
      } else if (i < loadWeeks + taper) {
        w.phase = "taper";
        w.kind = "taper";
        w.target = peak * (TAPER_FACTOR[taper]?.[i - loadWeeks] ?? 0.6);
      } else {
        w.phase = "race";
        w.kind = "race";
        w.raceWeek = true;
        w.target = peak * RACE_WEEK_FACTOR;
      }
    }

    // recovery after the race
    const recovery = race.priority === "A" ? shape.recovery : 1;
    for (let j = 1; j <= recovery; j++) {
      const w = weeks[ri + j];
      if (!w) break;
      w.phase = "recovery";
      w.kind = "recovery";
      w.race = race;
      w.target = peak * (j === 1 ? 0.45 : 0.7);
      w.cycle = { length, week: length + j, weeksToRace: -j };
    }
    claimed = ri + recovery;
    level = peak * 0.9; // the next cycle starts a little below this peak
  }

  // ---- weeks that belong to no cycle: base blocks (3 load weeks : 1 lighter), growing gently
  let run = 0;
  let baseLevel = Math.max(4, recentHours);
  for (const w of weeks) {
    if (w.race) {
      run = 0;
      baseLevel = Math.max(baseLevel, w.target * 0.85);
      continue;
    }
    run++;
    if (run % 4 === 0) {
      w.kind = "deload";
      w.target = baseLevel * 0.75;
    } else {
      baseLevel *= 1.02;
      w.target = baseLevel;
    }
    // the base block belongs to the next race, when there is one, so the week can say what it builds towards
    const next = upcoming.find((r) => mondayOf(r.date) > w.start);
    if (next) w.race = next;
  }

  for (const w of weeks) w.focus = focusFor(w.phase, w.kind, w.race?.format);
  return weeks;
}
