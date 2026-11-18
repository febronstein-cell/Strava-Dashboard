import { describe, expect, it } from "vitest";
import { matchWeek } from "@/lib/compliance";
import { emptyDays, slotFilled, totals } from "@/lib/lab/plan";
import type { PlanDay, PlanSlot } from "@/lib/lab/types";
import { changeFromA, firstVersionDays, intensityToEasy, moveSession, recordDays, swapDays, tabNames, versionOn, withIds, type PlanVersion } from "@/lib/lab/versions";
import { reviewWeek } from "@/lib/session-status";
import type { Activity } from "@/lib/strava/types";

const WEEK = "2026-11-16"; // Monday
const put = (days: PlanDay[], day: number, s: Partial<PlanSlot> & Pick<PlanSlot, "sport">) => {
  const slots = days[day].slots;
  const free = slots.findIndex((x) => x.sport === s.sport && !slotFilled(x));
  const slot = { description: "", minutes: null, km: null, ...s };
  if (free >= 0) slots[free] = slot;
  else slots.push(slot);
};

/** A week shaped like Nov 16-22: tests midweek, a key brick on Saturday, a long run on Sunday. */
function planA(): PlanDay[] {
  const d = emptyDays();
  put(d, 0, { sport: "run", name: "Easy 40' + Strides", minutes: 40, km: 7.6 });
  put(d, 0, { sport: "swim", name: "PM Easy Buoy 2.2k", minutes: 45, km: 2.4 });
  put(d, 1, { sport: "run", name: "Z2 60'", minutes: 60, km: 12.8 });
  put(d, 1, { sport: "swim", name: "Aerobic Pull 6x400", minutes: 60, km: 3.5 });
  put(d, 2, { sport: "run", name: "3K TEST (treadmill)", minutes: 45, km: 10 });
  put(d, 2, { sport: "ride", name: "Z2 2h Aero + Cadence", minutes: 120, km: 74 });
  put(d, 3, { sport: "ride", name: "FTP test", minutes: 55, km: 38 });
  put(d, 3, { sport: "swim", name: "CSS TEST 400/200", minutes: 50, km: 2.4 });
  put(d, 4, { sport: "run", name: "5K TEST (treadmill)", minutes: 48, km: 11.2 });
  put(d, 4, { sport: "ride", name: "Recovery 75'", minutes: 75, km: 40 });
  put(d, 5, { sport: "ride", name: "KEY BRICK Bike 2h30", minutes: 150, km: 98, key: true });
  put(d, 5, { sport: "run", name: "KEY BRICK 10K Strong", minutes: 53, km: 12.5, key: true });
  put(d, 6, { sport: "run", name: "Long Run 2h", minutes: 120, km: 24.5 });
  return firstVersionDays(d);
}

/** Plan C from Wednesday: the day off, then short Z1/Z2 sessions, no tests, no brick. */
function planC(a: PlanDay[]): PlanDay[] {
  const d = a.map((x) => ({ ...x, slots: x.slots.map((s) => ({ ...s })) }));
  const clear = (day: number) => (d[day] = { day, slots: emptyDays()[day].slots });
  clear(2);
  d[2].rest = true;
  for (const day of [3, 4, 5, 6]) clear(day);
  put(d, 3, { sport: "ride", name: "Easy Z1 45'", minutes: 45, km: 20 });
  put(d, 4, { sport: "run", name: "Easy Z1 30'", minutes: 30, km: 5 });
  put(d, 5, { sport: "ride", name: "Z2 60'", minutes: 60, km: 30 });
  put(d, 6, { sport: "run", name: "Z2 45'", minutes: 45, km: 8 });
  return withIds(d, "c");
}

const version = (v: Partial<PlanVersion> & Pick<PlanVersion, "id" | "label" | "status" | "days">): PlanVersion => ({
  weekStart: WEEK,
  parentId: null,
  createdAt: `2026-11-1${v.id}T08:00:00Z`,
  activatedAt: null,
  effectiveFrom: null,
  reason: null,
  logEventId: null,
  weekLabel: null,
  targetHours: null,
  ...v,
});

const a = planA();
const A = version({ id: 1, label: "A", status: "superseded", days: a, activatedAt: "2026-11-16T00:00:00Z", effectiveFrom: WEEK });
const C = version({ id: 2, label: "C", status: "active", days: planC(a), parentId: 1, activatedAt: "2026-11-18T14:00:00Z", effectiveFrom: "2026-11-18", logEventId: 3 });
const act = (id: number, date: string, sport: Activity["sport"], minutes: number): Activity => ({ id, name: `a${id}`, sport, date, distance: 0, movingTime: minutes * 58, elapsedTime: minutes * 60, elevation: 0 });

describe("migration to Plan A", () => {
  it("keeps every session and gives each one an id", () => {
    const flat = a.flatMap((d) => d.slots.filter(slotFilled));
    expect(flat).toHaveLength(13);
    expect(new Set(flat.map((s) => s.id)).size).toBe(13);
    expect(totals(a).hours).toBeCloseTo(921 / 60, 5);
  });
});

