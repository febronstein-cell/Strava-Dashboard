/**
 * Finds triathlons in the Strava history: a swim, a bike and a run on the same day, in that order,
 * close in time and place, with distances close to a standard format. Pure functions (no network).
 */

export interface DetectItem {
  id: number;
  name?: string;
  sport: "swim" | "ride" | "run" | string;
  /** local start, YYYY-MM-DDTHH:mm:ss */
  date: string;
  /** metres */
  distance: number;
  /** seconds */
  elapsed: number;
  race: boolean;
  lat?: number | null;
  lng?: number | null;
}

export type TriFormat = "Sprint" | "Olympic" | "70.3" | "Ironman";

/** swim (m) / bike (km) / run (km) of each standard distance */
const FORMATS: { name: TriFormat; swim: number; bike: number; run: number }[] = [
  { name: "Sprint", swim: 750, bike: 20, run: 5 },
  { name: "Olympic", swim: 1500, bike: 40, run: 10 },
  { name: "70.3", swim: 1900, bike: 90, run: 21.1 },
  { name: "Ironman", swim: 3800, bike: 180, run: 42.2 },
];

export interface DetectedRace {
  /** YYYY-MM-DD */
  date: string;
  format: TriFormat;
  swimId: number;
  rideId: number;
  runId: number;
  swimSeconds: number;
  t1Seconds: number | null;
  bikeSeconds: number;
  t2Seconds: number | null;
  runSeconds: number;
  /** swim + T1 + bike + T2 + run when the transitions are known, else the sum of the three legs */
  finishSeconds: number;
  /** a leg was marked as a race on Strava */
  confirmed: boolean;
  /** why it counts as a race and not as a training brick */
  reason: "flagged" | "named" | "away";
  lat: number | null;
  lng: number | null;
}

const ms = (iso: string) => Date.parse(iso + "Z");

function km(a: [number, number], b: [number, number]): number {
  const R = 6371;
  const rad = (d: number) => (d * Math.PI) / 180;
  const h = Math.sin(rad(b[0] - a[0]) / 2) ** 2 + Math.cos(rad(a[0])) * Math.cos(rad(b[0])) * Math.sin(rad(b[1] - a[1]) / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

/** The standard format whose three distances all match within tolerance (or null). */
function matchFormat(swimM: number, bikeKm: number, runKm: number): TriFormat | null {
  let best: { name: TriFormat; err: number } | null = null;
  for (const f of FORMATS) {
    const s = swimM / f.swim;
    const b = bikeKm / f.bike;
    const r = runKm / f.run;
    // race courses are measured: ride and run must be close to the official distance (open-water swims are looser)
    if (s < 0.75 || s > 1.35 || b < 0.85 || b > 1.2 || r < 0.85 || r > 1.2) continue;
    const err = Math.abs(1 - s) + Math.abs(1 - b) + Math.abs(1 - r);
    if (!best || err < best.err) best = { name: f.name, err };
  }
  return best?.name ?? null;
}

const RACE_WORDS = /prova|race|triathlon|triatlo|ironman|70\.3|troféu|trofeu|etapa|campeonato|copa|open|kona|challenge/i;

/**
 * Detects the triathlons among `items` (any mix of sports and days). A swim + bike + run day with
 * standard distances is only a race when it was also far from `home` (>30 km), marked as a race on
 * Strava, or named like one: otherwise it is probably a brick session.
 */
export function detectTriathlons(
  items: DetectItem[],
  opts: { home?: [number, number]; /** true for places where you train all the time (not "away") */ isRegular?: (p: [number, number]) => boolean } = {},
): DetectedRace[] {
  const byDay = new Map<string, DetectItem[]>();
  for (const it of items) {
    if (it.sport !== "swim" && it.sport !== "ride" && it.sport !== "run") continue;
    const day = it.date.slice(0, 10);
    byDay.set(day, [...(byDay.get(day) ?? []), it]);
  }

  const out: DetectedRace[] = [];
  for (const [day, list] of byDay) {
    const swims = list.filter((x) => x.sport === "swim" && x.distance >= 300);
    const rides = list.filter((x) => x.sport === "ride" && x.distance >= 8000);
    const runs = list.filter((x) => x.sport === "run" && x.distance >= 2000);
    if (!swims.length || !rides.length || !runs.length) continue;

    let best: DetectedRace | null = null;
    for (const s of swims) {
      for (const b of rides) {
        for (const r of runs) {
          const sEnd = ms(s.date) + s.elapsed * 1000;
          const bEnd = ms(b.date) + b.elapsed * 1000;
          const gap1 = (ms(b.date) - sEnd) / 1000;
          const gap2 = (ms(r.date) - bEnd) / 1000;
          // in order, with transitions of at most 40 minutes (a tiny overlap is tolerated: watches differ)
          if (gap1 < -300 || gap1 > 1200 || gap2 < -300 || gap2 > 1200) continue;

          const format = matchFormat(s.distance, b.distance / 1000, r.distance / 1000);
          if (!format) continue;

          // same place: every pair of known start points within 25 km
          const pts = [s, b, r].filter((x) => x.lat != null && x.lng != null).map((x) => [x.lat as number, x.lng as number] as [number, number]);
          if (pts.some((p, i) => pts.slice(i + 1).some((q) => km(p, q) > 25))) continue;

          const flagged = s.race || b.race || r.race;
          const named = [s, b, r].some((x) => x.name && RACE_WORDS.test(x.name));
          const away = !!opts.home && pts.some((p) => km(p, opts.home as [number, number]) > 30 && !opts.isRegular?.(p));
          if (!flagged && !named && !away) continue;

          const t1 = gap1 >= 0 ? Math.round(gap1) : null;
          const t2 = gap2 >= 0 ? Math.round(gap2) : null;
          const legs = s.elapsed + b.elapsed + r.elapsed;
          const cand: DetectedRace = {
            date: day,
            format,
            swimId: s.id,
            rideId: b.id,
            runId: r.id,
            swimSeconds: s.elapsed,
            t1Seconds: t1,
            bikeSeconds: b.elapsed,
            t2Seconds: t2,
            runSeconds: r.elapsed,
            finishSeconds: legs + (t1 ?? 0) + (t2 ?? 0),
            confirmed: flagged,
            reason: flagged ? "flagged" : named ? "named" : "away",
            lat: pts[0]?.[0] ?? null,
            lng: pts[0]?.[1] ?? null,
          };
          // prefer a confirmed candidate, then the longest total (the full race rather than a warm-up leg)
          if (!best || (cand.confirmed && !best.confirmed) || (cand.confirmed === best.confirmed && cand.finishSeconds > best.finishSeconds)) best = cand;
        }
      }
    }
    if (best) out.push(best);
  }
  return out.sort((a, b) => (a.date < b.date ? -1 : 1));
}
