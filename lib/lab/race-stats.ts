import { FORMATS, type RaceLeg, type RaceResult } from "./race-group";
import type { Profile } from "./profile";
import type { LapSummary } from "./types";

/** A lap as Strava returns it (only what is used here). */
export interface RawLap {
  distance: number;
  moving_time?: number;
  elapsed_time?: number;
  average_heartrate?: number;
  average_watts?: number;
}

/** Laps of a run (pace, s/km) or a bike leg (speed, km/h), plus the first-half and second-half averages. Pure. */
export function summarizeLaps(laps: RawLap[], sport: "run" | "ride"): LapSummary | null {
  const rows = laps
    .map((l) => ({ km: l.distance / 1000, sec: l.moving_time ?? l.elapsed_time ?? 0, hr: l.average_heartrate, watts: l.average_watts }))
    .filter((l) => l.km >= 0.2 && l.sec > 0);
  if (rows.length < 3) return null;

  const unit: LapSummary["unit"] = sport === "run" ? "pace" : "speed";
  const v = (km: number, sec: number) => (unit === "pace" ? sec / km : (km / sec) * 3600);
  const total = rows.reduce((s, r) => s + r.km, 0);

  // first half = laps up to half of the distance
  let acc = 0;
  const a = { km: 0, sec: 0, hrW: 0, hrKm: 0 };
  const b = { km: 0, sec: 0, hrW: 0, hrKm: 0 };
  for (const r of rows) {
    const half = acc + r.km / 2 < total / 2 ? a : b;
    half.km += r.km;
    half.sec += r.sec;
    if (r.hr) {
      half.hrW += r.hr * r.km;
      half.hrKm += r.km;
    }
    acc += r.km;
  }
  if (a.km === 0 || b.km === 0) return null;
  return {
    unit,
    laps: rows.map((r) => ({ km: Number(r.km.toFixed(2)), v: Number(v(r.km, r.sec).toFixed(1)), hr: r.hr ? Math.round(r.hr) : undefined, watts: r.watts ? Math.round(r.watts) : undefined })),
    first: Number(v(a.km, a.sec).toFixed(1)),
    second: Number(v(b.km, b.sec).toFixed(1)),
    hrFirst: a.hrKm ? Math.round(a.hrW / a.hrKm) : undefined,
    hrSecond: b.hrKm ? Math.round(b.hrW / b.hrKm) : undefined,
  };
}

/** Share of the race time spent in each part, in %. */
export function shares(r: RaceResult): { key: "swim" | "t1" | "bike" | "t2" | "run"; seconds: number; pct: number }[] {
  const parts: { key: "swim" | "t1" | "bike" | "t2" | "run"; seconds: number }[] = [
    { key: "swim", seconds: r.swim?.elapsed ?? 0 },
    { key: "t1", seconds: r.t1?.seconds ?? 0 },
    { key: "bike", seconds: r.bike?.elapsed ?? 0 },
    { key: "t2", seconds: r.t2?.seconds ?? 0 },
    { key: "run", seconds: r.run?.elapsed ?? 0 },
  ];
  const sum = parts.reduce((s, p) => s + p.seconds, 0) || 1;
  return parts.map((p) => ({ ...p, pct: (p.seconds / sum) * 100 }));
}

/** Swim pace per 100 m on the OFFICIAL distance (GPS in open water is rarely exact) and on the recorded one. */
export function swimPaces(leg: RaceLeg, officialM: number): { official: number; recorded: number } {
  return { official: leg.elapsed / (officialM / 100), recorded: leg.elapsed / (leg.distanceM / 100) };
}

/** Everything the written analysis (and the page) needs about a race, as plain numbers. */
export function raceFacts(
  r: RaceResult,
  p: Profile,
  laps: { run?: LapSummary | null; bike?: LapSummary | null },
  race: { name: string; date: string },
) {
  const f = FORMATS[r.format];
  const ftp = p.ftp?.value;
  const kg = p.weight_kg?.value;
  const watts = r.bike?.np ?? r.bike?.watts;
  const sec = (x: number | undefined) => (x == null ? null : Math.round(x));
  return {
    race: { name: race.name, date: race.date, format: f.label, officialDistances: { swimM: f.swimM, bikeKm: f.bikeKm, runKm: f.runKm } },
    complete: r.complete,
    totalSeconds: r.totalSeconds,
    sharesPct: Object.fromEntries(shares(r).map((s) => [s.key, Number(s.pct.toFixed(1))])),
    swim: r.swim && {
      seconds: r.swim.elapsed,
      recordedKm: Number((r.swim.distanceM / 1000).toFixed(2)),
      pacePer100mOnOfficialDistance: sec(swimPaces(r.swim, f.swimM).official),
      hrAvg: r.swim.hr ?? null,
      hrMax: r.swim.hrMax ?? null,
    },
    t1Seconds: r.t1?.seconds ?? null,
    bike: r.bike && {
      seconds: r.bike.elapsed,
      km: Number((r.bike.distanceM / 1000).toFixed(1)),
      avgSpeedKmh: Number(((r.bike.distanceM / 1000) / (r.bike.moving / 3600)).toFixed(1)),
      avgWatts: r.bike.watts ?? null,
      normalizedWatts: r.bike.np ?? null,
      wattsPerKg: watts && kg ? Number((watts / kg).toFixed(2)) : null,
      intensityVsFtp: watts && ftp ? Number((watts / ftp).toFixed(2)) : null,
      hrAvg: r.bike.hr ?? null,
      hrMax: r.bike.hrMax ?? null,
      climbM: Math.round(r.bike.elevation),
      pacing: laps.bike ?? null,
    },
    t2Seconds: r.t2?.seconds ?? null,
    run: r.run && {
      seconds: r.run.elapsed,
      km: Number((r.run.distanceM / 1000).toFixed(2)),
      avgPaceSecPerKm: Math.round(r.run.moving / (r.run.distanceM / 1000)),
      hrAvg: r.run.hr ?? null,
      hrMax: r.run.hrMax ?? null,
      climbM: Math.round(r.run.elevation),
      pacing: laps.run ?? null,
    },
    athlete: {
      ftpW: ftp ?? null,
      weightKg: kg ?? null,
      lthrBpm: p.lthr?.value ?? null,
      runThresholdPaceSecPerKm: p.run_threshold_pace?.value ?? null,
      maxHrBpm: p.max_hr?.value ?? null,
    },
    leftOut: r.left.map((l) => ({ name: l.name, sport: l.sport, kind: l.kind, minutes: Math.round(l.seconds / 60) })),
  };
}
