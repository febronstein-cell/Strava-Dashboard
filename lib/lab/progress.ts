import { siteConfig, type SportKey } from "@/site.config";
import type { Activity } from "@/lib/strava/types";
import { efficiency } from "@/lib/stats";

const DAY = 86_400_000;
const dayKey = (t: number) => new Date(t).toISOString().slice(0, 10);

/** Monday (YYYY-MM-DD) of the week of a local ISO date. */
export function mondayOf(iso: string): string {
  const t = Date.parse(iso.slice(0, 10) + "T00:00:00Z");
  const dow = (new Date(t).getUTCDay() + 6) % 7;
  return dayKey(t - dow * DAY);
}

export interface WindowStats {
  from: string;
  to: string;
  /** ELAPSED hours */
  hours: number;
  sessions: number;
  hoursBySport: Record<SportKey, number>;
  /** share of weeks with at least 3 sessions (0..1) */
  consistency: number;
  /** meters per heartbeat of outdoor runs of 20+ min (MOVING time); higher = more efficient */
  runEfficiency: number | null;
  /** average normalized power of rides of 40+ min with a power meter */
  rideNp: number | null;
  /** share of heart-rate time (MOVING) in each configured zone, 0..1 */
  zoneShare: number[] | null;
  longestRunKm: number;
  longestRideKm: number;
}

const avg = (xs: number[]) => (xs.length ? xs.reduce((s, x) => s + x, 0) / xs.length : null);

/** Stats of the activities from `from` to `to` (both inclusive, YYYY-MM-DD). */
export function windowStats(all: Activity[], from: string, to: string): WindowStats {
  const acts = all.filter((a) => {
    const k = a.date.slice(0, 10);
    return k >= from && k <= to;
  });
  const hoursBySport: Record<SportKey, number> = { run: 0, ride: 0, swim: 0, strength: 0, other: 0 };
  const perWeek = new Map<string, number>();
  for (const a of acts) {
    hoursBySport[a.sport] += a.elapsedTime / 3600;
    const w = mondayOf(a.date);
    perWeek.set(w, (perWeek.get(w) ?? 0) + 1);
  }
  const weeks = Math.max(1, Math.round((Date.parse(to) - Date.parse(from)) / DAY / 7));
  const consistent = [...perWeek.values()].filter((n) => n >= 3).length;

  const effs = acts
    .filter((a) => a.sport === "run" && !a.indoor && !a.race && a.movingTime >= 1200)
    .map(efficiency)
    .filter((v): v is number => v !== null);
  const nps = acts.filter((a) => a.sport === "ride" && a.np && a.deviceWatts && a.movingTime >= 2400).map((a) => a.np!);

  const zones = siteConfig.heartRate.zones;
  const zoneSec = zones.map(() => 0);
  let hrSec = 0;
  for (const a of acts) {
    if (!a.hr) continue;
    const i = zones.findIndex((z) => a.hr! <= z.max);
    zoneSec[i === -1 ? zones.length - 1 : i] += a.movingTime;
    hrSec += a.movingTime;
  }

  const longest = (sport: SportKey) => Math.max(0, ...acts.filter((a) => a.sport === sport).map((a) => a.distance / 1000));

  return {
    from,
    to,
    hours: acts.reduce((s, a) => s + a.elapsedTime, 0) / 3600,
    sessions: acts.length,
    hoursBySport,
    consistency: Math.min(1, consistent / weeks),
    runEfficiency: avg(effs),
    rideNp: avg(nps),
    zoneShare: hrSec > 0 ? zoneSec.map((s) => s / hrSec) : null,
    longestRunKm: longest("run"),
    longestRideKm: longest("ride"),
  };
}

export interface Insight {
  id: string;
  tone: "good" | "warn" | "info";
  /** English text with {vars}; the page translates it */
  text: string;
  vars: Record<string, string | number>;
}

export interface Progress {
  months: number;
  current: WindowStats;
  previous: WindowStats;
  insights: Insight[];
}

const pct = (now: number, before: number) => Math.round(((now - before) / before) * 100);

/** Compares the last `months` months with the same length just before. */
export function progression(all: Activity[], todayKey: string, months: number): Progress {
  const span = Math.round(months * 30.4375);
  const end = Date.parse(todayKey + "T00:00:00Z");
  const curFrom = dayKey(end - (span - 1) * DAY);
  const prevTo = dayKey(end - span * DAY);
  const prevFrom = dayKey(end - (2 * span - 1) * DAY);
  const current = windowStats(all, curFrom, todayKey);
  const previous = windowStats(all, prevFrom, prevTo);

  const insights: Insight[] = [];
  const add = (i: Insight) => insights.push(i);

  if (previous.hours > 1) {
    const d = pct(current.hours, previous.hours);
    if (Math.abs(d) >= 3) {
      add({
        id: "volume",
        tone: d > 0 ? "good" : "info",
        text: d > 0 ? "Training volume is up {pct}% versus the previous period ({a} h vs {b} h)." : "Training volume is down {pct}% versus the previous period ({a} h vs {b} h).",
        vars: { pct: Math.abs(d), a: Math.round(current.hours), b: Math.round(previous.hours) },
      });
    } else add({ id: "volume", tone: "info", text: "Training volume is steady versus the previous period ({a} h vs {b} h).", vars: { a: Math.round(current.hours), b: Math.round(previous.hours) } });
  }

  if (current.runEfficiency && previous.runEfficiency) {
    const d = pct(current.runEfficiency, previous.runEfficiency);
    if (Math.abs(d) >= 1) {
      add({
        id: "run-eff",
        tone: d > 0 ? "good" : "warn",
        text: d > 0 ? "Running efficiency (distance per heartbeat) improved {pct}%: you cover more ground for the same effort." : "Running efficiency (distance per heartbeat) dropped {pct}%: check fatigue, heat or intensity before reading it as lost fitness.",
        vars: { pct: Math.abs(d) },
      });
    }
  }

  if (current.rideNp && previous.rideNp) {
    const d = pct(current.rideNp, previous.rideNp);
    if (Math.abs(d) >= 2) {
      add({
        id: "ride-np",
        tone: d > 0 ? "good" : "info",
        text: d > 0 ? "Average normalized power on rides of 40+ min is up {pct}% ({a} W vs {b} W)." : "Average normalized power on rides of 40+ min is down {pct}% ({a} W vs {b} W).",
        vars: { pct: Math.abs(d), a: Math.round(current.rideNp), b: Math.round(previous.rideNp) },
      });
    }
  }

  if (current.zoneShare) {
    const easy = Math.round((current.zoneShare[0] + current.zoneShare[1]) * 100);
    const hard = Math.round(((current.zoneShare[3] ?? 0) + (current.zoneShare[4] ?? 0)) * 100);
    add(
      easy >= 70
        ? { id: "zones", tone: "good", text: "{easy}% of your heart-rate time is easy (zones 1–2) and {hard}% is hard (zones 4–5): a well polarized split.", vars: { easy, hard } }
        : { id: "zones", tone: "warn", text: "Only {easy}% of your heart-rate time is easy (zones 1–2) and {hard}% is hard (zones 4–5). Most of the volume should be easy, around 80%.", vars: { easy, hard } },
    );
  }

  add({
    id: "consistency",
    tone: current.consistency >= 0.75 ? "good" : "info",
    text: "You trained 3+ times in {pct}% of the weeks.",
    vars: { pct: Math.round(current.consistency * 100) },
  });

  return { months, current, previous, insights };
}
