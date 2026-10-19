import { type NextRequest } from "next/server";
import { siteConfig } from "@/site.config";
import { ANALYSIS_EFFORT, ANALYSIS_MODEL, hasAnthropic, writeJson } from "@/lib/lab/ai";
import { weeklyHours } from "@/lib/lab/builds";
import { labelContext } from "@/lib/lab/labeling";
import { checkPlanKey } from "@/lib/lab/plan-auth";
import { DAY_NAMES, isComplete, planHash, sanitizeDays, totals } from "@/lib/lab/plan";
import { buildSeason, defaultPriority, type SeasonRace } from "@/lib/lab/season";
import { getSupabase } from "@/lib/supabase";

export const maxDuration = 60;

const SYSTEM = `You are an endurance coach reviewing ONE week of a triathlete's training plan, written by the athlete, and you know where the week sits in the season.

Rules:
- Use ONLY the data given: the 7 planned days (description, time, distance), the suggested shape of the week (phase, position in the cycle, weeks to the race, suggested hours) and the recent real volume. Never invent workouts.
- Say what kind of week this is and why, recognising the length of the cycle and the specificity of the race (distance of the race, how far away it is). Use these labels for "title": "Base week", "Build week", "Peak week", "Deload week", "Taper week", "Race week" or "Recovery week", followed by the position when the week is inside a cycle, for example "Build week 4 of 8".
- Judge the plan: total hours against the suggested hours and against the last weeks; how hard days are spread (no more than two hard days back to back, a real rest day); whether the week contains what this race and phase ask for (for a 70.3 build: a long ride, a brick, a long run, continuous swimming; for an olympic build: threshold or VO2 work and a short brick). Name what is present and what is missing, reading only the descriptions.
- End with one or two concrete suggestions. If a day says "rest", count it as rest.
- Tone: direct and encouraging, no hype, no emojis. 110 to 170 words, plain text.
- "en" is the description in English, "pt" the same in Brazilian Portuguese; "title" is English only.`;

const SCHEMA = {
  type: "object",
  properties: { title: { type: "string" }, en: { type: "string" }, pt: { type: "string" } },
  required: ["title", "en", "pt"],
  additionalProperties: false,
} as const;

/** Writes the description of a complete planned week and stores it with the week. Needs the edit key. */
export async function POST(request: NextRequest) {
  const denied = checkPlanKey(request);
  if (denied) return denied;
  if (!hasAnthropic()) return Response.json({ error: "ANTHROPIC_API_KEY is not set on the server." }, { status: 503 });

  const body = (await request.json().catch(() => null)) as { weekStart?: string } | null;
  const weekStart = body?.weekStart ?? "";
  const db = getSupabase();
  const { data: row } = await db.from("training_weeks").select("planned_sessions").eq("week_start", weekStart).maybeSingle();
  const days = sanitizeDays(row?.planned_sessions);
  if (!days || !isComplete(days)) return Response.json({ error: "The week is not complete yet." }, { status: 400 });

  // where the week sits in the season
  const { acts } = await labelContext();
  const hours = weeklyHours(acts);
  const todayKey = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(new Date());
  const monday = (offset: number) => new Date(Date.parse(weekStart + "T00:00:00Z") + offset * 7 * 86_400_000).toISOString().slice(0, 10);
  const recent: number[] = [];
  for (let i = 1; i <= 6; i++) recent.push(hours.get(monday(-i)) ?? 0);
  const recentMean = recent.reduce((s, x) => s + x, 0) / recent.length;
  const races: SeasonRace[] = siteConfig.upcomingRaces.map((r) => ({ name: r.name, date: r.date, format: r.format, priority: r.priority ?? defaultPriority(r.format), cycleStart: r.cycleStart }));
  const season = buildSeason(races, todayKey, recentMean, 60);
  const week = season.find((w) => w.start === weekStart);

  const { data: prev } = await db.from("training_weeks").select("planned_hours").eq("week_start", monday(-1)).maybeSingle();
  const t = totals(days);
  const facts = {
    weekStart,
    days: days.map((d) => ({ day: DAY_NAMES[d.day], description: d.description, minutes: d.minutes, km: d.km })),
    plannedHours: Number(t.hours.toFixed(1)),
    plannedKm: Number(t.km.toFixed(0)),
    sessions: t.sessions,
    previousWeekPlannedHours: prev?.planned_hours != null ? Number(prev.planned_hours) : null,
    lastSixWeeksActualHoursMean: Number(recentMean.toFixed(1)),
    seasonPosition: week && {
      phase: week.phase,
      kind: week.kind,
      suggestedHours: Number(week.target.toFixed(1)),
      race: week.race && { name: week.race.name, date: week.race.date, format: week.race.format ?? "unknown", priority: week.race.priority },
      cycle: week.cycle,
      isRaceWeek: week.raceWeek,
    },
  };

  const out = await writeJson<{ title: string; en: string; pt: string }>({
    model: ANALYSIS_MODEL,
    effort: ANALYSIS_EFFORT,
    system: SYSTEM,
    user: `Planned week (JSON):\n${JSON.stringify(facts)}`,
    label: `week ${weekStart}`,
    schema: SCHEMA as unknown as Record<string, unknown>,
  });
  if (!out?.en) return Response.json({ error: "The model did not answer." }, { status: 502 });

  const title = out.title.replace(/["“”]/g, "").trim().slice(0, 60);
  const hash = planHash(days);
  const notes = JSON.stringify({ en: out.en, pt: out.pt ?? out.en, hash });
  const { error } = await db.from("training_weeks").update({ title, notes }).eq("week_start", weekStart);
  if (error) return Response.json({ error: error.message }, { status: 500 });
  return Response.json({ title, en: out.en, pt: out.pt ?? out.en, hash });
}
