import "server-only";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

/**
 * Supabase client for the SERVER only (it uses the secret key, which bypasses Row Level Security).
 * Never import this from a client component.
 */

let client: SupabaseClient | null = null;

/** Accepts the project URL with or without the "/rest/v1/" suffix that the dashboard shows. */
export function supabaseUrl(): string | null {
  const raw = process.env.SUPABASE_URL?.trim();
  if (!raw) return null;
  try {
    return new URL(raw).origin;
  } catch {
    return null;
  }
}

export function hasSupabase(): boolean {
  return Boolean(supabaseUrl() && process.env.SUPABASE_SECRET_KEY);
}

export function getSupabase(): SupabaseClient {
  if (client) return client;
  const url = supabaseUrl();
  const key = process.env.SUPABASE_SECRET_KEY;
  if (!url || !key) throw new Error("Supabase is not configured (SUPABASE_URL / SUPABASE_SECRET_KEY).");
  client = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
  return client;
}
