import { describe, expect, it } from "vitest";
import { activityLoad, rpeLoad, RPE_IF, sportFitness } from "@/lib/lab/load";
import type { Profile } from "@/lib/lab/profile";
import type { Activity } from "@/lib/strava/types";

const m = (value: number) => ({ value, source: "test" }) as unknown as NonNullable<Profile["ftp"]>;
const profile = { ftp: m(323), lthr: m(187), resting_hr: m(50), run_threshold_pace: m(217), css: m(90) } as unknown as Profile;
const base = (x: Partial<Activity>): Activity => ({ id: 1, name: "x", sport: "run", date: "2026-11-10T07:00:00", distance: 0, movingTime: 3600, elapsedTime: 3600, elevation: 0, ...x });

describe("session RPE load", () => {
  it("uses the RPE table and hours × IF² × 100", () => {
    expect(RPE_IF[7]).toBe(0.82);
    expect(rpeLoad(1, 7)).toBeCloseTo(0.82 * 0.82 * 100, 6);
    expect(rpeLoad(1.5, 10)).toBeCloseTo(1.5 * 1.05 * 1.05 * 100, 6);
  });

  it("a gym session with only RPE gets its load from RPE", () => {
    const r = activityLoad(base({ sport: "strength", rpe: 6 }), profile);
    expect(r.method).toBe("rpe");
    expect(r.tss).toBeCloseTo(56.25, 6);
  });

  it("a manual session uses elapsed time", () => {
    const r = activityLoad(base({ sport: "swim", manual: true, rpe: 5, movingTime: 2700, elapsedTime: 3600 }), profile);
    expect(r.method).toBe("rpe");
    expect(r.tss).toBeCloseTo(49, 6);
  });

  it("priority: power, then pace, then HR, then RPE, then duration", () => {
    expect(activityLoad(base({ sport: "ride", np: 260, watts: 240, deviceWatts: true, hr: 150, rpe: 8 }), profile).method).toBe("power");
    expect(activityLoad(base({ sport: "run", distance: 14000, hr: 160, rpe: 8 }), profile).method).toBe("pace");
    expect(activityLoad(base({ sport: "ride", hr: 150, rpe: 8 }), profile).method).toBe("hr");
    expect(activityLoad(base({ sport: "other", rpe: 4 }), profile).method).toBe("rpe");
    expect(activityLoad(base({ sport: "other" }), profile).method).toBe("duration");
  });
});

describe("swim load with CSS", () => {
  it("IF = CSS pace / average pace, cubed, and RPE is kept for comparison", () => {
    // 3000 m in 50 min = 100 s/100 m; CSS 90 s/100 m -> IF 0.9
    const r = activityLoad(base({ sport: "swim", distance: 3000, movingTime: 3000, hr: 140, rpe: 6 }), profile);
    expect(r.method).toBe("pace");
    expect(r.tss).toBeCloseTo((3000 / 3600) * 0.9 ** 3 * 100, 4);
    expect(r.rpeTss).toBeCloseTo((3000 / 3600) * 0.75 ** 2 * 100, 4);
  });
});

describe("strength", () => {
  it("counts in no single sport's fitness", () => {
    const acts = [base({ sport: "strength", rpe: 8, date: "2026-11-01T07:00:00" }), base({ sport: "run", distance: 12000, date: "2026-11-02T07:00:00" })];
    const f = sportFitness(acts, profile, "2026-11-10");
    expect(f.strength).toBe(0);
    expect(f.run).toBeGreaterThan(0);
  });
});
