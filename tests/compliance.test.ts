import { describe, expect, it } from "vitest";
import { hrCapCompliance, matchWeek, rangeCompliance, ratioColor, sessionCompliance, weekCompliance, workReps, type Lap } from "@/lib/compliance";
import { emptyDays, sanitizeDays } from "@/lib/lab/plan";
import type { PlanDay } from "@/lib/lab/types";
import type { Activity } from "@/lib/strava/types";

const act = (id: number, date: string, sport: Activity["sport"], minutes: number, km = 0): Activity => ({
  id,
  name: `a${id}`,
  sport,
  date,
  distance: km * 1000,
  movingTime: minutes * 54,
  elapsedTime: minutes * 60,
  elevation: 0,
});

/** Monday 2026-11-09: run AM + run PM planned (a double), ride Tuesday, rest Wednesday. */
function plan(): PlanDay[] {
  const days = emptyDays();
  const mon = days[0].slots;
  mon[0] = { ...mon[0], description: "easy 10k", minutes: 50, km: 10 };
  mon.push({ sport: "run", description: "PM 6x1k", minutes: 60, km: 12, key: true, target: { type: "pace-range", min: 220, max: 228 }, structure: { reps: 6, repMeters: 1000 } });
  days[1].slots[1] = { ...days[1].slots[1], description: "sweet spot", minutes: 90, km: 45 };
  days[2] = { day: 2, rest: true, slots: days[2].slots };
  return days;
}

describe("matching", () => {
  const acts = [
    act(1, "2026-11-09T06:30:00", "run", 52, 10.2),
    act(2, "2026-11-09T18:00:00", "run", 58, 11.8),
    act(3, "2026-11-11T07:00:00", "swim", 40, 2),
    act(4, "2026-11-09T12:00:00", "other", 3), // a 3-minute walk: not a session
  ];

  it("pairs a double by order (AM, then PM) and finds what was missed and unplanned", () => {
    const m = matchWeek(plan(), "2026-11-09", acts);
    expect(m[0].entries.map((e) => e.activity?.id)).toEqual([1, 2]);
    expect(m[1].entries[0].activity).toBeNull(); // the ride was missed
    expect(m[2].rest).toBe(true);
    expect(m[2].unplanned.map((a) => a.id)).toEqual([3]); // a swim on the rest day
    expect(m[0].unplanned).toHaveLength(0);
  });

  it("a manual re-match wins", () => {
    const m = matchWeek(plan(), "2026-11-09", acts, { 1: { day: 0, slot: 5 }, 2: null });
    expect(m[0].entries.find((e) => e.slot === 5)?.activity?.id).toBe(1);
    expect(m[0].entries.find((e) => e.slot === 0)?.activity).toBeNull();
    expect(m[0].unplanned.map((a) => a.id)).toEqual([2]);
  });

  it("week summary: done, missed, unplanned on rest day, key sessions and score", () => {
    const w = weekCompliance(matchWeek(plan(), "2026-11-09", acts), "2026-11-15");
    expect(w).toMatchObject({ planned: 3, done: 2, missed: 1, unplanned: 1, unplannedOnRest: 1, keyPlanned: 1, keyDone: 1 });
    expect(w.score).toBe(67); // two greens, one missed
    expect(w.bySport.run.plannedH).toBeCloseTo(110 / 60, 5);
    expect(w.bySport.run.doneH).toBeCloseTo(110 / 60, 5);
  });

  it("a week in progress does not count future days as missed", () => {
    const w = weekCompliance(matchWeek(plan(), "2026-11-09", acts), "2026-11-09");
    expect(w.missed).toBe(0);
  });
});

describe("duration and distance colors", () => {
  it("uses the 80-120 / 50-150 bands", () => {
    expect(ratioColor(60, 60).color).toBe("green");
    expect(ratioColor(60, 48).color).toBe("green"); // 80%
    expect(ratioColor(60, 47).color).toBe("yellow");
    expect(ratioColor(60, 30).color).toBe("yellow"); // 50%
    expect(ratioColor(60, 29).color).toBe("red");
    expect(ratioColor(60, 73).color).toBe("yellow"); // 121.7%
    expect(ratioColor(60, 91).color).toBe("red");
    expect(ratioColor(60, null).color).toBe("grey");
  });
  it("planned time is compared with ELAPSED time", () => {
    const m = matchWeek(plan(), "2026-11-09", [act(1, "2026-11-09T06:30:00", "run", 50, 10)]);
    expect(sessionCompliance(m[0].entries[0]).duration.pct).toBeCloseTo(100, 5);
  });
});

describe("intensity", () => {
  it("HR cap from samples: passes under 10% above", () => {
    const samples = [...Array(95).fill({ hr: 150, dt: 1 }), ...Array(5).fill({ hr: 160, dt: 1 })];
    expect(hrCapCompliance(155, { samples })).toMatchObject({ pass: true, from: "streams" });
    expect(hrCapCompliance(155, { samples: [...samples, ...Array(10).fill({ hr: 170, dt: 1 })] })?.pass).toBe(false);
  });

  const laps: Lap[] = [
    { elapsedS: 900, movingS: 900, distM: 3000, speed: 3.33, hr: 140 }, // warm-up
    ...[214, 222, 225, 229, 233, 224].map((p) => ({ elapsedS: p, movingS: p, distM: 1000, speed: 1000 / p, hr: 175 })),
    { elapsedS: 600, movingS: 600, distM: 1800, speed: 3, hr: 150 }, // cool-down
  ];

  it("finds the work reps from the laps and checks each against the pace range", () => {
    const reps = workReps(laps, { reps: 6, repMeters: 1000 }, "pace");
    expect(reps).toHaveLength(6);
    const r = rangeCompliance(reps, { type: "pace-range", min: 220, max: 228 })!;
    expect(r.reps.map((x) => x.verdict)).toEqual(["out", "in", "in", "near", "out", "in"]);
    expect(r.first?.value).toBe(214); // the first rep, too fast
    expect(r.first?.offPct).toBeLessThan(-2);
    expect(r.pass).toBe(true); // 4 of 6 inside or within 2%
  });
});

describe("planner storage", () => {
  it("keeps doubles and the structured fields, and still reads the old one-box days", () => {
    const days = sanitizeDays(plan())!;
    expect(days[0].slots).toHaveLength(6);
    expect(days[0].slots[5]).toMatchObject({ sport: "run", key: true, target: { type: "pace-range", min: 220, max: 228 }, structure: { reps: 6, repMeters: 1000 } });
    const old = sanitizeDays(Array.from({ length: 7 }, (_, i) => ({ day: i, description: i === 0 ? "AM run / PM swim" : "rest", minutes: 60, km: 10 })))!;
    expect(old[0].slots[4]).toMatchObject({ sport: "other", description: "AM run / PM swim", minutes: 60 });
  });
});
