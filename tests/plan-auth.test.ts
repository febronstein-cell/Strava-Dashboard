import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { checkPlanKey, clearCookie, hasSession, keyMatches, PLAN_COOKIE, sessionCookie } from "@/lib/lab/plan-auth";

const req = (headers: Record<string, string> = {}) => new Request("https://example.test/api/plan", { headers });
const cookieOf = (setCookie: string) => setCookie.split(";")[0];

describe("planner unlock cookie", () => {
  beforeEach(() => {
    process.env.PLAN_EDIT_KEY = "a long test key";
    delete process.env.PLAN_COOKIE_SECRET;
  });
  afterEach(() => {
    delete process.env.PLAN_EDIT_KEY;
  });

  it("accepts the key in the header and nothing else", () => {
    expect(keyMatches(req({ "x-plan-key": "a long test key" }))).toBe(true);
    expect(keyMatches(req({ "x-plan-key": "123" }))).toBe(false);
    expect(keyMatches(req())).toBe(false);
  });

  it("a fresh cookie unlocks, is httpOnly and lasts 30 days, and never holds the key", () => {
    const set = sessionCookie();
    expect(set).toContain("HttpOnly");
    expect(set).toContain("Secure");
    expect(set).toContain(`Max-Age=${30 * 86400}`);
    expect(set).not.toContain("a long test key");
    expect(hasSession(req({ cookie: cookieOf(set) }))).toBe(true);
    expect(checkPlanKey(req({ cookie: cookieOf(set) }))).toBeNull();
  });

  it("a tampered or foreign cookie does not unlock", () => {
    const [name, value] = cookieOf(sessionCookie()).split("=");
    const [exp, fp, mac] = value.split(".");
    expect(hasSession(req({ cookie: `${name}=${Number(exp) + 999999}.${fp}.${mac}` }))).toBe(false);
    expect(hasSession(req({ cookie: `${PLAN_COOKIE}=garbage` }))).toBe(false);
    expect(checkPlanKey(req({ cookie: `${PLAN_COOKIE}=garbage` }))?.status).toBe(401);
  });

  it("changing the edit key locks every device", () => {
    const c = cookieOf(sessionCookie());
    process.env.PLAN_EDIT_KEY = "a different key";
    expect(hasSession(req({ cookie: c }))).toBe(false);
  });

  it("the lock cookie expires at once", () => {
    expect(clearCookie()).toContain("Max-Age=0");
  });

  it("without PLAN_EDIT_KEY nothing can write", () => {
    delete process.env.PLAN_EDIT_KEY;
    expect(checkPlanKey(req({ "x-plan-key": "" }))?.status).toBe(503);
  });
});
