import { describe, expect, it } from "vitest";
import { applyManual, baselines, mergeImport, readiness, type Checkin } from "@/lib/checkin";

/** 7 calm days before 2026-11-10: resting HR 48 to 50, rMSSD around 80 ms, good sleep. */
const week: Checkin[] = [48, 49, 50, 49, 48, 50, 49].map((rhr, i) => ({
  day: `2026-11-0${3 + i}`,
  restingHR: rhr,
  hrv: [78, 82, 80, 85, 76, 81, 79][i],
  sleepHours: 8.3,
  pain: [],
  sources: {},
}));
const day = (c: Partial<Checkin>): Checkin => ({ day: "2026-11-10", pain: [], sources: {}, ...c });

describe("baselines", () => {
  it("uses the 7 days before, not today", () => {
    const b = baselines([...week, day({ restingHR: 70, hrv: 20 })], "2026-11-10");
    expect(b.restingHR?.n).toBe(7);
    expect(b.restingHR?.ready).toBe(true);
    expect(b.restingHR?.mean).toBeCloseTo(49, 5);
    expect(b.lnHrv?.mean).toBeCloseTo([78, 82, 80, 85, 76, 81, 79].map(Math.log).reduce((s, x) => s + x) / 7, 6);
  });
  it("is still building with fewer than 7 days", () => {
    const b = baselines(week.slice(2), "2026-11-10");
    expect(b.restingHR?.ready).toBe(false);
    // and then HR and HRV cannot raise flags
    const r = readiness(day({ restingHR: 60, hrv: 30, sleepHours: 9, legs: 4 }), week.slice(2));
    expect(r?.signal).toBe("green");
  });
});

describe("readiness signal", () => {
  it("green when everything is in range", () => {
    const r = readiness(day({ restingHR: 51, hrv: 80, sleepHours: 8.2, legs: 4, energy: 4 }), week)!;
    expect(r.signal).toBe("green");
    expect(r.reasons).toHaveLength(0);
  });

  it("yellow on exactly one flag: resting HR +6", () => {
    const r = readiness(day({ restingHR: 55, hrv: 80, sleepHours: 8.5, legs: 4 }), week)!;
    expect(r.signal).toBe("yellow");
    expect(r.reasons[0]).toMatchObject({ text: "Resting HR {bpm} (+{delta} vs baseline)", vars: { bpm: 55, delta: 6 } });
  });

  it("yellow on sleep between 6.5 and 8 h, with the time written like 7h15", () => {
    const r = readiness(day({ sleepHours: 7.25, legs: 4 }), week)!;
    expect(r.signal).toBe("yellow");
    expect(r.reasons[0].vars).toEqual({ sleep: "7h15" });
  });

  it("red on two flags", () => {
    expect(readiness(day({ sleepHours: 7, legs: 2 }), week)!.signal).toBe("red");
  });

  it("red on short sleep, legs 1, pain 5 or a stride-changing pain", () => {
    expect(readiness(day({ sleepHours: 5.75 }), week)!.signal).toBe("red");
    expect(readiness(day({ sleepHours: 5.75 }), week)!.reasons[0].vars).toEqual({ sleep: "5h45" });
    expect(readiness(day({ legs: 1, sleepHours: 9 }), week)!.signal).toBe("red");
    expect(readiness(day({ pain: [{ location: "calf", score: 5 }], sleepHours: 9 }), week)!.signal).toBe("red");
    expect(readiness(day({ pain: [{ location: "achilles", score: 2, stride: true }], sleepHours: 9 }), week)!.signal).toBe("red");
    expect(readiness(day({ pain: [{ location: "knee", score: 3 }], sleepHours: 9 }), week)!.signal).toBe("yellow");
  });

  it("HRV below range: one day is a flag, two days in a row is red", () => {
    const oneDay = readiness(day({ hrv: 55, sleepHours: 9 }), week)!;
    expect(oneDay.signal).toBe("yellow");
    const lowYesterday: Checkin = { day: "2026-11-10", hrv: 55, restingHR: 49, sleepHours: 9, pain: [], sources: {} };
    const history = [...week, lowYesterday];
    const r = readiness({ day: "2026-11-11", hrv: 54, sleepHours: 9, pain: [], sources: {} }, history)!;
    expect(r.signal).toBe("red");
  });

  it("resting HR +7 two days in a row is red, one day is only a flag", () => {
    expect(readiness(day({ restingHR: 57, sleepHours: 9 }), week)!.signal).toBe("yellow");
    const highYesterday: Checkin = { day: "2026-11-10", restingHR: 57, pain: [], sources: {} };
    const r = readiness({ day: "2026-11-11", restingHR: 58, sleepHours: 9, pain: [], sources: {} }, [...week, highYesterday])!;
    expect(r.signal).toBe("red");
  });

  it("no data, no signal", () => {
    expect(readiness(day({}), week)).toBeNull();
  });
});

describe("manual always wins", () => {
  it("an import never overwrites a typed field", () => {
    const typed = applyManual(null, "2026-11-10", { sleepHours: 7.5, legs: 3 })!;
    const merged = mergeImport(typed, "2026-11-10", { sleepHours: 6.1, restingHR: 50, hrv: 70 }, "intervals");
    expect(merged.sleepHours).toBe(7.5);
    expect(merged.sources.sleepHours).toBe("manual");
    expect(merged.restingHR).toBe(50);
    expect(merged.sources.restingHR).toBe("intervals");
  });
  it("rejects values out of range", () => {
    expect(applyManual(null, "2026-11-10", { legs: 6 })).toBeNull();
    expect(applyManual(null, "2026-11-10", { pain: [{ location: "elbow", score: 3 }] })).toBeNull();
    expect(applyManual(null, "2026-11-10", { wakeTime: "6:45" })?.wakeTime).toBe("6:45");
  });
});

import { findToken } from "@/lib/checkin-import";

describe("Garmin token parsing", () => {
  const jwt = "aaaaaaaaaaaaaaaa.bbbbbbbbbbbbbbbbbbbb.cccccccccccccccc";
  it("reads a bare token, a flat JSON and a nested JSON, and reports field names only", () => {
    expect(findToken(jwt).token).toBe(jwt);
    expect(findToken(JSON.stringify({ access_token: jwt })).token).toBe(jwt);
    expect(findToken(JSON.stringify({ data: { personalApiToken: jwt, expiresIn: 3600 } })).token).toBe(jwt);
    const miss = findToken(JSON.stringify({ status: "ok", ttl: 3600 }));
    expect(miss.token).toBeUndefined();
    expect(miss.shape).toBe("fields: status, ttl");
    expect(findToken("").shape).toBe("empty");
  });
});
