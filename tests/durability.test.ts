import { describe, expect, it } from "vitest";
import { driftBand, durabilityOf, isBrick } from "@/lib/durability";
import { durabilityRows, firstKmByMonth } from "@/lib/durability-trends";
import type { Activity } from "@/lib/strava/types";

/** A steady 60-minute run at 4:40/km (3.571 m/s), 1 Hz, HR rising from 150 to 160 in the second half. */
function steadyRun(opts: { drift: boolean; km1Fast?: boolean } = { drift: true }) {
  const n = 3600;
  const time = Array.from({ length: n }, (_, i) => i);
  const speed = time.map((t) => (opts.km1Fast && t < 270 ? 3.85 : 3.571));
  const hr = time.map((t) => (opts.drift && t >= 2100 ? 160 : 150));
  const distance: number[] = [];
  let d = 0;
  for (let i = 0; i < n; i++) {
    d += i ? speed[i] : 0;
    distance.push(d);
  }
  return { time, velocity_smooth: speed, heartrate: hr, distance, moving: time.map(() => true) };
}
const run = { sport: "run" as const, movingTime: 3600, distance: 12800 };

describe("aerobic decoupling", () => {
  it("a steady run whose HR drifts up in the second half decouples", () => {
    const d = durabilityOf(steadyRun({ drift: true }), run)!;
    // efficiency first half: speed/150; second half mixes 150 and 160 -> about 5% lower
    expect(d.decouplingBasis).toBe("steady");
    expect(d.decoupling!).toBeGreaterThan(3);
    expect(d.decoupling!).toBeLessThan(7);
  });
  it("no drift, no decoupling", () => {
    expect(durabilityOf(steadyRun({ drift: false }), run)!.decoupling).toBeCloseTo(0, 6);
  });
  it("too short a run gets no decoupling", () => {
    expect(durabilityOf(steadyRun(), { ...run, movingTime: 40 * 60 })?.decoupling).toBeUndefined();
  });
  it("bands: under 5 good, 5 to 8 watch, over 8 poor", () => {
    expect([driftBand(4.9), driftBand(5), driftBand(8), driftBand(8.1)]).toEqual(["good", "watch", "watch", "poor"]);
  });
});

describe("first km and fade", () => {
  it("flags a first km more than 3% faster than km 2-5", () => {
    const d = durabilityOf(steadyRun({ drift: false, km1Fast: true }), run)!;
    expect(d.firstKm!.fasterPct).toBeGreaterThan(3);
    expect(durabilityOf(steadyRun({ drift: false }), run)!.firstKm!.fasterPct).toBeCloseTo(0, 0);
  });

  it("second-half fade of a run, like Floripa 4:24 vs 4:55 (11.7%)", () => {
    // 8 km at 264 s/km, then 8 km at 295 s/km
    const n = 2112 + 2360;
    const time = Array.from({ length: n }, (_, i) => i);
    const v1 = 1000 / 264;
    const v2 = 1000 / 295;
    const distance: number[] = [];
    let d = 0;
    const speed: number[] = [];
    for (let i = 0; i < n; i++) {
      const v = d < 8000 ? v1 : v2;
      speed.push(v);
      d += i ? v : 0;
      distance.push(d);
    }
    const out = durabilityOf({ time, velocity_smooth: speed, distance }, { sport: "run", movingTime: n, distance: d })!;
    expect(out.fade!).toBeCloseTo(((295 - 264) / 264) * 100, 0);
  });
});

describe("fatigue resistance", () => {
  it("best 20 minutes after 1,500 and 2,500 kJ", () => {
    // 3 h: 2 h at 200 W (1,440 kJ), then 20 min at 300 W, then 40 min at 150 W
    const watts = [...Array(7200).fill(200), ...Array(1200).fill(300), ...Array(2400).fill(150)];
    const d = durabilityOf({ time: watts.map((_, i) => i), watts }, { sport: "ride", movingTime: watts.length, distance: 90000 })!;
    expect(d.kj).toBe(2160);
    expect(d.best20).toBeCloseTo(300, 0);
    // 1,500 kJ is reached 200 s into the 300 W block: the best 20 minutes after it are 1,000 s at 300 W and 200 s at 150 W
    expect(d.best20After1500).toBeCloseTo(275, 0);
    expect(d.best20After2500).toBeUndefined(); // only 2,160 kJ in total
  });
});

describe("bricks and trends", () => {
  const ride = (date: string, elapsed: number): Activity => ({ id: 1, name: "ride", sport: "ride", date, distance: 80000, movingTime: elapsed, elapsedTime: elapsed, elevation: 0 });
  const runA = (id: number, date: string): Activity => ({ id, name: "run", sport: "run", date, distance: 10000, movingTime: 2700, elapsedTime: 2700, elevation: 0 });

  it("a run starting within 20 minutes of the end of a ride is a brick", () => {
    const r = ride("2026-11-14T07:00:00", 3 * 3600);
    expect(isBrick(runA(2, "2026-11-14T10:05:00"), [r])).toBe(true);
    expect(isBrick(runA(2, "2026-11-14T10:30:00"), [r])).toBe(false);
  });

  it("counts first-km flags per month and gives fatigue resistance as a share of the fresh 90-day best", () => {
    const acts = [runA(10, "2026-11-02T07:00:00"), runA(11, "2026-11-09T07:00:00"), ride("2026-11-05T07:00:00", 4 * 3600), { ...ride("2026-11-20T07:00:00", 4 * 3600), id: 13 }];
    const zones = {
      10: { durability: { firstKm: { km1: 260, km2to5: 275, fasterPct: 5.5 } } },
      11: { durability: { firstKm: { km1: 274, km2to5: 275, fasterPct: 0.4 } } },
      1: { durability: { best20: 300, best20After1500: 270, kj: 2600 } },
      13: { durability: { best20: 290, best20After1500: 285, best20After2500: 260, kj: 2900 } },
    };
    const rows = durabilityRows(acts, zones);
    expect(firstKmByMonth(rows)).toEqual([{ month: "2026-11", runs: 2, flagged: 1 }]);
    const later = rows.find((r) => r.id === 13)!;
    expect(later.freshBest20).toBe(300); // the best 20 minutes of the 90 days before
    expect(later.after1500Pct).toBeCloseTo((285 / 300) * 100, 6);
    expect(later.after2500Pct).toBeCloseTo((260 / 300) * 100, 6);
  });
});
