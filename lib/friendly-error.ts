/**
 * Turns what the server (or the network) said into a sentence a person can act on. Pure: `t` is the page's translator,
 * so every message is available in English and Portuguese. The raw text is kept by the caller for the tooltip.
 */
export function friendlyError(t: (key: string, vars?: Record<string, string | number>) => string, raw: unknown): string {
  const m = String(raw ?? "").trim();
  if (/^(401|Locked)|unlock the planner|Locked: unlock/i.test(m)) return t("Editing is locked. Tap the lock at the top and enter the password.");
  if (/wrong (key|password)/i.test(m)) return t("Wrong password");
  const file = m.match(/schema-[\w-]+\.sql/i)?.[0];
  if (file || /does not exist|schema cache/i.test(m)) return file ? t("A one-time setup step is missing: run {file} in the Supabase SQL Editor.", { file }) : t("A one-time setup step is missing in the database.");
  if (/ANTHROPIC_API_KEY/i.test(m)) return t("Writing with AI is not set up on the server yet.");
  if (/PLAN_EDIT_KEY|not set up/i.test(m)) return t("Editing is not set up on the server yet.");
  if (/failed to fetch|network|load failed|abort/i.test(m)) return t("Could not reach the server. Check your connection and try again.");
  if (/^429|rate/i.test(m)) return t("Too many requests right now. Wait a minute and try again.");
  if (/^5\d\d|^Error 5|internal|bad gateway|timeout|did not answer/i.test(m)) return t("The server had a problem. Try again in a moment.");
  if (/invalid|out of range|check the times|goes from|invalid time/i.test(m)) return t("Some value is not valid. Check the numbers and try again.");
  if (/not complete yet/i.test(m)) return t("Fill in every day of the week (or mark it as a rest day) first.");
  return t("Something went wrong. Try again.");
}
