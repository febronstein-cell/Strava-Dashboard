/**
 * ============================================================
 *  CENTRAL CUSTOMIZATION POINT
 * ============================================================
 * Almost everything that gives the site its identity lives here, without touching
 * components: texts, colors, upcoming races, which sections show up and in what
 * order. Global colors/typography live in `app/globals.css` ("THEME TOKENS" block)
 * and fonts in `app/layout.tsx`.
 *
 * Texts are written in English (the main language). Portuguese translations live in
 * `lib/i18n/pt.ts`, keyed by the English text.
 */

/** "other" = everything that is not swim/bike/run/strength (walk, hike, yoga, rowing...). */
export type SportKey = "run" | "ride" | "swim" | "strength" | "other";

export type SectionId =
  | "hero"
  | "races"
  | "about"
  | "sports"
  | "volume"
  | "notable"
  | "stats"
  | "heart"
  | "progression"
  | "geography"
  | "recent"
  | "custom";

export interface UpcomingRace {
  name: string;
  location?: string;
  /** Race date (YYYY-MM-DD). */
  date: string;
  /** Optional: first day of the week when the build for this race began (a big volume increase). Overrides the automatic cycle length in the Lab. */
  cycleStart?: string;
  /**
   * Distance of the race. With it, the Lab's Races tab groups the swim, bike and run of the race day into one
   * triathlon (with transitions) and analyses it. Without it the race is only listed.
   */
  format?: "sprint" | "olympic" | "70.3" | "ironman";
  /** A = a goal of the season (full build-up), B / C = secondary races (shorter build-up). Default: A for 70.3 and Ironman, B for the rest. */
  priority?: "A" | "B" | "C";
  /** Kind of race, including non-triathlons. Defaults to `format`. */
  type?: "sprint" | "olympic" | "70.3" | "ironman" | "run" | "other";
  /** Free-text goal, e.g. "sub 4:10". */
  goal?: string;
  status?: "upcoming" | "done" | "dnf";
  /** Finish time once done, e.g. "4:49:19". */
  result?: string;
  note?: string;
}

