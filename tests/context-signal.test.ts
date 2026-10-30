import { describe, expect, it } from "vitest";
import { readiness, type Checkin } from "@/lib/checkin";
import { dueFollowups, eventLabel, eventSignal, finalSignal, levelOfAnswer, openDays, reasonLine, shouldClose, type CtxEvent, type CtxFollowup } from "@/lib/context-signal";

/** The worked example: GI event on Fri Oct 30, written as severity 4. */
const gi: CtxEvent = { id: 1, type: "GI", bodyArea: "stomach", severity: 4, causeStated: "acai before running", tags: ["post-gym", "before-run"], startDate: "2026-10-30", status: "open" };
const fu = (date: string, score: number, trend: CtxFollowup["trend"] = "same", redFlags: CtxFollowup["redFlags"] = []): CtxFollowup => ({ eventId: 1, date, score, trend, redFlags });
const t = (k: string, v?: Record<string, string | number>) => (v ? k.replace(/\{(\w+)\}/g, (_, n) => String(v[n])) : k);

describe("the day of the event and the next morning's question", () => {
  it("severity 4 turns the day yellow before any answer; severity 5 red; 1 to 3 nothing", () => {
    expect(eventSignal([gi], [], "2026-10-30").signal).toBe("yellow");
    expect(eventSignal([{ ...gi, severity: 5 }], [], "2026-10-30").signal).toBe("red");
    expect(eventSignal([{ ...gi, severity: 3 }], [], "2026-10-30").signal).toBeNull();
  });

  it("the next morning asks about the open event, and only that day", () => {
    expect(dueFollowups([gi], [], "2026-10-30")).toHaveLength(0);
    expect(dueFollowups([gi], [], "2026-10-31").map((e) => e.id)).toEqual([1]);
    expect(dueFollowups([gi], [fu("2026-10-31", 6)], "2026-10-31")).toHaveLength(0);
    expect(dueFollowups([{ ...gi, status: "closed" }], [], "2026-10-31")).toHaveLength(0);
  });

  it("the question names the body area", () => {
    expect(eventLabel(gi)).toBe("stomach");
    expect(eventLabel({ type: "illness" })).toBe("illness");
    expect(eventLabel({ type: "GI", bodyArea: "other" })).toBe("stomach");
  });
});

describe("answers and the signal", () => {
  it("9 or 10 and not worse: no change", () => {
    expect(eventSignal([gi], [fu("2026-10-31", 9)], "2026-10-31").signal).toBeNull();
    expect(eventSignal([gi], [fu("2026-10-31", 10, "better")], "2026-10-31").signal).toBeNull();
  });
  it("7 or 8: green, with a note to cap the next key session", () => {
    const r = eventSignal([gi], [fu("2026-10-31", 8)], "2026-10-31");
    expect(r.signal).toBe("green");
    expect(r.reasons[0]).toMatchObject({ level: "note", text: "{area} recovery is {score}/10: cap the intensity of the next key session" });
  });
  it("5 out of 10 turns the signal yellow, with the reason line", () => {
    const r = eventSignal([gi], [fu("2026-10-31", 5)], "2026-10-31");
    expect(r.signal).toBe("yellow");
    expect(reasonLine(t, "yellow", r.reasons[0], () => "Oct 30")).toBe("Yellow because stomach recovery is 5/10 after the Oct 30 event.");
  });
  it("4 to 6 or a worsening trend: yellow; even at 8", () => {
    expect(eventSignal([gi], [fu("2026-10-31", 4)], "2026-10-31").signal).toBe("yellow");
    expect(eventSignal([gi], [fu("2026-10-31", 6)], "2026-10-31").signal).toBe("yellow");
    expect(eventSignal([gi], [fu("2026-10-31", 8, "worse")], "2026-10-31").signal).toBe("yellow");
  });
  it("1 to 3: red", () => {
    expect(eventSignal([gi], [fu("2026-10-31", 2)], "2026-10-31").signal).toBe("red");
    expect(eventSignal([gi], [fu("2026-10-31", 3)], "2026-10-31").signal).toBe("red");
  });
  it("a red flag forces red and the medical message, whatever the score", () => {
    const r = eventSignal([gi], [fu("2026-10-31", 9, "better", ["blood"])], "2026-10-31");
    expect(r.signal).toBe("red");
    expect(r.medical).toBe(true);
    expect(levelOfAnswer(10, "better", ["fever"]).signal).toBe("red");
  });
  it("no answer today: the latest earlier answer still counts", () => {
    expect(eventSignal([gi], [fu("2026-10-31", 6)], "2026-11-01").signal).toBe("yellow");
  });
  it("after 5 open days it suggests seeing a doctor", () => {
    expect(openDays(gi, "2026-10-30")).toBe(1);
    const r = eventSignal([gi], [fu("2026-11-03", 7)], "2026-11-03");
    expect(r.reasons.some((x) => x.text.includes("consider seeing a doctor"))).toBe(true);
    expect(eventSignal([gi], [fu("2026-11-02", 7)], "2026-11-02").reasons.some((x) => x.text.includes("doctor"))).toBe(false);
  });
});

describe("closing", () => {
  it("9 on two consecutive days closes the event; one 9 or a gap does not", () => {
    expect(shouldClose([fu("2026-11-01", 9), fu("2026-11-02", 10)])).toBe(true);
    expect(shouldClose([fu("2026-11-01", 9)])).toBe(false);
    expect(shouldClose([fu("2026-11-01", 9), fu("2026-11-03", 9)])).toBe(false);
    expect(shouldClose([fu("2026-11-01", 9), fu("2026-11-02", 8)])).toBe(false);
    expect(shouldClose([fu("2026-11-01", 9), fu("2026-11-02", 9, "worse")])).toBe(false);
  });
  it("a closed event stops affecting the signal, which goes back to the check-in rules", () => {
    expect(eventSignal([{ ...gi, status: "closed" }], [], "2026-11-02").signal).toBeNull();
  });
});

describe("combining with the check-in: only keep or lower", () => {
  const base = (c: Partial<Checkin>) => readiness({ day: "2026-10-31", pain: [], sources: {}, ...c }, []);
  it("an event never raises a red check-in, and lowers a green one", () => {
    const red = base({ sleepHours: 5, legs: 4 });
    expect(red?.signal).toBe("red");
    expect(finalSignal(red, eventSignal([gi], [fu("2026-10-31", 10)], "2026-10-31")).signal).toBe("red");
    const green = base({ sleepHours: 8.5, legs: 4 });
    expect(green?.signal).toBe("green");
    const low = finalSignal(green, eventSignal([gi], [fu("2026-10-31", 5)], "2026-10-31"));
    expect(low.signal).toBe("yellow");
    expect(low.lowered).toBe(true);
  });
  it("yellow check-in plus a score of 2 is red; the worst wins", () => {
    const yellow = base({ sleepHours: 7, legs: 4 });
    expect(yellow?.signal).toBe("yellow");
    expect(finalSignal(yellow, eventSignal([gi], [fu("2026-10-31", 2)], "2026-10-31")).signal).toBe("red");
  });
  it("with no check-in, the event can still ask for a signal", () => {
    expect(finalSignal(null, eventSignal([gi], [fu("2026-10-31", 5)], "2026-10-31")).signal).toBe("yellow");
    expect(finalSignal(null, eventSignal([], [], "2026-10-31")).signal).toBeNull();
  });
});