describe("plan of record", () => {
  const rec = recordDays([A, C], WEEK);

  it("Mon and Tue come from Plan A, Wed to Sun from Plan C", () => {
    expect(rec.from.map((v) => v?.label)).toEqual(["A", "A", "C", "C", "C", "C", "C"]);
  });

  it("Wednesday is not missed: it is a rest day of Plan C", () => {
    const acts = [act(1, "2026-11-16T07:00:00", "run", 40), act(2, "2026-11-16T18:00:00", "swim", 45), act(3, "2026-11-17T07:00:00", "run", 60), act(4, "2026-11-17T18:00:00", "swim", 60)];
    const r = reviewWeek(matchWeek(rec.days, WEEK, acts), {}, WEEK, "2026-11-19");
    expect(r.sessions.filter((s) => s.date === "2026-11-18")).toHaveLength(0);
    expect(r.sessions.filter((s) => s.date <= "2026-11-17").every((s) => s.state === "done")).toBe(true);
    // the 3K test of Plan A is nowhere in the review
    expect(r.sessions.some((s) => s.entry.name?.includes("3K"))).toBe(false);
  });

  it("the totals follow Plan C from Wednesday", () => {
    expect(totals(rec.days).hours).toBeCloseTo((40 + 45 + 60 + 60 + 45 + 30 + 60 + 45) / 60, 5);
  });

  it("a drafted version never counts", () => {
    const draft = version({ id: 3, label: "B", status: "draft", days: emptyDays() });
    expect(recordDays([A, C, draft], WEEK).from.map((v) => v?.id)).toEqual(rec.from.map((v) => v?.id));
  });

  it("a switch made later but effective earlier (backdated) still covers the days from its date", () => {
    const late = { ...C, activatedAt: "2026-11-20T09:00:00Z" };
    expect(versionOn([A, late], "2026-11-18")?.label).toBe("C");
    expect(versionOn([A, late], "2026-11-17")?.label).toBe("A");
  });
});

describe("change from Plan A", () => {
  const c = changeFromA([A, C], WEEK);

  it("lists the tests and the brick as taken out of the week", () => {
    const removed = c.sessions.filter((s) => s.kind === "removed").map((s) => s.name);
    for (const n of ["3K TEST (treadmill)", "CSS TEST 400/200", "FTP test", "5K TEST (treadmill)", "KEY BRICK Bike 2h30", "KEY BRICK 10K Strong"]) expect(removed).toContain(n);
    expect(c.sessions.find((s) => s.name === "FTP test")?.key).toBe(true);
  });

  it("counts the hours removed and keeps the switch with its date", () => {
    expect(c.hoursA - c.hoursNow).toBeCloseTo((921 - 385) / 60, 5);
    expect(c.switches).toEqual([{ versionId: 2, label: "C", effectiveFrom: "2026-11-18", reason: null, logEventId: 3 }]);
    expect(c.changed).toBe(true);
  });

  it("Mon and Tue are unchanged", () => {
    expect(c.sessions.filter((s) => s.dayA <= 1)).toHaveLength(0);
  });

  it("a week that never left Plan A has no change", () => {
    expect(changeFromA([{ ...A, status: "active" }], WEEK).changed).toBe(false);
  });
});

describe("changes inside a plan", () => {
  it("a move keeps the session and its id, on the new day", () => {
    const id = a[6].slots.find((s) => s.name === "Long Run 2h")!.id!;
    const r = moveSession(a, id, 5)!;
    expect(r.fromDay).toBe(6);
    expect(r.days[6].slots.some((s) => s.id === id)).toBe(false);
    expect(r.days[5].slots.filter((s) => s.id === id)).toHaveLength(1);
    expect(totals(r.days).hours).toBeCloseTo(totals(a).hours, 5);
    // a move inside Plan A is not a change of plan
    expect(changeFromA([{ ...A, status: "active", days: r.days }], WEEK).changed).toBe(false);
    // the same session moved in a later version reads as moved, not removed
    const later = version({ id: 5, label: "B", status: "active", days: r.days, activatedAt: "2026-11-17T08:00:00Z", effectiveFrom: WEEK });
    expect(changeFromA([A, later], WEEK).sessions.map((s) => s.kind)).toEqual(["moved"]);
  });

  it("swapping two days moves every session of both", () => {
    const r = swapDays(a, 0, 1);
    expect(r.days[0].slots.filter(slotFilled).map((s) => s.name)).toEqual(["Z2 60'", "Aerobic Pull 6x400"]);
    expect(r.moved).toHaveLength(4);
  });

  it("Convert intensity to Z1 touches only key or hard sessions from that day", () => {
    const r = intensityToEasy(a, 2, 40);
    expect(r.days[0]).toBe(a[0]);
    const names = r.days.flatMap((d) => d.slots.filter(slotFilled).map((s) => s.name));
    expect(names.filter((n) => /TEST|BRICK|FTP/.test(n ?? ""))).toHaveLength(0);
    expect(names).toContain("Long Run 2h");
    expect(r.changed).toBe(6);
  });

  it("new sessions get ids that do not clash with the copied ones", () => {
    const d = a.map((x) => ({ ...x, slots: x.slots.map((s) => ({ ...s })) }));
    put(d, 0, { sport: "strength", name: "Gym", minutes: 30 });
    const ids = withIds(d, "v9-").flatMap((x) => x.slots.filter(slotFilled).map((s) => s.id));
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("names a second Plan C as C2", () => {
    const C2 = version({ id: 4, label: "C", status: "draft", days: emptyDays(), createdAt: "2026-11-21T08:00:00Z" });
    expect(tabNames([A, C, C2])).toEqual({ 1: "A", 2: "C", 4: "C2" });
  });
});
