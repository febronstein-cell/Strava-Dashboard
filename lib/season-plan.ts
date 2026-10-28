import { siteConfig, type UpcomingRace } from "@/site.config";

/**
 * The season: the race calendar with priorities (A = goal of the season, B = secondary, C = training race) and the
 * phases of the year with their target hours. Pure, so the server (AI prompts, race builds) and the pages read the
 * same thing. The data lives in the season_races and season_phases tables; when they are missing or empty, the seeds
 * below (the calendar as planned on 2026-10-28) are used.
 */

export type RaceType = "sprint" | "olympic" | "70.3" | "ironman" | "run" | "other";
export type RacePriority = "A" | "B" | "C";
export type RaceStatus = "upcoming" | "done" | "dnf";
export type PhaseFocus = "swim" | "bike" | "run" | "mixed" | "race-specific" | "taper" | "recovery";
export type TriFormat = "sprint" | "olympic" | "70.3" | "ironman";

export const RACE_TYPES: RaceType[] = ["sprint", "olympic", "70.3", "ironman", "run", "other"];
export const PHASE_FOCUSES: PhaseFocus[] = ["swim", "bike", "run", "mixed", "race-specific", "taper", "recovery"];

export interface SeasonRaceEntry {
  id?: number;
  name: string;
  /** YYYY-MM-DD */
  date: string;
  location?: string;
  type: RaceType;
  priority: RacePriority;
  /** free text, e.g. "sub 4:10" */
  goal?: string;
  status: RaceStatus;
  notes?: string;
  /** finish time once done, e.g. "4:49:19" */
  result?: string;
  /** optional hand-fixed start of the build-up (used by the race builds) */
  cycleStart?: string;
}

export interface PhaseEntry {
  id?: number;
  /** YYYY-MM-DD, inclusive */
  start: string;
  /** YYYY-MM-DD, inclusive */
  end: string;
  name: string;
  focus: PhaseFocus;
  hoursMin: number;
  hoursMax: number;
  runKmMin?: number;
  runKmMax?: number;
  notes?: string;
}

export interface SeasonData {
  races: SeasonRaceEntry[];
  phases: PhaseEntry[];
  /** "db" when read from the tables, "seed" when the tables are missing or empty */
  source: "db" | "seed";
}

/** The race seed is the calendar in site.config.ts (upcomingRaces). */
export const SEED_RACES: SeasonRaceEntry[] = siteConfig.upcomingRaces.map(fromConfig);

export function fromConfig(r: UpcomingRace): SeasonRaceEntry {
  return {
    name: r.name,
    date: r.date,
    location: r.location,
    type: r.type ?? r.format ?? "other",
    priority: r.priority ?? defaultPriority(r.type ?? r.format),
    goal: r.goal,
    status: r.status ?? "upcoming",
    notes: r.note,
    result: r.result,
    cycleStart: r.cycleStart,
  };
}

/** The season as planned on 2026-10-28. */
export const SEED_PHASES: PhaseEntry[] = [
  { start: "2026-10-26", end: "2026-11-08", name: "Re-entry and run-led build", focus: "run", hoursMin: 14, hoursMax: 24, runKmMin: 55, runKmMax: 125 },
  { start: "2026-11-09", end: "2026-11-15", name: "Swim focus, week 1", focus: "swim", hoursMin: 25, hoursMax: 25, runKmMin: 90, runKmMax: 90 },
  { start: "2026-11-16", end: "2026-11-22", name: "Swim focus, week 2 (lighter)", focus: "swim", hoursMin: 18, hoursMax: 19, runKmMin: 65, runKmMax: 70 },
  { start: "2026-11-23", end: "2026-12-06", name: "Bike focus", focus: "bike", hoursMin: 23, hoursMax: 25, runKmMin: 75, runKmMax: 75, notes: "Hypoxia starts Nov 23" },
  { start: "2026-12-07", end: "2026-12-13", name: "Santos week, mini taper (B race)", focus: "taper", hoursMin: 16, hoursMax: 19, runKmMin: 55, runKmMax: 55 },
  { start: "2026-12-14", end: "2026-12-20", name: "Recovery", focus: "recovery", hoursMin: 14, hoursMax: 14, runKmMin: 45, runKmMax: 45 },
  { start: "2026-12-21", end: "2027-01-17", name: "Run focus", focus: "run", hoursMin: 25, hoursMax: 27, runKmMin: 100, runKmMax: 115 },
  { start: "2027-01-18", end: "2027-02-21", name: "Build, 3:1 cycles", focus: "mixed", hoursMin: 26, hoursMax: 28, runKmMin: 100, runKmMax: 100 },
  { start: "2027-02-22", end: "2027-04-04", name: "70.3 build, long-course work begins", focus: "race-specific", hoursMin: 28, hoursMax: 30, runKmMin: 100, runKmMax: 130 },
  { start: "2027-04-05", end: "2027-04-18", name: "Taper and Brasília 70.3", focus: "taper", hoursMin: 20, hoursMax: 20, runKmMin: 70, runKmMax: 70 },
  { start: "2027-04-19", end: "2027-04-25", name: "Recovery", focus: "recovery", hoursMin: 14, hoursMax: 14, runKmMin: 45, runKmMax: 45 },
  { start: "2027-04-26", end: "2027-05-30", name: "Ironman build", focus: "race-specific", hoursMin: 28, hoursMax: 30, runKmMin: 100, runKmMax: 120 },
  { start: "2027-05-31", end: "2027-06-13", name: "Taper and Ironman Brasil", focus: "taper", hoursMin: 20, hoursMax: 20, runKmMin: 70, runKmMax: 70 },
];

