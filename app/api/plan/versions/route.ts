import { revalidateTag } from "next/cache";
import { type NextRequest } from "next/server";
import { checkContextRead, checkPlanKey } from "@/lib/lab/plan-auth";
import { linkedEvents } from "@/lib/plan-week-snapshot";
import { addDays, moveSession, swapDays, type PlanVersion } from "@/lib/lab/versions";
import { inWeek, readMoves, readVersion, readVersions, validWeek, writeRecord } from "@/lib/plan-versions-data";
import { getSupabase } from "@/lib/supabase";

/**
 * Plan B and C of a week. Needs the edit key. Body { action, ... }:
 * - create   { weekStart, label: "B" | "C", logEventId? (required for C), effectiveFrom? }  copies the active version into a draft
 * - update   { id, reason?, weekLabel?, targetHours?, logEventId?, effectiveFrom? }        drafts; the active one only takes weekLabel and targetHours
 * - activate { id, effectiveFrom, reason? (required for B) }                                the draft becomes active, the previous one superseded
 * - discard  { id }                                                                        removes a draft that was never active
 * - move     { weekStart, sessionId, toDay }                                               moves a session of the active version to another day
 * - swap     { weekStart, a, b }                                                           swaps two days of the active version
 * Answers with the versions and moves of the week.
 */
export async function POST(request: NextRequest) {
  const denied = checkPlanKey(request);
  if (denied) return denied;
  const b = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  const db = getSupabase();
  const bad = (error: string, status = 400) => Response.json({ error }, { status });
  const text = (v: unknown, max = 400) => (typeof v === "string" && v.trim() ? v.trim().slice(0, max) : null);

  let weekStart = typeof b.weekStart === "string" ? b.weekStart : "";
  let version: PlanVersion | null = null;
  if (typeof b.id === "number") {
    version = await readVersion(b.id);
    if (!version) return bad("Version not found.", 404);
    weekStart = version.weekStart;
  }
  if (!validWeek(weekStart)) return bad("Invalid week.");
  const versions = (await readVersions([weekStart]))[weekStart] ?? [];
  const active = versions.find((v) => v.status === "active") ?? null;

  switch (b.action) {
    case "create": {
      const label = b.label;
      if (label !== "B" && label !== "C") return bad("The label must be B or C.");
      if (!active) return bad("This week has no plan yet: fill in Plan A first.");
      const logEventId = typeof b.logEventId === "number" ? b.logEventId : null;
      if (label === "C" && !logEventId) return bad("Plan C needs a Log event.");
      const effectiveFrom = typeof b.effectiveFrom === "string" && inWeek(weekStart, b.effectiveFrom) ? b.effectiveFrom : null;
      const { error } = await db.from("plan_versions").insert({
        week_start: weekStart,
        label,
        status: "draft",
        parent_version_id: active.id,
        effective_from: effectiveFrom,
        log_event_id: logEventId,
        week_label: active.weekLabel,
        target_hours: active.targetHours,
        days: active.days,
      });
      if (error) return bad(error.message, 500);
      break;
    }
    case "update": {
      if (!version) return bad("Version not found.", 404);
      if (version.status === "superseded") return bad("This version is no longer in force and is read-only.", 409);
      const patch: Record<string, unknown> = {};
      if ("weekLabel" in b) patch.week_label = text(b.weekLabel, 60);
      if ("targetHours" in b) patch.target_hours = typeof b.targetHours === "number" && b.targetHours > 0 && b.targetHours < 60 ? b.targetHours : null;
      if (version.status === "draft") {
        if ("reason" in b) patch.reason = text(b.reason);
        if ("logEventId" in b) patch.log_event_id = typeof b.logEventId === "number" ? b.logEventId : null;
        if ("effectiveFrom" in b) patch.effective_from = typeof b.effectiveFrom === "string" && inWeek(weekStart, b.effectiveFrom) ? b.effectiveFrom : null;
      }
      const { error } = await db.from("plan_versions").update(patch).eq("id", version.id);
      if (error) return bad(error.message, 500);
      break;
    }
    case "activate": {
      if (!version || version.status !== "draft") return bad("Only a draft can be set as active.");
      const effectiveFrom = typeof b.effectiveFrom === "string" ? b.effectiveFrom : "";
      if (!inWeek(weekStart, effectiveFrom)) return bad("The effective-from date must be inside the week.");
      const reason = text(b.reason) ?? version.reason;
      if (version.label === "B" && !reason) return bad("Plan B needs a short reason.");
      if (version.label === "C" && !version.logEventId) return bad("Plan C needs a Log event.");
      // one active version per week: the current one is superseded first
      if (active) {
        const { error } = await db.from("plan_versions").update({ status: "superseded" }).eq("id", active.id);
        if (error) return bad(error.message, 500);
      }
      const { error } = await db.from("plan_versions").update({ status: "active", activated_at: new Date().toISOString(), effective_from: effectiveFrom, reason }).eq("id", version.id);
      if (error) {
        if (active) await db.from("plan_versions").update({ status: "active" }).eq("id", active.id);
        return bad(error.message, 500);
      }
      break;
    }
    case "discard": {
      if (!version || version.status !== "draft") return bad("Only a draft can be discarded.");
      const { error } = await db.from("plan_versions").delete().eq("id", version.id).eq("status", "draft");
      if (error) return bad(error.message, 500);
      break;
    }
    case "move":
    case "swap": {
      if (!active) return bad("This week has no active plan.");
      let days = active.days;
      let moved: { sessionId: string; from: number; to: number }[];
      if (b.action === "move") {
        const toDay = Number(b.toDay);
        const r = typeof b.sessionId === "string" ? moveSession(days, b.sessionId, toDay) : null;
        if (!r) return bad("That session cannot be moved there.");
        days = r.days;
        moved = [{ sessionId: b.sessionId as string, from: r.fromDay, to: toDay }];
      } else {
        const x = Number(b.a);
        const y = Number(b.b);
        if (!(x >= 0 && x <= 6 && y >= 0 && y <= 6) || x === y) return bad("Pick two different days.");
        const r = swapDays(days, x, y);
        days = r.days;
        moved = r.moved;
      }
      const { error } = await db.from("plan_versions").update({ days }).eq("id", active.id);
      if (error) return bad(error.message, 500);
      if (moved.length) await db.from("session_moves").insert(moved.map((m) => ({ plan_version_id: active.id, session_id: m.sessionId, from_date: addDays(weekStart, m.from), to_date: addDays(weekStart, m.to) })));
      break;
    }
    default:
      return bad("Unknown action.");
  }

  const fresh = (await readVersions([weekStart]))[weekStart] ?? [];
  if (b.action !== "create" && b.action !== "discard" && !(b.action === "update" && version?.status === "draft")) await writeRecord(weekStart, fresh);
  revalidateTag("strava-live", { expire: 0 });
  return Response.json({ ok: true, versions: fresh, moves: await readMoves(fresh.map((v) => v.id)) });
}

/**
 * GET /api/plan/versions: every version of every week, the session moves and the Log events behind Plan C (type,
 * status, date). For the planner after it is unlocked; the reasons can hold health details, so it is not public.
 */
export async function GET(request: NextRequest) {
  const denied = checkContextRead(request);
  if (denied) return denied;
  const byWeek = await readVersions();
  const all = Object.values(byWeek).flat();
  const events = await linkedEvents([...new Set(all.map((v) => v.logEventId).filter((x): x is number => x != null))]);
  return Response.json({ versions: byWeek, moves: await readMoves(all.map((v) => v.id)), events });
}
