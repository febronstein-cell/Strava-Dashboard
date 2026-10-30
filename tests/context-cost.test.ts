import { describe, expect, it } from "vitest";
import { eventCost, findPatterns } from "@/lib/context-cost";
import { sanitizeDraft, noEmDash } from "@/lib/context-interpret";
import type { CtxEvent, CtxFollowup } from "@/lib/context-signal";
import type { StatusRow } from "@/lib/session-status";

const ev = (id: number, startDate: string, tags: string[], status: CtxEvent["status"] = "open", type: CtxEvent["type"] = "GI"): CtxEvent => ({ id, type, severity: 4, tags, startDate, status });
const row = (ref: string, status: StatusRow["status"], pct: number, eventId = 1): StatusRow => ({ plannedRef: ref, date: "2026-10-30", sport: "run", status, percentDone: pct, eventId, source: "ai" });

describe("what an event cost", () => {
  const statuses = [row("w:4:0", "partial", 24), row("w:4:1", "skipped", 0), row("w:4:2", "skipped", 0), row("w:0:0", "partial", 50, 99)];
  const minutes = { "w:4:0": 85, "w:4:1": 60, "w:4:2": 70 };
  it("counts the sessions, the minutes and the key sessions lost, and the days to recover once closed", () => {
    const fus: CtxFollowup[] = [1, 2, 3].map((n, i) => ({ eventId: 1, date: `2026-11-0${n}`, score: [5, 9, 10][i], trend: "better", redFlags: [] }));
    const open = eventCost(ev(1, "2026-10-30", []), fus, statuses, minutes, new Set(["w:4:0"]));
    expect(open).toEqual({ sessionsLost: 3, minutesLost: 65 + 60 + 70, keySessionsLost: 1, daysToRecover: null });
    const closed = eventCost(ev(1, "2026-10-30", [], "closed"), fus, statuses, minutes, new Set(["w:4:0"]));
    expect(closed.daysToRecover).toBe(3); // first day at 9 or better: Nov 2, three days after Oct 30
  });
});

describe("patterns", () => {
  it("needs two events of the same type that share a tag", () => {
    expect(findPatterns([ev(1, "2026-10-30", ["post-gym"])])).toEqual([]);
    const p = findPatterns([ev(1, "2026-10-30", ["post-gym", "meal"]), ev(2, "2026-11-12", ["post-gym"], "closed"), ev(3, "2026-11-14", ["post-gym"], "closed", "illness")]);
    expect(p).toHaveLength(1);
    expect(p[0]).toMatchObject({ type: "GI", tag: "post-gym", eventIds: [1, 2], dates: ["2026-10-30", "2026-11-12"] });
  });
});

describe("the draft is cleaned", () => {
  it("clamps the ranges, drops unknown references and never keeps an em dash", () => {
    const d = sanitizeDraft(
      {
        events: [{ type: "GI", bodyArea: "Stomach", severity: 9, causeStated: "acai — before the run", tags: ["Post-Gym", "meal"], onset: "2026-10-30T16:10", end: "nonsense", summary: "Two urgent bathroom trips — stopped" }],
        impacts: [
          { eventIndex: 0, plannedRef: "w:4:0", sport: "run", status: "partial", percentDone: 240, reasonTag: "GI", note: "stopped", plannedMinutes: 85 },
          { eventIndex: 5, plannedRef: "not:a:ref", sport: "swim", status: "skipped", percentDone: 70, reasonTag: "weird", note: "", plannedMinutes: 70 },
        ],
      },
      ["w:4:0"],
    );
    expect(d.events[0]).toMatchObject({ type: "GI", bodyArea: "stomach", severity: 5, tags: ["post-gym", "meal"], onset: "2026-10-30T16:10", end: "" });
    expect(d.events[0].causeStated).toBe("acai, before the run");
    expect(d.events[0].summary).not.toContain("—");
    expect(d.impacts[0]).toMatchObject({ plannedRef: "w:4:0", status: "partial", percentDone: 100 });
    expect(d.impacts[1]).toMatchObject({ plannedRef: "", status: "skipped", percentDone: 0, reasonTag: "other", eventIndex: 0 });
    expect(noEmDash("a — b")).toBe("a, b");
  });
  it("an empty or broken answer is an empty draft", () => {
    expect(sanitizeDraft(null)).toEqual({ events: [], impacts: [] });
    expect(sanitizeDraft({ events: "x" })).toEqual({ events: [], impacts: [] });
  });
});
