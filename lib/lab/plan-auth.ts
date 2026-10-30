import "server-only";
import { createHash, createHmac, timingSafeEqual } from "node:crypto";

/**
 * Write access to the planner (and every other write action of the Lab).
 *
 * The key is PLAN_EDIT_KEY (set on the server). Typing it once in the planner sets a signed, httpOnly cookie valid for
 * 30 days, so the device stays unlocked; the key itself never stays in the browser. The cookie is signed with
 * PLAN_COOKIE_SECRET (or, when that is not set, a secret derived from the key) and also carries a fingerprint of the
 * key, so changing PLAN_EDIT_KEY locks every device at once. Scripts can still send the key in the x-plan-key header.
 */

export const PLAN_COOKIE = "tef_plan";
const MAX_AGE_S = 30 * 86_400;

const editKey = () => process.env.PLAN_EDIT_KEY ?? "";
const secret = () => process.env.PLAN_COOKIE_SECRET || `cookie:${editKey()}`;
const fingerprint = () => createHash("sha256").update(editKey()).digest("base64url").slice(0, 12);
const sign = (payload: string) => createHmac("sha256", secret()).update(payload).digest("base64url");

function safeEqual(a: string, b: string): boolean {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}

function readCookie(request: Request, name: string): string | null {
  const raw = request.headers.get("cookie") ?? "";
  for (const part of raw.split(";")) {
    const i = part.indexOf("=");
    if (i > 0 && part.slice(0, i).trim() === name) return decodeURIComponent(part.slice(i + 1).trim());
  }
  return null;
}

/** True when the key sent in the x-plan-key header is the right one. */
export function keyMatches(request: Request): boolean {
  const expected = editKey();
  return Boolean(expected) && safeEqual(request.headers.get("x-plan-key") ?? "", expected);
}

/** True when the request carries a valid, unexpired unlock cookie. */
export function hasSession(request: Request): boolean {
  if (!editKey()) return false;
  const token = readCookie(request, PLAN_COOKIE);
  if (!token) return false;
  const [exp, fp, mac] = token.split(".");
  if (!exp || !fp || !mac) return false;
  if (!safeEqual(mac, sign(`${exp}.${fp}`))) return false;
  return fp === fingerprint() && Number(exp) * 1000 > Date.now();
}

/** Set-Cookie value that unlocks this device for 30 days. */
export function sessionCookie(): string {
  const exp = Math.floor(Date.now() / 1000) + MAX_AGE_S;
  const payload = `${exp}.${fingerprint()}`;
  return `${PLAN_COOKIE}=${payload}.${sign(payload)}; Path=/; Max-Age=${MAX_AGE_S}; HttpOnly; Secure; SameSite=Lax`;
}

/** Set-Cookie value that locks the device again. */
export const clearCookie = () => `${PLAN_COOKIE}=; Path=/; Max-Age=0; HttpOnly; Secure; SameSite=Lax`;

/**
 * Read access to the Context Log: a device unlocked with the password (cookie), the edit key in x-plan-key, OR the
 * separate read-only token CONTEXT_READ_TOKEN in x-context-token (so the scheduled nightly review can read without the
 * edit key). The token can never write: every write route checks checkPlanKey only.
 */
export function checkContextRead(request: Request): Response | null {
  const token = process.env.CONTEXT_READ_TOKEN;
  const given = request.headers.get("x-context-token") ?? "";
  if (token && token.length >= 16 && given && safeEqual(given, token)) return null;
  if (!editKey() && !(token && token.length >= 16)) return Response.json({ error: "Reading is not set up: define PLAN_EDIT_KEY or CONTEXT_READ_TOKEN on the server." }, { status: 503 });
  if (editKey() && (hasSession(request) || keyMatches(request))) return null;
  return Response.json({ error: "Locked: unlock the planner with the edit key." }, { status: 401 });
}

/** A ready error response, or null when the request may write (valid cookie or right key). */
export function checkPlanKey(request: Request): Response | null {
  if (!editKey()) return Response.json({ error: "Editing is not set up: define PLAN_EDIT_KEY on the server." }, { status: 503 });
  if (hasSession(request) || keyMatches(request)) return null;
  return Response.json({ error: "Locked: unlock the planner with the edit key." }, { status: 401 });
}
