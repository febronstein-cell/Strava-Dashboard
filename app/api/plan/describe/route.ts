import { revalidateTag } from "next/cache";
import { type NextRequest } from "next/server";
import { ANALYSIS_EFFORT, ANALYSIS_MODEL, hasAnthropic, writeJson } from "@/lib/lab/ai";
import { labelContext } from "@/lib/lab/labeling";
import { checkPlanKey } from "@/lib/lab/plan-auth";
import { DAY_NAMES, SPORT_LABEL, isComplete, planHash, sanitizeDays, slotFilled, totals } from "@/lib/lab/plan";
import { realWeeks, summarize } from "@/lib/lab/plan-history";
import { mondayOf } from "@/lib/lab/progress";
import { buildSeason, defaultPriority, type SeasonRace } from "@/lib/lab/season";
import { matchWeek, sessionCompliance, weekCompliance } from "@/lib/compliance";
import { getOverrides } from "@/lib/laps-cache";
import { readSeason } from "@/lib/season-data";
import { seasonBrief, triFormat } from "@/lib/season-plan";
import { getSupabase } from "@/lib/supabase";

export const maxDuration = 60;

const LABELS = ["Base", "Build", "Speed", "Peak", "Lighter", "Taper", "Race", "Recovery"] as const;

const SYSTEM = `You are an endurance coach analysing ONE week of a triathlete's training plan, written by the athlete day by day and sport by sport. You decide what kind of week it really is by reading what is in it and comparing it with what the athlete really trained before.

Data you get: the planned days (each day: rest, or the sessions with sport, description, minutes, km), the week's totals and the frequency per sport, the real last 8 weeks (hours, km and sessions per sport), the real weeks of the athlete's previous race build-up (when there is one) with its mean and peak, the labels and hours of the previous planned weeks, and the season model's EXPECTED shape for this week (phase, position in the cycle, suggested hours, race and how far away it is).

Choose "label" from what the week CONTAINS, not from the season model:
- Base: mostly easy aerobic volume, technique, strength, no real intensity.
- Build: more volume and/or threshold, sweet-spot or tempo work, long sessions growing.
- Speed: short, fast, high-intensity work (VO2, intervals, strides, sprints) is the point of the week.
- Peak: the highest load of the cycle, with race-specific sessions (race pace, bricks).
- Lighter: a deload or low-volume week (clearly below the recent weeks, intensity kept short).
- Taper: reduced volume right before a race, short race-pace touches.
- Race: the race week.
- Recovery: easy movement after a race or a very hard block.
Judge "hard" or "easy" against the athlete's own history: a week that looks big can be normal for them, and one that looks small can be a step up. Say so with numbers (hours, km, sessions per sport against the real weeks and against the previous build-up).

The text ("en", plain text, 4 short paragraphs (5 when the week has started) separated by a blank line, 170 to 280 words in total):
1. What the week is and why this label: the main workouts and the weekly load against the real recent weeks and the previous build-up.
2. Frequency and distribution: sessions per sport, doubles, rest days, where the hard days and the long sessions fall, whether hard days are too close together.
3. Fit with the season: if your label differs from the expected phase, say it plainly and say what to change (or accept) so the week serves its purpose; if it matches, say what the week still lacks for this race (distance, how far away, what the race asks for).
4. Only when "actualSoFar" is given (the week has started): what really happened so far, with numbers: compliance score, sessions missed or cut short (key sessions first), unplanned work (especially on rest days), planned against done hours per sport.
5. One or two concrete tips.
Rules: use ONLY the given data; read intensity only from the descriptions and never invent workouts; if a sport has no sessions say so; direct and encouraging, no hype, no emojis. "pt" is the same text in Brazilian Portuguese. "label" is exactly one of the allowed labels.`;

const SCHEMA = {
  type: "object",
  properties: { label: { type: "string", enum: [...LABELS] }, en: { type: "string" }, pt: { type: "string" } },
  required: ["label", "en", "pt"],
  additionalProperties: false,
} as const;

