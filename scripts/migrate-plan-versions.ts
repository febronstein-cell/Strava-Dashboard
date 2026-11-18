/**
 * One-off: every planned week becomes Plan A (active, effective from its Monday). training_weeks is not touched.
 * Run with: npx vite-node scripts/migrate-plan-versions.ts  (add --dry to only print what would be written)
 * Skips weeks that already have versions, then checks that every session of every week is identical in Plan A.
 */
import fs from "node:fs";
import { createClient } from "@supabase/supabase-js";
import { sanitizeDays, slotFilled, totals } from "../lib/lab/plan";
import { firstVersionDays } from "../lib/lab/versions";
import type { PlanDay } from "../lib/lab/types";

const env = Object.fromEntries(
  fs
    .readFileSync(".env.local", "utf8")
    .split(/\r?\n/)
    .filter((l) => /^[A-Z_]+=/.test(l))
    .map((l) => [l.slice(0, l.indexOf("=")), l.slice(l.indexOf("=") + 1).replace(/^"|"$/g, "")]),
);
const db = createClient(new URL(env.SUPABASE_URL.trim()).origin, env.SUPABASE_SECRET_KEY, { auth: { persistSession: false } });
const dry = process.argv.includes("--dry");

/** Everything of a session except its id, to compare before and after. */
const fingerprint = (days: PlanDay[]) =>
  JSON.stringify(days.map((d) => ({ day: d.day, rest: Boolean(d.rest), slots: d.slots.filter(slotFilled).map(({ id: _id, ...s }) => (void _id, s)) })));

const { data: weeks, error } = await db.from("training_weeks").select("week_start,title,planned_sessions");
if (error) throw error;
const { data: existing } = await db.from("plan_versions").select("week_start");
const have = new Set((existing ?? []).map((r) => String(r.week_start).slice(0, 10)));

for (const w of weeks ?? []) {
  const start = String(w.week_start).slice(0, 10);
  const days = sanitizeDays(w.planned_sessions);
  if (!days) {
    console.log(start, "no planner days: skipped");
    continue;
  }
  if (have.has(start)) {
    console.log(start, "already has versions: skipped");
    continue;
  }
  const a = firstVersionDays(days);
  if (fingerprint(a) !== fingerprint(days)) throw new Error(`${start}: Plan A differs from the week`);
  const t = totals(a);
  console.log(start, `${t.sessions} sessions, ${t.hours.toFixed(2)} h, ${t.km.toFixed(1)} km`);
  if (dry) continue;
  const { error: e } = await db.from("plan_versions").insert({ week_start: start, label: "A", status: "active", activated_at: `${start}T00:00:00Z`, effective_from: start, days: a });
  if (e) throw e;
}

// check: each week against its Plan A
if (!dry) {
  const { data: vs } = await db.from("plan_versions").select("week_start,days").eq("label", "A");
  let ok = 0;
  for (const w of weeks ?? []) {
    const days = sanitizeDays(w.planned_sessions);
    if (!days) continue;
    const v = (vs ?? []).find((x) => String(x.week_start).slice(0, 10) === String(w.week_start).slice(0, 10));
    const a = v && sanitizeDays(v.days);
    if (!a || fingerprint(a) !== fingerprint(days)) throw new Error(`${w.week_start}: check failed`);
    ok++;
  }
  console.log(`check passed: ${ok} weeks identical`);
}
