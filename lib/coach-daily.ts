import "server-only";
import { timingSafeEqual } from "node:crypto";
import { baselines, readiness } from "@/lib/checkin";
import { readCheckins } from "@/lib/checkin-data";
import { matchWeek, sessionCompliance, weekCompliance } from "@/lib/compliance";
import { getOverrides } from "@/lib/laps-cache";
import { acwr, activityLoad, formState, loadSeries } from "@/lib/lab/load";
import { sanitizeDays } from "@/lib/lab/plan";
import { mondayOf } from "@/lib/lab/progress";
import { loadContext } from "@/lib/load-context";
import { readSeason } from "@/lib/season-data";
import { nextARace, phaseOn } from "@/lib/season-plan";
import { contextSnapshot } from "@/lib/context-data";
import { readStreams } from "@/lib/streams-cache";
import { getSupabase } from "@/lib/supabase";
import { labZones } from "@/lib/zones-data";

/** True when the segment in the URL is the secret (COACH_PATH_SECRET), compared in constant time. */
export function coachSecretOk(segment: string): boolean {
  const expected = process.env.COACH_PATH_SECRET;
  if (!expected || expected.length < 16) return false;
  const a = Buffer.from(segment);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

const r1 = (n: number) => Math.round(n * 10) / 10;

/**
 * Everything the nightly review needs about one day, read-only and without secrets: the day's activities with times,
 * distance, HR, NP or pace, zone times, durability flags, RPE and load; the planned sessions and their compliance; the
 * check-in and its signal; fitness, fatigue, form and the load ratio; the current season phase and the next A race.
 */
export async function coachDaily(date: string) {
  const [{ acts, profile }, season, streams, checkins] = await Promise.all([loadContext(), readSeason(), readStreams(), readCheckins(60)]);
  const zones = labZones(streams, profile).byId;
  const day = acts.filter((a) => a.date.slice(0, 10) === date).sort((a, b) => (a.date < b.date ? -1 : 1));

  const activities = day.map((a) => {
    const load = activityLoad(a, profile);
    const z = zones[a.id];
    return {
      id: a.id,
      name: a.name,
      sport: a.sport,
      start: a.date,
      elapsedMin: Math.round(a.elapsedTime / 60),
      movingMin: Math.round(a.movingTime / 60),
      km: r1(a.distance / 1000),
      elevationM: Math.round(a.elevation),
      avgHr: a.hr ? Math.round(a.hr) : null,
      maxHr: a.hrMax ?? null,
      normalizedPowerW: a.np ?? null,
      avgPowerW: a.watts ? Math.round(a.watts) : null,
      paceSecPerKm: a.sport === "run" && a.distance > 0 ? Math.round(a.movingTime / (a.distance / 1000)) : null,
      rpe: a.rpe ?? null,
      manual: !!a.manual,
      load: Math.round(load.tss),
      loadMethod: load.method,
      loadFromRpe: load.rpeTss != null ? Math.round(load.rpeTss) : null,
      timeInZoneSeconds: z && { hr: z.hr ?? null, power: z.power ?? null, pace: z.pace ?? null, threeZone: z.three ?? null, threeZoneBasis: z.basis ?? null },
      durability: z?.durability ?? null,
    };
  });

  // plan and compliance for the week of that day
  const weekStart = mondayOf(date);
  const { data: row } = await getSupabase().from("training_weeks").select("planned_sessions,title").eq("week_start", weekStart).maybeSingle();
  const days = sanitizeDays(row?.planned_sessions);
  let planned: unknown = null;
  if (days) {
    const matched = matchWeek(days, weekStart, acts, await getOverrides(weekStart));
    const d = matched.find((m) => m.date === date);
    const wk = weekCompliance(matched, date);
    planned = {
      weekLabel: row?.title ?? null,
      restDay: d?.rest ?? false,
      sessions: (d?.entries ?? []).map((e) => {
        const c = sessionCompliance(e);
        return {
          sport: e.entry.sport,
          name: e.entry.name ?? null,
          description: e.entry.description,
          plannedMin: e.entry.minutes,
          plannedKm: e.entry.km,
          key: !!e.entry.key,
          target: e.entry.target ?? null,
          structure: e.entry.structure ?? null,
          doneActivityId: e.activity?.id ?? null,
          timePct: c.duration.pct != null ? Math.round(c.duration.pct) : null,
          distancePct: c.distance.pct != null ? Math.round(c.distance.pct) : null,
          color: c.duration.color,
        };
      }),
      unplannedActivityIds: (d?.unplanned ?? []).map((a) => a.id),
      weekSoFar: { score: wk.score, planned: wk.planned, done: wk.done, missed: wk.missed, unplanned: wk.unplanned, keyPlanned: wk.keyPlanned, keyDone: wk.keyDone },
    };
  }

  // check-in and signal
  const c = checkins.find((x) => x.day === date) ?? null;
  const history = checkins.filter((x) => x.day !== date);
  const sig = c ? readiness(c, history) : null;

  // load model
  const series = loadSeries(acts, profile, date);
  const now = series[series.length - 1];
  const ratio = acwr(series);

  // the Context Log: open events, follow-up answers, session statuses of the day and the signal with its reasons
  const ctx = await contextSnapshot(date, 14).catch(() => null);
  const context = ctx && {
    signal: ctx.signal,
    openEvents: ctx.events
      .filter((e) => e.status === "open")
      .map((e) => ({ id: e.id, type: e.type, bodyArea: e.bodyArea ?? null, severity: e.severity, causeStatedByAthlete: e.causeStated ?? null, tags: e.tags, startDate: e.startDate, openDays: e.openDays, followups: e.followups.map((f) => ({ date: f.date, recoveryScore: f.score, trend: f.trend, redFlags: f.redFlags, note: f.note ?? null })), needsAnswerToday: ctx.due.includes(e.id) })),
    recentlyClosed: ctx.events.filter((e) => e.status === "closed").slice(0, 5).map((e) => ({ id: e.id, type: e.type, startDate: e.startDate, cost: e.cost })),
    sessionStatusesOfTheDay: ctx.statuses.filter((s) => s.date === date),
    notesOfTheDay: ctx.notes.filter((n) => n.date === date).map((n) => ({ text: n.text, confirmed: n.confirmed })),
    patterns: ctx.patterns,
  };

  const phase = phaseOn(season.phases, date);
  const next = nextARace(season.races, date);
  return {
    date,
    activities,
    plan: planned,
    checkin: c && {
      wakeTime: c.wakeTime ?? null,
      sleepHours: c.sleepHours ?? null,
      sleepScore: c.sleepScore ?? null,
      restingHR: c.restingHR ?? null,
      hrvRmssd: c.hrv ?? null,
      hrvStatus: c.hrvStatus ?? null,
      trainingReadiness: c.trainingReadiness ?? null,
      legs: c.legs ?? null,
      energy: c.energy ?? null,
      pain: c.pain,
      notes: c.notes ?? null,
      sources: c.sources,
      signal: sig?.signal ?? null,
      signalReasons: sig?.reasons ?? [],
      baselines: sig && { restingHR: sig.baselines.restingHR && { mean: r1(sig.baselines.restingHR.mean), ready: sig.baselines.restingHR.ready }, lnHrv: sig.baselines.lnHrv && { mean: r1(sig.baselines.lnHrv.mean), sd: r1(sig.baselines.lnHrv.sd), ready: sig.baselines.lnHrv.ready } },
    },
    context,
    baselinesToday: baselines(history, date),
    load: now && { fitness: Math.round(now.ctl), fatigue: Math.round(now.atl), form: Math.round(now.tsb), formBand: formState(now.tsb), acuteChronicRatio: ratio ? Math.round(ratio.ratio * 100) / 100 : null, acuteChronicBand: ratio?.state ?? null, dayLoad: Math.round(now.tss) },
    season: {
      phase: phase && { name: phase.name, focus: phase.focus, hoursPerWeek: [phase.hoursMin, phase.hoursMax], runKmPerWeek: [phase.runKmMin ?? null, phase.runKmMax ?? null], notes: phase.notes ?? null },
      nextARace: next && { name: next.name, date: next.date, type: next.type, goal: next.goal ?? null, daysToGo: Math.ceil((Date.parse(next.date) - Date.parse(date)) / 86_400_000) },
      upcoming: season.races.filter((r) => r.status === "upcoming" && r.date >= date).map((r) => ({ name: r.name, date: r.date, priority: r.priority, type: r.type })),
    },
  };
}

export type CoachDaily = Awaited<ReturnType<typeof coachDaily>>;
