#!/usr/bin/env node
/**
 * Checks the Supabase connection and that the tables from supabase/schema.sql exist.
 *   node --env-file=.env.local scripts/supabase-check.mjs
 * Prints counts only (never the keys).
 */
import { createClient } from "@supabase/supabase-js";

const raw = process.env.SUPABASE_URL;
const key = process.env.SUPABASE_SECRET_KEY;
if (!raw || !key) {
  console.error("Missing SUPABASE_URL / SUPABASE_SECRET_KEY in .env.local");
  process.exit(1);
}
const url = new URL(raw).origin; // tolerates the "/rest/v1/" suffix
const db = createClient(url, key, { auth: { persistSession: false } });

const tables = ["activities", "power_curve", "races", "training_weeks", "thresholds", "sync_state"];
let bad = 0;
for (const t of tables) {
  const { count, error } = await db.from(t).select("*", { count: "exact", head: true });
  if (error) {
    bad++;
    console.log(`✗ ${t.padEnd(15)} ${error.code ?? ""} ${error.message}`);
  } else {
    console.log(`✓ ${t.padEnd(15)} ${count} rows`);
  }
}
console.log(bad ? `\n${bad} table(s) with problems.` : "\nSupabase OK: connection and all tables are working.");
process.exit(bad ? 1 : 0);
