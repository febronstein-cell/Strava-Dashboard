import { describe, expect, it } from "vitest";
import { buildSeason, type SeasonRace } from "@/lib/lab/season";
import {
  nextARace,
  phaseOfWeek,
  phaseOn,
  sanitizePhase,
  sanitizeRace,
  SEED_PHASES,
  SEED_RACES,
  seasonBrief,
  taperRule,
  type PhaseEntry,
} from "@/lib/season-plan";

describe("season seeds", () => {
  it("has the four races with the requested priorities", () => {
    const by = Object.fromEntries(SEED_RACES.map((r) => [r.date, r]));
    expect(by["2026-12-13"].priority).toBe("B");
    expect(by["2026-12-13"].type).toBe("olympic");
    expect(by["2027-04-18"]).toMatchObject({ priority: "A", type: "70.3" });
    expect(by["2027-06-13"]).toMatchObject({ priority: "A", type: "ironman" });
    expect(by["2026-10-18"]).toMatchObject({ priority: "A", status: "done", result: "4:49:19" });
  });

  it("phases are contiguous from Oct 26 2026 to Jun 13 2027 without overlaps", () => {
    const sorted = [...SEED_PHASES].sort((a, b) => (a.start < b.start ? -1 : 1));
    expect(sorted[0].start).toBe("2026-10-26");
    expect(sorted[sorted.length - 1].end).toBe("2027-06-13");
    for (let i = 1; i < sorted.length; i++) {
      const prevEnd = new Date(Date.parse(sorted[i - 1].end) + 86_400_000).toISOString().slice(0, 10);
      expect(sorted[i].start).toBe(prevEnd);
    }
  });
});

describe("phase lookup", () => {
  it("finds the phase of a day and of a week", () => {
    expect(phaseOn(SEED_PHASES, "2026-11-10")?.name).toBe("Swim focus, week 1");
    expect(phaseOn(SEED_PHASES, "2026-10-20")).toBeNull();
    expect(phaseOfWeek(SEED_PHASES, "2026-11-23")?.name).toBe("Bike focus");
    // a week split 3/4 between two phases belongs to the one with more days
    const split: PhaseEntry[] = [
      { start: "2026-01-01", end: "2026-01-07", name: "a", focus: "run", hoursMin: 1, hoursMax: 1 },
      { start: "2026-01-08", end: "2026-01-20", name: "b", focus: "run", hoursMin: 1, hoursMax: 1 },
    ];
    expect(phaseOfWeek(split, "2026-01-05")?.name).toBe("b"); // Mon 5th..Sun 11th: 3 days of a, 4 of b
  });

  it("next A race skips B races and finished races", () => {
    expect(nextARace(SEED_RACES, "2026-10-28")?.name).toBe("IRONMAN 70.3 Brasília");
    expect(nextARace(SEED_RACES, "2027-04-19")?.name).toBe("IRONMAN Brasil");
    expect(nextARace(SEED_RACES, "2027-07-01")).toBeNull();
  });
});

describe("taper rules by priority", () => {
  it("A 70.3: 7 to 10 days, volume down 30 to 40%", () => {
    const r = taperRule("70.3", "A");
    expect(r.days).toEqual([7, 10]);
    expect(r.cut).toEqual([30, 40]);
    expect(r.raceWeek).toBeGreaterThanOrEqual(0.6);
    expect(r.raceWeek).toBeLessThanOrEqual(0.7);
  });
  it("A Ironman: 14 days, volume down 40 to 60%", () => {
    const r = taperRule("ironman", "A");
    expect(r.days).toEqual([14, 14]);
    expect(r.cut).toEqual([40, 60]);
    expect(r.before).toHaveLength(1);
  });
  it("B: 4 to 5 day mini taper, no taper weeks; C: none", () => {
    expect(taperRule("olympic", "B")).toMatchObject({ days: [4, 5], before: [] });
    expect(taperRule("olympic", "C")).toMatchObject({ days: [0, 0], before: [], raceWeek: 1 });
  });
});

describe("season model with phases", () => {
  const races: SeasonRace[] = SEED_RACES.map((r) => ({ name: r.name, date: r.date, priority: r.priority, type: r.type, format: r.type === "run" || r.type === "other" ? undefined : r.type }));

  it("phase hours replace the automatic target and the A race is named", () => {
    const weeks = buildSeason(races, "2026-10-28", 15, 40, SEED_PHASES);
    const swim1 = weeks.find((w) => w.start === "2026-11-09")!;
    expect(swim1.seasonPhase?.name).toBe("Swim focus, week 1");
    expect(swim1.target).toBe(25);
    expect(swim1.targetRange).toEqual([25, 25]);
    expect(swim1.aRace?.name).toBe("IRONMAN 70.3 Brasília");
    const reentry = weeks.find((w) => w.start === "2026-10-26")!;
    expect(reentry.target).toBe(19); // middle of 14 to 24
  });

  it("a week that no phase covers keeps the automatic target", () => {
    const weeks = buildSeason(races, "2027-07-05", 20, 4, SEED_PHASES);
    expect(weeks[0].seasonPhase).toBeNull();
    expect(weeks[0].target).toBeGreaterThan(0);
  });

  it("without phases, a B race only gets a lighter race week (no taper weeks)", () => {
    const weeks = buildSeason(races, "2026-10-28", 15, 12, []);
    expect(weeks.some((w) => w.phase === "taper" && w.race?.priority === "B")).toBe(false);
    const raceWeek = weeks.find((w) => w.raceWeek && w.race?.priority === "B")!;
    const before = weeks[weeks.indexOf(raceWeek) - 1];
    expect(raceWeek.target).toBeLessThan(before.target);
  });
});

describe("validation and brief", () => {
  it("rejects bad races and phases", () => {
    expect(sanitizeRace({ name: "x", date: "2027-01-01", type: "olympic", priority: "Z", status: "upcoming" })).toBeNull();
    expect(sanitizeRace({ name: "", date: "2027-01-01", type: "olympic", priority: "A", status: "upcoming" })).toBeNull();
    expect(sanitizeRace({ name: "Ok", date: "2027-01-01", type: "run", priority: "C", status: "upcoming" })?.type).toBe("run");
    expect(sanitizePhase({ name: "p", start: "2027-02-01", end: "2027-01-01", focus: "run", hoursMin: 1, hoursMax: 2 })).toBeNull();
    expect(sanitizePhase({ name: "p", start: "2027-01-01", end: "2027-02-01", focus: "run", hoursMin: 5, hoursMax: 2 })).toBeNull();
    expect(sanitizePhase({ name: "p", start: "2027-01-01", end: "2027-02-01", focus: "bike", hoursMin: 5, hoursMax: 8 })?.hoursMax).toBe(8);
  });

  it("the AI brief names the A race as the main goal and the B race as secondary", () => {
    const text = seasonBrief({ races: SEED_RACES, phases: SEED_PHASES }, "2026-11-10");
    expect(text).toContain("Next A race (main goal): IRONMAN 70.3 Brasília");
    expect(text).toContain("B race: Troféu Brasil");
    expect(text).toContain("Swim focus, week 1");
  });
});
