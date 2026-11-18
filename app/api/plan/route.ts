import { revalidateTag } from "next/cache";
import { type NextRequest } from "next/server";
import { checkPlanKey } from "@/lib/lab/plan-auth";
import { sanitizeDays } from "@/lib/lab/plan";
import { firstVersionDays, withIds } from "@/lib/lab/versions";
import { readVersions, validWeek, writeRecord } from "@/lib/plan-versions-data";
import { getSupabase } from "@/lib/supabase";

/**
 * Saves the 7 days of one version of a planned week (the active one when no versionId is given; Plan A is created the
 * first time a week is saved). Superseded versions are read-only. Needs the edit key (cookie or header x-plan-key).
 */
export async function POST(request: NextRequest) {
  const denied = checkPlanKey(request);
  if (denied) return denied;

  const body = (await request.json().catch(() => null)) as { weekStart?: string; days?: unknown; versionId?: number } | null;
  const weekStart = body?.weekStart ?? "";
  const days = sanitizeDays(body?.days);
  if (!days || !validWeek(weekStart)) return Response.json({ error: "Invalid week." }, { status: 400 });

  const db = getSupabase();
  const versions = (await readVersions([weekStart]))[weekStart] ?? [];
  if (!versions.length) {
    const { error } = await db.from("plan_versions").insert({ week_start: weekStart, label: "A", status: "active", activated_at: new Date().toISOString(), effective_from: weekStart, days: firstVersionDays(days) });
    if (error) return Response.json({ error: error.message }, { status: 500 });
  } else {
    const v = body?.versionId ? versions.find((x) => x.id === body.versionId) : versions.find((x) => x.status === "active");
    if (!v) return Response.json({ error: "Version not found." }, { status: 404 });
    if (v.status === "superseded") return Response.json({ error: "This version is no longer in force and is read-only." }, { status: 409 });
    const { error } = await db.from("plan_versions").update({ days: withIds(days, `v${v.id}-`) }).eq("id", v.id);
    if (error) return Response.json({ error: error.message }, { status: 500 });
  }

  const fresh = (await readVersions([weekStart]))[weekStart] ?? [];
  await writeRecord(weekStart, fresh);
  revalidateTag("strava-live", { expire: 0 });
  return Response.json({ ok: true, versions: fresh });
}
