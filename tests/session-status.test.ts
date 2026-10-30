import { describe, expect, it } from "vitest";
import { matchWeek } from "@/lib/compliance";
import { emptyDays } from "@/lib/lab/plan";
import type { PlanDay } from "@/lib/lab/types";
import { lostSessions, pickPlannedRef, plannedRef, reviewWeek, type StatusRow } from "@/lib/session-status";
import type { Activity } from "@/lib/strava/types";

const WEEK = "2026-10-26"; // Monday; Friday is Oct 30
const act = (id: number, date: string, sport: Activity["sport"], minutes: number, km = 0): Activity => ({ id, name: `a${id}`, sport, date, distance: km * 1000, movingTime: minutes * 55, elapsedTime: minutes * 60, elevation: 0 });

/** Friday Oct 30 as in the worked example: tempo run 1:25 (key), swim 1:10, easy bike 1:00. */
function plan(): PlanDay[] {
  const days = emptyDays();
  const fri = days[4].slots;
  fri[0] = { ...fri[0], name: "Tempo Run", description: "WU, 3x15 at threshold, CD", minutes: 85, km: 17, key: true };
  fri[1] = { ...fri[1], description: "easy spin", minutes: 60, km: 28 };
  fri[2] = { ...fri[2], description: "endurance 3k", minutes: 70, km: 3 };
  days[0].slots[0] = { ...days[0].slots[0], description: "easy run", minutes: 45, km: 8 };
  return days;
}
const todayAfter = "2026-10-31";

describe("the worked example from the Context Log", () => {
  // the run was cut to about 20 minutes; the swim and the bike were skipped
  const acts = [act(1, "2026-10-30T17:00:00", "run", 20, 3.5), act(2, "2026-10-26T07:00:00", "run", 45, 8)];
  const matched = matchWeek(plan(), WEEK, acts);

  it("by itself Strava already sees a partial run and two skipped sessions", () => {
    const r = reviewWeek(matched, {}, WEEK, todayAfter);
    const by = Object.fromEntries(r.sessions.filter((s) => s.date === "2026-10-30").map((s) => [s.entry.sport, s]));
    expect(by.run.state).toBe("partial");
    expect(by.run.percent).toBe(24); // 20 of 85 minutes
    expect(by.ride.state).toBe("skipped");
    expect(by.swim.state).toBe("skipped");
    expect(r.summary.keyLostSessions).toBe(1);
  });

  it("an override with a reason (from the Context Log) is kept and counts the lost volume", () => {
    const ref = (day: number, slot: number) => plannedRef(WEEK, day, slot);
    const rows: Record<string, StatusRow> = {
      [ref(4, 0)]: { plannedRef: ref(4, 0), date: "2026-10-30", sport: "run", status: "partial", percentDone: 24, reasonTag: "GI", eventId: 7, source: "ai" },
      [ref(4, 1)]: { plannedRef: ref(4, 1), date: "2026-10-30", sport: "ride", status: "skipped", percentDone: 0, reasonTag: "GI", eventId: 7, source: "ai" },
      [ref(4, 2)]: { plannedRef: ref(4, 2), date: "2026-10-30", sport: "swim", status: "skipped", percentDone: 0, reasonTag: "GI", eventId: 7, source: "ai" },
    };
    const r = reviewWeek(matched, rows, WEEK, todayAfter);
    const lost = lostSessions(r.sessions);
    expect(lost.map((s) => [s.entry.sport, s.lostMin, s.reasonTag, s.source])).toEqual([
      ["run", 65, "GI", "ai"], // 85 min planned, 20 done
      ["swim", 70, "GI", "ai"],
      ["ride", 60, "GI", "ai"],
    ].sort((a, b) => (b[1] as number) - (a[1] as number)));
    expect(r.summary.lostMin).toBe(195);
    expect(r.summary.keyLostMin).toBe(65); // the tempo run was the key session
    expect(r.summary.keyDone).toBe(0);
  });
});

describe("states", () => {
  it("a session ahead is pending and a manual change counts as done at the percent given", () => {
    const m = matchWeek(plan(), WEEK, [act(1, "2026-10-26T07:00:00", "run", 45, 8)]);
    const early = reviewWeek(m, {}, WEEK, "2026-10-27");
    expect(early.sessions.find((s) => s.date === "2026-10-30" && s.entry.sport === "run")?.state).toBe("pending");
    expect(early.sessions.find((s) => s.date === "2026-10-26")?.state).toBe("done");
    const ref = plannedRef(WEEK, 4, 0);
    const changed = reviewWeek(m, { [ref]: { plannedRef: ref, date: "2026-10-30", sport: "run", status: "changed", percentDone: 100, note: "swapped with the bike", source: "manual" } }, WEEK, todayAfter);
    const s = changed.sessions.find((x) => x.ref === ref)!;
    expect(s.state).toBe("changed");
    expect(s.lostMin).toBe(0);
    expect(s.note).toBe("swapped with the bike");
  });

  it("maps an event impact onto the planned entry of the day by sport", () => {
    const m = matchWeek(plan(), WEEK, []);
    const fri = m.find((d) => d.date === "2026-10-30")!;
    const taken = new Set<string>();
    expect(pickPlannedRef(fri, "run", 85, taken, WEEK)).toBe(plannedRef(WEEK, 4, 0));
    expect(pickPlannedRef(fri, "swim", null, taken, WEEK)).toBe(plannedRef(WEEK, 4, 2));
    expect(pickPlannedRef(fri, "strength", null, taken, WEEK)).toBeNull();
    taken.add(plannedRef(WEEK, 4, 0));
    expect(pickPlannedRef(fri, "run", 85, taken, WEEK)).toBeNull();
  });
});
