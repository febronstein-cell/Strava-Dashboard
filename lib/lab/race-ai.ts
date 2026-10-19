import "server-only";
import { siteConfig } from "@/site.config";
import { stravaGet } from "@/lib/strava/client";
import { getSupabase } from "@/lib/supabase";
import { BILINGUAL_SCHEMA, hasAnthropic, writeJson } from "./ai";
import { labelContext } from "./labeling";
import { detectRaceDays, groupRace, type RaceFormat } from "./race-group";
import { raceFacts, summarizeLaps, type RawLap } from "./race-stats";
import type { RaceAnalysisStored } from "./types";

const FORMAT_LABEL: Record<RaceFormat, string> = { sprint: "Sprint", olympic: "Olympic", "70.3": "Ironman 70.3", ironman: "Ironman" };

/** Race analysis: Sonnet 5.5 at low effort (one text per race, a couple of cents). LAB_RACE_MODEL overrides it. */
const RACE_MODEL = process.env.LAB_RACE_MODEL || "claude-sonnet-5-5";

const SYSTEM = `You are an endurance-sport scientist and coach writing the post-race analysis of ONE complete triathlon for a junior triathlete.

Rules:
- Use ONLY the numbers you are given. Never invent weather, nutrition, sleep, feelings, positions or what happened inside a leg.
- Cover, in this order: (1) the whole race: total time and how it was shared between swim, T1, bike, T2 and run (a typical 70.3 splits roughly 10-12% swim, 48-52% bike, 32-36% run); (2) swim (judge the pace on the OFFICIAL distance: open-water GPS is rarely exact); (3) bike: intensity against FTP and W/kg, evenness (first half vs second half), heart rate; (4) run: pacing (first half vs second half, positive or negative split), heart-rate drift, how it relates to the bike effort; (5) transitions; (6) the single biggest limiter and two concrete things to work on before the next race.
- Be direct, specific and encouraging; no hype, no emojis, no medical advice. 200 to 280 words, plain text paragraphs, no markdown headings.
- Format numbers for people: times as h:mm:ss or m:ss, paces as m:ss/km or m:ss/100 m, never raw seconds (no "17,359 s", no "263.7 s/km").
- If a number is missing (for example normalized power), say the analysis uses what exists instead of guessing.
- Write the same analysis twice: "en" in English and "pt" in Brazilian Portuguese.`;

const KEY = (date: string) => `race_analysis:${date}`;


/**
 * Groups the swim, bike and run of a race day, fetches the laps of the bike and the run (2 Strava requests),
 * writes the analysis and stores it (sync_state, key "race_analysis:<date>"). Only complete races are stored.
 */
export async function analyzeRace(date: string, opts: { force?: boolean } = {}): Promise<"saved" | "exists" | "no race" | "incomplete" | "no ai key"> {
  const db = getSupabase();
  if (!opts.force) {
    const { data } = await db.from("sync_state").select("key").eq("key", KEY(date)).maybeSingle();
    if (data) return "exists";
  }
  if (!hasAnthropic()) return "no ai key";

  const { acts, profile } = await labelContext();
  // a configured goal race of that day, or a triathlon the history itself reveals
  if (date < siteConfig.lab.racesFrom) return "no race";
  const configured = siteConfig.upcomingRaces.find((r) => r.date === date && r.format);
  const auto = configured ? null : detectRaceDays(acts).find((d) => d.date === date);
  if (!configured && !auto) return "no race";
  const format = (configured?.format ?? auto!.format) as RaceFormat;
  const race = { name: configured?.name ?? auto?.nameHint ?? `${FORMAT_LABEL[format]} triathlon` };
  const grouped = groupRace(acts, date, format);
  if (!grouped?.complete || !grouped.bike || !grouped.run) return "incomplete";

  const lapsOf = async (id: number, sport: "run" | "ride") => {
    try {
      return summarizeLaps(await stravaGet<RawLap[]>(`/activities/${id}/laps`), sport);
    } catch {
      return null; // no laps: the analysis still works from the totals
    }
  };
  const laps = { bike: await lapsOf(grouped.bike.id, "ride"), run: await lapsOf(grouped.run.id, "run") };

  const facts = raceFacts(grouped, profile, laps, { name: race.name, date });
  const out = await writeJson<{ en: string; pt: string }>({
    model: RACE_MODEL,
    effort: "low",
    system: SYSTEM,
    user: `Race data (JSON):\n${JSON.stringify(facts)}`,
    label: `race ${date}`,
    schema: BILINGUAL_SCHEMA as unknown as Record<string, unknown>,
  });
  if (!out?.en) return "incomplete";

  const stored: RaceAnalysisStored = {
    date,
    laps: { bike: laps.bike ?? undefined, run: laps.run ?? undefined },
    en: out.en,
    pt: out.pt ?? out.en,
    model: out.model,
    createdAt: new Date().toISOString(),
  };
  const { error } = await db.from("sync_state").upsert({ key: KEY(date), value: JSON.stringify(stored), updated_at: new Date().toISOString() }, { onConflict: "key" });
  if (error) throw new Error(`Could not save the race analysis: ${error.message}`);
  return "saved";
}

/** For a workout that just arrived: if it was done on the day of a configured race, analyse that race (once). */
export async function analyzeRaceOfActivity(id: number): Promise<string> {
  const { data } = await getSupabase().from("activities").select("start_local").eq("id", id).maybeSingle();
  const date = data?.start_local ? String(data.start_local).slice(0, 10) : "";
  return date ? analyzeRace(date) : "no date";
}
