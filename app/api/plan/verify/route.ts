import { type NextRequest } from "next/server";
import { clearCookie, hasSession, keyMatches, sessionCookie } from "@/lib/lab/plan-auth";

/**
 * POST with the key in x-plan-key: when it is right, unlocks this device for 30 days (signed httpOnly cookie).
 * GET: tells the page whether this device is unlocked. DELETE: locks it again.
 */
export async function POST(request: NextRequest) {
  if (!process.env.PLAN_EDIT_KEY) return Response.json({ error: "Editing is not set up: define PLAN_EDIT_KEY on the server." }, { status: 503 });
  if (!keyMatches(request)) {
    // slows down guessing
    await new Promise((r) => setTimeout(r, 700));
    return Response.json({ error: "Wrong key." }, { status: 401 });
  }
  return Response.json({ ok: true }, { headers: { "Set-Cookie": sessionCookie(), "Cache-Control": "no-store" } });
}

export async function GET(request: NextRequest) {
  return Response.json({ unlocked: hasSession(request) }, { headers: { "Cache-Control": "no-store" } });
}

export async function DELETE() {
  return Response.json({ ok: true }, { headers: { "Set-Cookie": clearCookie(), "Cache-Control": "no-store" } });
}