export function defaultPriority(type?: string): RacePriority {
  return type === "70.3" || type === "ironman" ? "A" : "B";
}

/** The triathlon distance of a race type (undefined for run and other races). */
export function triFormat(type: RaceType): TriFormat | undefined {
  return type === "sprint" || type === "olympic" || type === "70.3" || type === "ironman" ? type : undefined;
}

export interface TaperRule {
  /** days of reduced training before the race */
  days: [number, number];
  /** volume cut over those days, in % */
  cut: [number, number];
  /** share of the normal weekly hours for the week(s) before the race week, in order, then for the race week */
  before: number[];
  raceWeek: number;
  /** plain description, English */
  text: string;
}

/**
 * Taper by priority. A: full taper (70.3: 7 to 10 days, volume down 30 to 40%; Ironman: 14 days, down 40 to 60%;
 * shorter A races: about a week). B: a 4 to 5 day mini taper. C: no taper (trained through).
 */
export function taperRule(type: RaceType, priority: RacePriority): TaperRule {
  if (priority === "C") return { days: [0, 0], cut: [0, 0], before: [], raceWeek: 1, text: "No taper: train through it" };
  if (priority === "B") return { days: [4, 5], cut: [20, 30], before: [], raceWeek: 0.8, text: "Mini taper: 4 to 5 days lighter" };
  if (type === "ironman") return { days: [14, 14], cut: [40, 60], before: [0.55], raceWeek: 0.45, text: "Full taper: 14 days, volume down 40 to 60%" };
  if (type === "70.3") return { days: [7, 10], cut: [30, 40], before: [0.8], raceWeek: 0.6, text: "Full taper: 7 to 10 days, volume down 30 to 40%" };
  return { days: [7, 7], cut: [30, 40], before: [], raceWeek: 0.65, text: "Full taper: about 7 days, volume down 30 to 40%" };
}

const DAY = 86_400_000;
export const addDays = (key: string, n: number) => new Date(Date.parse(key + "T00:00:00Z") + n * DAY).toISOString().slice(0, 10);

/** The phase that covers a day, or null. */
export function phaseOn(phases: PhaseEntry[], dayKey: string): PhaseEntry | null {
  return phases.find((p) => p.start <= dayKey && dayKey <= p.end) ?? null;
}

/** The phase of a week (Monday key): the phase that covers most of its 7 days (ties: the earlier one). */
export function phaseOfWeek(phases: PhaseEntry[], monday: string): PhaseEntry | null {
  const count = new Map<PhaseEntry, number>();
  for (let i = 0; i < 7; i++) {
    const p = phaseOn(phases, addDays(monday, i));
    if (p) count.set(p, (count.get(p) ?? 0) + 1);
  }
  let best: PhaseEntry | null = null;
  let n = 0;
  for (const [p, c] of count) if (c > n) [best, n] = [p, c];
  return best;
}

/** Middle of a phase's target hours. */
export const phaseTarget = (p: PhaseEntry) => (p.hoursMin + p.hoursMax) / 2;

/** The next A race on or after a day (upcoming ones only). */
export function nextARace(races: SeasonRaceEntry[], dayKey: string): SeasonRaceEntry | null {
  return [...races].filter((r) => r.priority === "A" && r.date >= dayKey && r.status === "upcoming").sort((a, b) => (a.date < b.date ? -1 : 1))[0] ?? null;
}

/** The last A race of the calendar (the end of the season timeline). */
export function lastARace(races: SeasonRaceEntry[]): SeasonRaceEntry | null {
  return [...races].filter((r) => r.priority === "A").sort((a, b) => (a.date < b.date ? 1 : -1))[0] ?? null;
}

