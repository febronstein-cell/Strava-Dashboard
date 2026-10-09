import "server-only";
import { fetchAthlete, hasStravaCredentials, stravaGet } from "./client";
import { deleteById, getState, setState, toRow, upsertRows } from "./db";
import type { RawActivity } from "./types";

const DAY = 86_400_000;
const includePrivate = () => process.env.STRAVA_INCLUDE_PRIVATE === "true";

/**
 * Keeps the database up to date WITHOUT re-downloading the history:
 *  - syncRecent: one request for the latest activities (plus a 3-day overlap, to catch edits);
 *  - syncOne / deleteOne: one request when the Strava webhook reports a single activity.
 */

/** Saves the athlete (name, id, year the account was created) used by the page header. */
export async function syncAthlete(): Promise<void> {
  const a = await fetchAthlete();
  await setState(
    "athlete",
    JSON.stringify({
      id: a.id,
      name: a.name,
      avatar: a.avatar,
      createdYear: new Date(a.createdAt).getFullYear(),
    }),
  );
}

/**
 * Imports everything that started after the last sync (minus a 3-day overlap).
 * `minIntervalMs` makes repeated calls cheap: inside that window it does nothing.
 */
export async function syncRecent(opts: { minIntervalMs?: number } = {}): Promise<{ upserted: number; skipped: boolean }> {
  if (!hasStravaCredentials()) return { upserted: 0, skipped: true };
  const last = await getState("last_sync");
  if (opts.minIntervalMs && last && Date.now() - Date.parse(last) < opts.minIntervalMs) {
    return { upserted: 0, skipped: true };
  }

  const startedAt = new Date().toISOString();
  const after = Math.floor(((last ? Date.parse(last) : Date.now() - 30 * DAY) - 3 * DAY) / 1000);

  let upserted = 0;
  for (let page = 1; page <= 15; page++) {
    const batch = await stravaGet<RawActivity[]>(`/athlete/activities?after=${after}&per_page=200&page=${page}`);
    const keep: RawActivity[] = [];
    for (const raw of batch) {
      if (raw.private && !includePrivate()) await deleteById(raw.id); // turned private: take it down
      else keep.push(raw);
    }
    const rows = keep.map(toRow).filter((r): r is NonNullable<typeof r> => r !== null);
    if (rows.length) await upsertRows(rows);
    upserted += rows.length;
    if (batch.length < 200) break;
  }
  await setState("last_sync", startedAt);
  return { upserted, skipped: false };
}

/** One activity reported by the webhook: fetch it and save it (or remove it if it is gone/private). */
export async function syncOne(id: number): Promise<"saved" | "removed"> {
  let raw: RawActivity;
  try {
    raw = await stravaGet<RawActivity>(`/activities/${id}`);
  } catch (e) {
    if (e instanceof Error && /erro 404/.test(e.message)) {
      await deleteById(id);
      return "removed";
    }
    throw e;
  }
  if (raw.private && !includePrivate()) {
    await deleteById(id);
    return "removed";
  }
  const row = toRow(raw);
  if (!row) return "removed";
  await upsertRows([row]);
  return "saved";
}

export async function deleteOne(id: number): Promise<void> {
  await deleteById(id);
}