/** Analyses a complete planned week, labels it and stores both with the week. Needs the edit key. */
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

  const [{ acts }, seasonData] = await Promise.all([labelContext(), readSeason()]);
  const monday = (offset: number) => new Date(Date.parse(weekStart + "T00:00:00Z") + offset * 7 * 86_400_000).toISOString().slice(0, 10);

  // the real recent weeks, and the build-up of the last race that had a fixed cycle
  const recentWeeks = realWeeks(acts, monday(-8), monday(-1));
  const recentMean = recentWeeks.slice(-6).reduce((s, w) => s + w.hours, 0) / 6;
  const pastRace = seasonData.races
    .filter((r) => r.cycleStart && r.date < weekStart)
    .sort((a, b) => (a.date < b.date ? 1 : -1))[0];
  const buildUp = pastRace?.cycleStart ? realWeeks(acts, mondayOf(pastRace.cycleStart), mondayOf(pastRace.date)) : null;

  // where the model expects this week to sit in the season
  const todayKey = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(new Date());
  const races: SeasonRace[] = seasonData.races.map((r) => ({ name: r.name, date: r.date, format: triFormat(r.type), type: r.type, goal: r.goal, priority: r.priority ?? defaultPriority(triFormat(r.type)), cycleStart: r.cycleStart }));
  const week = buildSeason(races, todayKey, recentMean, 60, seasonData.phases).find((w) => w.start === weekStart);

  // the previous planned weeks and the label they got
  const { data: prevRows } = await db.from("training_weeks").select("week_start,title,planned_hours").lt("week_start", weekStart).not("title", "is", null).order("week_start", { ascending: false }).limit(6);

  // what really happened so far, when the week has started: the analysis then comments on it, not only on the plan
  const started = weekStart <= todayKey;
  const matched = started ? matchWeek(days, weekStart, acts, await getOverrides(weekStart)) : null;
  const done = matched && weekCompliance(matched, todayKey);

  const t = totals(days);
  const facts = {
    weekStart,
    days: days.map((d) => ({
      day: DAY_NAMES[d.day],
      rest: d.rest ?? false,
      sessions: d.rest ? [] : d.slots.filter(slotFilled).map((s) => ({ sport: SPORT_LABEL[s.sport], name: s.name ?? null, description: s.description, minutes: s.minutes, km: s.km })),
      minutes: d.rest ? 0 : d.slots.reduce((s, x) => s + (x.minutes ?? 0), 0),
    })),
    totals: {
      hours: Number(t.hours.toFixed(1)),
      km: Number(t.km.toFixed(0)),
      sessions: t.sessions,
      restDays: t.restDays,
      doubleDays: t.doubleDays,
      bySport: Object.fromEntries(Object.entries(t.bySport).map(([k, v]) => [SPORT_LABEL[k as keyof typeof SPORT_LABEL], { hours: Number((v.minutes / 60).toFixed(1)), km: Number(v.km.toFixed(0)), sessions: v.sessions, days: v.days }])),
    },
    realLastEightWeeks: recentWeeks,
    previousBuildUp: pastRace && buildUp ? { race: pastRace.name, date: pastRace.date, summary: summarize(buildUp), weeks: buildUp } : null,
    previousPlannedWeeks: (prevRows ?? []).map((r) => ({ week: String(r.week_start).slice(0, 10), label: r.title, plannedHours: r.planned_hours != null ? Number(r.planned_hours) : null })),
    actualSoFar: done && {
      throughDate: todayKey,
      complianceScorePct: done.score,
      sessionsPlanned: done.planned,
      done: done.done,
      missed: done.missed,
      unplanned: done.unplanned,
      unplannedOnRestDays: done.unplannedOnRest,
      keySessions: { planned: done.keyPlanned, done: done.keyDone },
      bySport: Object.fromEntries(Object.entries(done.bySport).map(([k, v]) => [k, { plannedH: Number(v.plannedH.toFixed(1)), doneH: Number(v.doneH.toFixed(1)), plannedKm: Math.round(v.plannedKm), doneKm: Math.round(v.doneKm) }])),
      sessions: matched!
        .filter((d) => d.date <= todayKey)
        .flatMap((d) =>
          d.entries.map((e) => {
            const c = sessionCompliance(e);
            return { day: DAY_NAMES[d.day], sport: e.entry.sport, key: !!e.entry.key, planned: e.entry.description, done: e.activity ? e.activity.name : "missed", timePct: c.duration.pct && Math.round(c.duration.pct), color: c.duration.color };
          }),
        ),
    },
    expectedBySeasonModel: week && {
      phase: week.phase,
      kind: week.kind,
      suggestedHours: Number(week.target.toFixed(1)),
      race: week.race && { name: week.race.name, date: week.race.date, format: week.race.format ?? "unknown", priority: week.race.priority },
      cycle: week.cycle,
      isRaceWeek: week.raceWeek,
      seasonPhase: week.seasonPhase && { name: week.seasonPhase.name, focus: week.seasonPhase.focus, hours: [week.seasonPhase.hoursMin, week.seasonPhase.hoursMax], runKm: [week.seasonPhase.runKmMin ?? null, week.seasonPhase.runKmMax ?? null], notes: week.seasonPhase.notes ?? null },
      nextARace: week.aRace && { name: week.aRace.name, date: week.aRace.date, type: week.aRace.type ?? null, goal: week.aRace.goal ?? null },
    },
  };

  const out = await writeJson<{ label: string; en: string; pt: string }>({
    model: ANALYSIS_MODEL,
    effort: ANALYSIS_EFFORT,
    system: SYSTEM,
    user: `${seasonBrief(seasonData, weekStart)}\n\nPlanned week (JSON):\n${JSON.stringify(facts)}`,
    label: `week ${weekStart}`,
    schema: SCHEMA as unknown as Record<string, unknown>,
  });
  if (!out?.en) return Response.json({ error: "The model did not answer." }, { status: 502 });

  const label = (LABELS as readonly string[]).includes(out.label) ? out.label : "Build";
  const title = `${label} week`;
  const hash = planHash(days);
  const notes = JSON.stringify({ en: out.en, pt: out.pt ?? out.en, hash });
  const { error } = await db.from("training_weeks").update({ title, notes }).eq("week_start", weekStart);
  if (error) return Response.json({ error: error.message }, { status: 500 });
  revalidateTag("strava-live", { expire: 0 });
  return Response.json({ title, en: out.en, pt: out.pt ?? out.en, hash });
}
