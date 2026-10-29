import "server-only";
import { durabilityRows, firstKmByMonth, trend } from "@/lib/durability-trends";
import { loadContext } from "@/lib/load-context";
import { readSeason } from "@/lib/season-data";
import { phaseOn, seasonBrief } from "@/lib/season-plan";
import { readStreams } from "@/lib/streams-cache";
import { labZones } from "@/lib/zones-data";
import { getSupabase } from "@/lib/supabase";
import { BILINGUAL_SCHEMA, hasAnthropic, writeJson } from "@/lib/lab/ai";

const KEY = "durability_comment";
const MODEL = process.env.LAB_FORM_MODEL || "claude-sonnet-5-5";

const SYSTEM = `You are an endurance coach commenting on the DURABILITY of a triathlete: how well pace and power hold when tired.
Rules:
- Use ONLY the numbers given. Say whether durability is improving, flat or getting worse, and why you think so, in light of the season phase and the recent long sessions.
- Cover: aerobic decoupling on long runs and rides (under 5% good, 5 to 8% watch, over 8% poor), second-half fade, runs that started too fast (km 1 more than 3% faster than km 2-5) and the share of bricks among them, and best 20-minute power after 1,500 and 2,500 kJ against the fresh best.
- If there is little data, say so plainly instead of guessing. Direct and encouraging, no hype, no emojis, 90 to 140 words, plain text.
- Write it twice: "en" in English and "pt" in Brazilian Portuguese.`;

/** Facts for the comment (and for the Durability tab's own summary). */
export async function durabilityFacts() {
  const day = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(new Date());
  const [{ acts, profile }, season, streams] = await Promise.all([loadContext(), readSeason(), readStreams()]);
  const zones = labZones(streams, profile).byId;
  const rows = durabilityRows(acts, zones);
  const long = (r: (typeof rows)[number]) => (r.sport === "run" ? r.movingS >= 45 * 60 : r.movingS >= 3600);
  const t = (pick: (r: (typeof rows)[number]) => number | undefined, only?: "run" | "ride") =>
    trend(rows.filter((r) => !only || r.sport === only), pick, day, 42);
  const r1 = (n: number | null) => (n == null ? null : Math.round(n * 10) / 10);
  const facts = {
    day,
    sessionsWithData: rows.length,
    decouplingLongRunsPct: { last6Weeks: r1(t((r) => (long(r) && r.sport === "run" ? r.decoupling : undefined), "run").recent), previous6Weeks: r1(t((r) => (long(r) && r.sport === "run" ? r.decoupling : undefined), "run").before) },
    decouplingLongRidesPct: { last6Weeks: r1(t((r) => (long(r) && r.sport === "ride" ? r.decoupling : undefined), "ride").recent), previous6Weeks: r1(t((r) => (long(r) && r.sport === "ride" ? r.decoupling : undefined), "ride").before) },
    runFadePct: { last6Weeks: r1(t((r) => r.fade, "run").recent), previous6Weeks: r1(t((r) => r.fade, "run").before) },
    firstKmByMonth: firstKmByMonth(rows).slice(-4),
    brickRunsStartedTooFast: rows.filter((r) => r.brick && r.tooFast).length,
    brickRuns: rows.filter((r) => r.brick && r.firstKm).length,
    best20AfterEnergyPctOfFresh: {
      after1500kJ: r1(t((r) => r.after1500Pct, "ride").recent),
      after2500kJ: r1(t((r) => r.after2500Pct, "ride").recent),
    },
    longSessionsLast6Weeks: rows
      .filter((r) => long(r) && r.date >= new Date(Date.parse(day) - 42 * 86_400_000).toISOString().slice(0, 10))
      .slice(-8)
      .map((r) => ({ date: r.date, sport: r.sport, decouplingPct: r1(r.decoupling ?? null), fadePct: r1(r.fade ?? null) })),
  };
  return { day, facts, season: seasonBrief(season, day), phase: phaseOn(season.phases, day)?.name ?? null };
}

/** Writes the comment and stores it (sync_state, key durability_comment). Returns false when there is nothing to say. */
export async function commentOnDurability(): Promise<boolean> {
  if (!hasAnthropic()) return false;
  const { day, facts, season } = await durabilityFacts();
  if (facts.sessionsWithData < 3) return false;
  const out = await writeJson<{ en: string; pt: string }>({
    model: MODEL,
    effort: "low",
    system: SYSTEM,
    user: `${season}\n\nDurability data (JSON):\n${JSON.stringify(facts)}`,
    label: "durability comment",
    schema: BILINGUAL_SCHEMA as unknown as Record<string, unknown>,
  });
  if (!out) return false;
  const { error } = await getSupabase()
    .from("sync_state")
    .upsert({ key: KEY, value: JSON.stringify({ day, en: out.en, pt: out.pt, model: out.model }), updated_at: new Date().toISOString() }, { onConflict: "key" });
  if (error) throw new Error(error.message);
  return true;
}

export async function readDurabilityComment(): Promise<{ day: string; en: string; pt: string } | null> {
  const { data } = await getSupabase().from("sync_state").select("value").eq("key", KEY).maybeSingle();
  try {
    return data?.value ? (JSON.parse(String(data.value)) as { day: string; en: string; pt: string }) : null;
  } catch {
    return null;
  }
}