export const siteConfig = {
  // ------------------------------------------------------------ identity
  /** Leave empty to use the name from the Strava profile. */
  nameOverride: "",
  /** Short name shown in the top bar. Empty = automatic. */
  shortName: "TheEnduranceFreak",
  /** Tagline under the name in the hero. */
  tagline: "Swim · Bike · Run",
  /** Small text above the name (eyebrow). */
  eyebrow: "Strava in numbers",
  /** Nickname (hero, footer and browser tab title). */
  nickname: "TheEnduranceFreak",
  /** Your @ (without the @). Shown in the hero and the footer. */
  handle: "bronsteintriathlon",
  /** Footer signature. */
  madeBy: "Felipe Bronstein",
  /** Language used on first visit. The visitor can switch with the EN | PT button. */
  defaultLang: "en" as "en" | "pt",
  /** Strava profile link (footer). Empty = built automatically from your athlete ID. */
  stravaProfileUrl: "",

  // ---------------------------------------------------------------- data
  /** First year of the history. `null` = the year your Strava account was created. */
  startYear: null as number | null,

  // -------------------------------------------------------------- colors
  /**
   * Label and color of each sport (they become the CSS variables --run, --ride...).
   * `brand` is the general accent; `goal` marks races and the next goal.
   */
  sports: {
    run: { label: "Run", color: "#ff5a1f", unitLabel: "pace" },
    ride: { label: "Bike", color: "#c6f432", unitLabel: "speed" },
    swim: { label: "Swim", color: "#2bd4ff", unitLabel: "pace" },
    strength: { label: "Strength", color: "#a78bfa", unitLabel: "" },
    other: { label: "Other", color: "#9aa7b8", unitLabel: "" },
  } satisfies Record<SportKey, { label: string; color: string; unitLabel: string }>,
  brand: "#1fe08a",
  goalColor: "#ff4d8d",

  // ------------------------------------------------------------ sections
  /** Order and visibility of the sections. Reorder or flip `enabled`. */
  sections: [
    // summary -> volume -> consistency -> analysis -> records -> map -> latest workouts
    { id: "hero", enabled: true },
    { id: "races", enabled: true },
    { id: "about", enabled: false },
    { id: "sports", enabled: true },
    { id: "volume", enabled: true },
    { id: "progression", enabled: true },
    { id: "stats", enabled: true },
    { id: "heart", enabled: true },
    { id: "notable", enabled: true },
    { id: "geography", enabled: true },
    { id: "recent", enabled: true },
    { id: "custom", enabled: false },
  ] as { id: SectionId; enabled: boolean }[],

  /** Labels of the navigation menu (only sections with a title). */
  nav: {
    races: "Races",
    sports: "Sports",
    volume: "Volume",
    notable: "Highlights",
    stats: "Stats",
    heart: "HR",
    progression: "Progression",
    geography: "Geography",
    recent: "Recent",
  } as Partial<Record<SectionId, string>>,

  // ------------------------------------------------------ upcoming races
  /**
   * Future races, in any order. The nearest one becomes the highlight with a
   * countdown (and the pop-up); races that already happened disappear on their own.
   */
  /**
   * The race calendar. This is the starting point (seed) of the season_races table: once that table has rows, the
   * site reads the races from it (edit them in the Lab's Season tab) and this list is only the fallback.
   */
  upcomingRaces: [
    {
      name: "Ironman 70.3 Florianópolis",
      location: "Florianópolis, SC",
      date: "2026-10-18",
      cycleStart: "2026-08-03",
      format: "70.3",
      priority: "A",
      status: "done",
      result: "4:49:19",
      note: "1.9 km swim · 90 km bike · 21.1 km run",
    },
    {
      name: "Troféu Brasil de Triathlon · Stage 4",
      location: "Santos, SP · Praia da Aparecida",
      date: "2026-12-13",
      format: "olympic",
      priority: "B",
      note: "Final stage of the 2026 circuit",
    },
    {
      name: "IRONMAN 70.3 Brasília",
      location: "Brasília, DF",
      date: "2027-04-18",
      format: "70.3",
      priority: "A",
      note: "1.9 km swim · 90 km bike · 21.1 km run",
    },
    {
      name: "IRONMAN Brasil",
      location: "Florianópolis, SC",
      date: "2027-06-13",
      format: "ironman",
      priority: "A",
      note: "3.8 km swim · 180 km bike · 42.2 km run",
    },
  ] as UpcomingRace[],
  /** Show a pop-up about the next race once per visit. */
  racePopup: true,

  // ------------------------------------------------------------- content
  about: {
    title: "About",
    /** Your text (one paragraph per blank line). */
    body: "",
    /** Cities, e.g. "Florianópolis · São Paulo". */
    places: "",
  },

  // --------------------------------------------------------------- rules
  rules: {
    /** Minimum distance (m) for an activity to count as a "best pace". */
    minDistanceForBestPace: { run: 3000, ride: 10000, swim: 400, strength: Infinity, other: Infinity } satisfies Record<
      SportKey,
      number
    >,
    /** Color the heatmap by the day's dominant sport. */
    heatmapColorBySport: true,
  },

  // ---------------------------------------------------------- heart rate
  heartRate: {
    /**
     * Zones in absolute bpm, applied to each activity's average HR.
     * `max` is the INCLUSIVE upper limit of the zone (Z1 goes up to 150 bpm, Z2 up to 167...);
     * the last zone has no ceiling.
     */
    zones: [
      { name: "Z1 · Recovery", max: 150, color: "#2bd4ff" },
      { name: "Z2 · Aerobic", max: 167, color: "#1fe08a" },
      { name: "Z3 · Tempo", max: 181, color: "#c6f432" },
      { name: "Z4 · Threshold", max: 187, color: "#ffb020" },
      { name: "Z5 · Max", max: Infinity, color: "#ff5a1f" },
    ],
    /** Width of each histogram bar (bpm). */
    bin: 5,
  },

  // ----------------------------------------------------------------- lab
  /** Settings of the separate /lab page (My Machine, Form & Load, Progression, Race builds). */
  lab: {
    /** Resting heart rate, used only to estimate training load from HR. Replace it with a "resting_hr" test in the database. */
    restHr: 50,
    /**
     * The training planner is a hidden part of the Lab: it is not in the tab bar and is opened only by this address
     * (/lab#<this text>). Change the text to move it; keep it to yourself. Editing needs PLAN_EDIT_KEY (see README).
     */
    planHash: "planner-hq",
    /**
     * The Races tab (grouping, analysis, automatic recognition) and its automatic analysis work for races from this
     * date on. Earlier races are not touched. 2026-10-18 is the Ironman 70.3 Florianópolis, the first one registered.
     */
    racesFrom: "2026-10-18",
  },

  // ----------------------------------------------------------- geography
  geo: {
    /**
     * PRIVACY: to hide the stretch near home on the public map, set the home point and a
     * radius. With `home: null` (default) nothing is hidden.
     * E.g.: home: { lat: -27.59, lng: -48.55 }, radiusKm: 1
     */
    privacy: { home: null as { lat: number; lng: number } | null, radiusKm: 1 },
  },

  /** Footer credits. */
  credits: {
    builtWith: ["Next.js", "React", "Tailwind CSS", "TypeScript", "Vercel"],
    maps: ["MapLibre GL", "Esri", "© OpenStreetMap"],
    data: ["Strava API", "Open-Meteo", "Nominatim"],
    fonts: ["Big Shoulders", "Geist", "Geist Mono"],
  },
};

export type SiteConfig = typeof siteConfig;
/** The three triathlon sports (distance/elevation totals only count these). */
export const TRI_SPORTS: SportKey[] = ["swim", "ride", "run"];
/** Everything that gets a color/label. */
export const ALL_SPORTS: SportKey[] = ["swim", "ride", "run", "strength", "other"];
