#!/usr/bin/env node
/**
 * Copies data/records.json (the power curve) into the Supabase table "power_curve".
 *
 *   node --env-file=.env.local scripts/power-to-db.mjs
 *
 * Uses plain fetch (no packages), so it also runs in the GitHub Action. Without SUPABASE_URL /
 * SUPABASE_SECRET_KEY it does nothing and exits normally.
 */
import fs from "node:fs";

const e = process.env;
if (!e.SUPABASE_URL || !e.SUPABASE_SECRET_KEY) {
  console.log("Supabase is not configured here; skipping the power_curve update.");
  process.exit(0);
}

const records = JSON.parse(fs.readFileSync("data/records.json", "utf8"));
const rows = Object.entries(records.power ?? {}).map(([duration, p]) => ({
  duration_s: Number(duration),
  watts: p.watts,
  activity_id: p.id ?? null,
  activity_name: p.name ?? null,
  activity_date: p.date ? String(p.date).replace("Z", "") : null,
  indoor: !!p.indoor,
  updated_at: new Date().toISOString(),
}));
if (rows.length === 0) {
  console.log("data/records.json has no power values yet; nothing to copy.");
  process.exit(0);
}

const origin = new URL(e.SUPABASE_URL).origin;
const res = await fetch(`${origin}/rest/v1/power_curve?on_conflict=duration_s`, {
  method: "POST",
  headers: {
    apikey: e.SUPABASE_SECRET_KEY,
    "Content-Type": "application/json",
    Prefer: "resolution=merge-duplicates,return=minimal",
  },
  body: JSON.stringify(rows),
});
if (!res.ok) {
  console.error(`Supabase answered ${res.status}: ${await res.text()}`);
  process.exit(1);
}
console.log(`power_curve updated: ${rows.length} durations.`);