/** Races sorted by date. */
export const byDate = (races: SeasonRaceEntry[]) => [...races].sort((a, b) => (a.date < b.date ? -1 : 1));

/**
 * The season in a few lines of plain English for the AI prompts, so the models know the main goals
 * (A races) and do not treat a secondary race as the target.
 */
export function seasonBrief(data: Pick<SeasonData, "races" | "phases">, dayKey: string): string {
  const phase = phaseOn(data.phases, dayKey);
  const nextA = nextARace(data.races, dayKey);
  const upcoming = byDate(data.races).filter((r) => r.date >= dayKey && r.status === "upcoming");
  const lines = [
    "Season context (use it; do not treat a B or C race as the main goal):",
    phase
      ? `- Current phase (${phase.start} to ${phase.end}): ${phase.name}; focus ${phase.focus}; target ${phase.hoursMin === phase.hoursMax ? phase.hoursMin : `${phase.hoursMin} to ${phase.hoursMax}`} h per week${phase.runKmMin != null ? `, run ${phase.runKmMin === phase.runKmMax ? phase.runKmMin : `${phase.runKmMin} to ${phase.runKmMax}`} km` : ""}${phase.notes ? `; ${phase.notes}` : ""}.`
      : "- No season phase covers today.",
    nextA ? `- Next A race (main goal): ${nextA.name}, ${nextA.date} (${nextA.type})${nextA.goal ? `, goal ${nextA.goal}` : ""}.` : "- No A race ahead.",
    ...upcoming.map((r) => `- ${r.priority} race: ${r.name}, ${r.date} (${r.type})${r.goal ? `, goal ${r.goal}` : ""}. ${taperRule(r.type, r.priority).text}.`),
  ];
  return lines.join("\n");
}

/** Cleans a race sent by the page before it is saved. Returns null when something is invalid. */
export function sanitizeRace(input: unknown): SeasonRaceEntry | null {
  const r = input as Partial<SeasonRaceEntry> | null;
  if (!r || typeof r.name !== "string" || !r.name.trim() || !isDay(r.date)) return null;
  if (!RACE_TYPES.includes(r.type as RaceType) || !["A", "B", "C"].includes(r.priority as string)) return null;
  if (!["upcoming", "done", "dnf"].includes(r.status as string)) return null;
  if (r.cycleStart && !isDay(r.cycleStart)) return null;
  return {
    id: typeof r.id === "number" ? r.id : undefined,
    name: r.name.trim().slice(0, 120),
    date: r.date as string,
    location: text(r.location, 120),
    type: r.type as RaceType,
    priority: r.priority as RacePriority,
    goal: text(r.goal, 120),
    status: r.status as RaceStatus,
    notes: text(r.notes, 600),
    result: text(r.result, 20),
    cycleStart: r.cycleStart || undefined,
  };
}

/** Cleans a phase sent by the page before it is saved. Returns null when something is invalid. */
export function sanitizePhase(input: unknown): PhaseEntry | null {
  const p = input as Partial<PhaseEntry> | null;
  if (!p || typeof p.name !== "string" || !p.name.trim() || !isDay(p.start) || !isDay(p.end) || (p.start as string) > (p.end as string)) return null;
  if (!PHASE_FOCUSES.includes(p.focus as PhaseFocus)) return null;
  const n = (v: unknown, max: number) => (v == null || v === "" ? undefined : Number(v) >= 0 && Number(v) <= max ? Number(v) : NaN);
  const hoursMin = n(p.hoursMin, 60);
  const hoursMax = n(p.hoursMax, 60);
  const runKmMin = n(p.runKmMin, 400);
  const runKmMax = n(p.runKmMax, 400);
  if (hoursMin === undefined || hoursMax === undefined || [hoursMin, hoursMax, runKmMin, runKmMax].some((x) => Number.isNaN(x)) || hoursMin > hoursMax) return null;
  return {
    id: typeof p.id === "number" ? p.id : undefined,
    start: p.start as string,
    end: p.end as string,
    name: p.name.trim().slice(0, 120),
    focus: p.focus as PhaseFocus,
    hoursMin,
    hoursMax,
    runKmMin,
    runKmMax: runKmMax ?? runKmMin,
    notes: text(p.notes, 600),
  };
}

const isDay = (v: unknown): v is string => typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v) && !Number.isNaN(Date.parse(v));
const text = (v: unknown, max: number) => (typeof v === "string" && v.trim() ? v.trim().slice(0, max) : undefined);
