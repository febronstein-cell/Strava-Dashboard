import "server-only";
import { timingSafeEqual } from "node:crypto";

/**
 * The planner page can be read by anyone who finds it, but only a person with the edit key can save.
 * The key is PLAN_EDIT_KEY (set it on the server). Returns a ready error response, or null when the key is right.
 */
export function checkPlanKey(request: Request): Response | null {
  const expected = process.env.PLAN_EDIT_KEY;
  if (!expected) return Response.json({ error: "Editing is not set up: define PLAN_EDIT_KEY on the server." }, { status: 503 });
  const given = request.headers.get("x-plan-key") ?? "";
  const a = Buffer.from(given);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return Response.json({ error: "Wrong key." }, { status: 401 });
  return null;
}
