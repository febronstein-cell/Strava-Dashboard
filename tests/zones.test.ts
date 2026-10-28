import { describe, expect, it } from "vitest";
import { bucket, paceZones, polarization, powerZones, shareAbove, summarizeStreams, threeZone } from "@/lib/zones";

/** 1 Hz samples: 10 min at 140 bpm, 5 min at 175, 2 min at 190, a 60 s pause, then 3 min stopped (moving false). */
function intervalRun() {
  const hr = [...Array(600).fill(140), ...Array(300).fill(175), ...Array(120).fill(190)];
  const time = hr.map((_, i) => i);
  // a pause: the clock jumps 60 s (no samples)
  time.push(time[time.length - 1] + 60);
  hr.push(150);
  const moving: boolean[] = hr.map(() => true);
  for (let i = 0; i < 180; i++) {
    time.push(time[time.length - 1] + 1);
    hr.push(120);
    moving.push(false);
  }
  const velocity = hr.map((h) => (h >= 190 ? 1000 / 210 : h >= 175 ? 1000 / 235 : 1000 / 300));
  return { time, heartrate: hr, moving, velocity_smooth: velocity };
}

describe("stream summary", () => {
  it("keeps moving samples only and skips pauses", () => {
    const s = summarizeStreams(intervalRun(), "run");
    expect(s.movingS).toBe(1019); // 1020 samples, first has no dt; the 60 s gap and 180 s stopped are out
    expect(s.hr?.["140"]).toBe(599);
    expect(s.hr?.["175"]).toBe(300);
    expect(s.hr?.["190"]).toBe(120);
    expect(s.hr?.["120"]).toBeUndefined();
  });

  it("true time in HR zones (zones of site.config: 150, 167, 181, 187)", () => {
    const s = summarizeStreams(intervalRun(), "run");
    expect(bucket(s.hr, [150, 167, 181, 187, Infinity])).toEqual([599, 0, 300, 0, 120]);
  });

  it("pace zones from threshold pace 217 s/km", () => {
    const s = summarizeStreams(intervalRun(), "run");
    const z = paceZones(s.pace, 217);
    // 300 s/km is 138% (Z1), 235 is 108% (Z3), 210 is 97% (Z5)
    expect(z).toEqual([599, 0, 300, 0, 120]);
  });

  it("the 3-zone model with LT1 167 and LT2 187", () => {
    const s = summarizeStreams(intervalRun(), "run");
    expect(threeZone(s, "run", { lt1Hr: 167, lt2Hr: 187 })).toEqual([599, 300, 120]);
  });
});

describe("power", () => {
  it("Coggan zones from FTP 323 and the ride 3-zone cut-offs 242 / 323 W", () => {
    const watts = [...Array(1200).fill(200), ...Array(600).fill(280), ...Array(300).fill(340)];
    const s = summarizeStreams({ time: watts.map((_, i) => i), watts }, "ride");
    const z = powerZones(s.power, 323);
    expect(z[1]).toBe(1199); // 200 W = 62% FTP
    expect(z[2]).toBe(600); // 280 W = 86.7% FTP: Z3
    expect(z[4]).toBe(300); // 340 W = 105.3%: Z5
    expect(threeZone(s, "ride", { lt1Hr: 167, lt2Hr: 187, lt1W: 242, lt2W: 323 })).toEqual([1199, 600, 300]);
  });
});

describe("polarization", () => {
  it("labels a polarized, a pyramidal and a threshold-heavy week", () => {
    expect(polarization([80, 5, 15]).label).toBe("polarized");
    expect(polarization([80, 5, 15]).pi).toBeCloseTo(Math.log10((0.8 / 0.05) * 0.15 * 100), 6);
    expect(polarization([75, 18, 7]).label).toBe("pyramidal");
    expect(polarization([40, 45, 15]).label).toBe("threshold");
  });

  it("time above an HR cap", () => {
    expect(shareAbove({ "150": 90, "160": 10 }, 155)).toBeCloseTo(10, 6);
  });
});
