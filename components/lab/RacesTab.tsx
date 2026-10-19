"use client";

import { useMemo, useState } from "react";
import { siteConfig } from "@/site.config";
import { useI18n } from "@/lib/i18n";
import type { Profile } from "@/lib/lab/profile";
import { detectRaceDays, FORMATS, groupRace, type RaceFormat, type RaceResult } from "@/lib/lab/race-group";
import { shares, swimPaces } from "@/lib/lab/race-stats";
import type { LabData, LapSummary } from "@/lib/lab/types";
import type { Activity } from "@/lib/strava/types";
import { Hint, Panel } from "./LabBits";

interface Entry {
  date: string;
  name: string;
  format: RaceFormat | null;
  location?: string;
  done: boolean;
  result: RaceResult | null;
  /** found in the history by itself (not in site.config.ts) */
  auto: boolean;
  recognisedFrom?: string;
}

const hms = (s: number) => `${Math.floor(s / 3600)}:${String(Math.floor((s % 3600) / 60)).padStart(2, "0")}:${String(Math.round(s % 60)).padStart(2, "0")}`;
const mss = (s: number) => `${Math.floor(s / 60)}:${String(Math.round(s % 60)).padStart(2, "0")}`;
const PART_COLOR = { swim: "var(--swim)", t1: "var(--muted)", bike: "var(--ride)", t2: "var(--muted)", run: "var(--run)" } as const;

export function RacesTab({ activities, lab, profile, todayKey }: { activities: Activity[]; lab: LabData; profile: Profile; todayKey: string }) {
  const { t, fmt } = useI18n();

  const entries = useMemo<Entry[]>(() => {
    const from = siteConfig.lab.racesFrom;
    const out: Entry[] = siteConfig.upcomingRaces.filter((r) => r.date >= from).map((r) => {
      const done = r.date <= todayKey;
      return { date: r.date, name: r.name, format: r.format ?? null, location: r.location, done, result: done && r.format ? groupRace(activities, r.date, r.format) : null, auto: false };
    });
    const known = new Set(out.map((e) => e.date));
    for (const d of detectRaceDays(activities)) {
      if (known.has(d.date) || d.date < from) continue;
      out.push({ date: d.date, name: `${FORMATS[d.format].label} triathlon`, format: d.format, done: true, result: d.result, auto: true, recognisedFrom: d.nameHint });
    }
    // finished races, newest first, then the ones still to come, soonest first
    return out.sort((a, b) => (a.done !== b.done ? (a.done ? -1 : 1) : a.done ? (a.date < b.date ? 1 : -1) : a.date < b.date ? -1 : 1));
  }, [activities, todayKey]);

  const firstDone = entries.find((e) => e.done && e.result)?.date ?? entries[0]?.date;
  const [pick, setPick] = useState<string | null>(null);
  const sel = entries.find((e) => e.date === (pick ?? firstDone)) ?? null;

  if (entries.length === 0) return <Hint>{t("No races yet. Add them in site.config.ts (upcomingRaces) with a format, or race: complete triathlons are recognised automatically.")}</Hint>;

  return (
    <div className="lab-enter space-y-6">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {entries.map((e) => (
          <button
            key={e.date}
            onClick={() => setPick(e.date)}
            aria-pressed={sel?.date === e.date}
            className={`card lab-card lab-glow min-w-0 p-4 text-left sm:p-5 ${sel?.date === e.date ? "border-brand" : ""}`}
          >
            <p className="label flex items-center justify-between gap-2">
              <span>{fmt.dateLabel(`${e.date}T00:00:00`, { day: "2-digit", month: "short", year: "numeric" })}</span>
              <span className={e.done ? "text-brand" : ""} style={e.done ? undefined : { color: "var(--goal)" }}>{e.done ? (e.result?.complete ? t("Done") : t("Done · incomplete")) : t("Upcoming")}</span>
            </p>
            <p className="num mt-1.5 break-words text-2xl uppercase leading-tight">{e.name}</p>
            <p className="mt-1 text-sm text-muted">
              {e.format ? FORMATS[e.format].label : t("Format not set")}
              {e.auto ? ` · ${t("found automatically")}` : ""}
            </p>
            {e.result?.complete && <p className="num mt-3 text-3xl text-brand">{hms(e.result.totalSeconds)}</p>}
          </button>
        ))}
      </div>

      {sel && <Detail entry={sel} lab={lab} profile={profile} todayKey={todayKey} />}
    </div>
  );
}

function Detail({ entry, lab, profile, todayKey }: { entry: Entry; lab: LabData; profile: Profile; todayKey: string }) {
  const { t, fmt, lang } = useI18n();
  const r = entry.result;
  const analysis = lab.raceAnalyses[entry.date];
  const days = Math.max(0, Math.round((Date.parse(`${entry.date}T00:00:00Z`) - Date.parse(`${todayKey}T00:00:00Z`)) / 86_400_000));

  if (!entry.done) {
    return (
      <Panel title={entry.name} subtitle={`${fmt.dateLabel(`${entry.date}T00:00:00`, { day: "2-digit", month: "long", year: "numeric" })}${entry.location ? ` · ${entry.location}` : ""}`}>
        <p className="num text-6xl leading-none" style={{ color: "var(--goal)" }}>{days}</p>
        <p className="label mt-2">{t("day to go|days to go", { n: days })}</p>
        <p className="mt-4 text-sm text-muted">{t("The analysis appears here by itself after the race: the swim, bike and run of the day are grouped into one triathlon with the transitions.")}</p>
      </Panel>
    );
  }
  if (!r) return <Hint>{t("No swim, bike or run found on the day of this race.")}</Hint>;

  const f = entry.format ? FORMATS[entry.format] : null;
  const parts = shares(r);
  const wkg = profile.weight_kg?.value;
  const watts = r.bike?.np ?? r.bike?.watts;
  const ftp = profile.ftp?.value;
  const swimP = r.swim && f ? swimPaces(r.swim, f.swimM) : null;

  return (
    <div className="space-y-6">
      <Panel
        title={entry.name}
        subtitle={`${fmt.dateLabel(`${entry.date}T00:00:00`, { day: "2-digit", month: "long", year: "numeric" })}${f ? ` · ${f.label} · ${t("{swim} swim · {bike} bike · {run} run", { swim: f.swimM >= 1000 ? `${f.swimM / 1000} km` : `${f.swimM} m`, bike: `${f.bikeKm} km`, run: `${f.runKm} km` })}` : ""}`}
        aside={!r.complete ? <span className="label" style={{ color: "var(--goal)" }}>{t("Not all three legs were found")}</span> : undefined}
      >
        <p className="label">{t("Race time")}</p>
        <p className="num text-6xl leading-none text-brand sm:text-8xl">{hms(r.totalSeconds)}</p>

        <div className="mt-6 flex h-5 w-full overflow-hidden rounded-full bg-soft" role="img" aria-label={t("Share of the race time in each part")}>
          {parts.filter((p) => p.seconds > 0).map((p) => (
            <span key={p.key} title={`${t(p.key === "t1" ? "T1" : p.key === "t2" ? "T2" : p.key === "swim" ? "Swim" : p.key === "bike" ? "Bike" : "Run")} · ${hms(p.seconds)} · ${p.pct.toFixed(1)}%`} className="lab-bar block h-full" style={{ width: `${p.pct}%`, background: PART_COLOR[p.key], opacity: p.key === "t1" || p.key === "t2" ? 0.55 : 1 }} />
          ))}
        </div>
        <ul className="mt-3 grid grid-cols-2 gap-x-4 gap-y-1 sm:grid-cols-5">
          {parts.map((p) => (
            <li key={p.key} className="flex items-baseline justify-between gap-2 border-b border-line/60 py-1.5 sm:flex-col sm:items-start sm:border-0">
              <span className="label" style={{ color: p.key === "t1" || p.key === "t2" ? undefined : PART_COLOR[p.key] }}>{p.key === "t1" ? "T1" : p.key === "t2" ? "T2" : t(p.key === "swim" ? "Swim" : p.key === "bike" ? "Bike" : "Run")}</span>
              <span className="num text-xl">{p.seconds ? hms(p.seconds) : "—"}</span>
              <span className="label text-[0.6rem]">{p.seconds ? `${p.pct.toFixed(1)}%` : ""}</span>
            </li>
          ))}
        </ul>
      </Panel>

      <div className="grid gap-6 lg:grid-cols-3">
        <Leg title={t("Swim")} color="var(--swim)" time={r.swim ? hms(r.swim.elapsed) : null}>
          {r.swim && (
            <>
              <Row label={t("Pace on the official distance")} value={swimP ? `${mss(swimP.official)} /100 m` : "—"} />
              <Row label={t("Recorded distance")} value={`${fmt.num(r.swim.distanceM / 1000, 2)} km`} sub={swimP ? `${mss(swimP.recorded)} /100 m ${t("on the recorded distance")}` : undefined} />
              <Row label={t("Heart rate")} value={r.swim.hr ? `${Math.round(r.swim.hr)} bpm` : "—"} sub={r.swim.hrMax ? t("max {n} bpm", { n: Math.round(r.swim.hrMax) }) : undefined} />
            </>
          )}
        </Leg>
        <Leg title={t("Bike")} color="var(--ride)" time={r.bike ? hms(r.bike.elapsed) : null}>
          {r.bike && (
            <>
              <Row label={t("Average speed")} value={`${fmt.num((r.bike.distanceM / 1000) / (r.bike.moving / 3600), 1)} km/h`} sub={`${fmt.num(r.bike.distanceM / 1000, 1)} km`} />
              <Row label={t("Power")} value={watts ? `${Math.round(watts)} W` : "—"} sub={[wkg && watts ? `${fmt.num(watts / wkg, 2)} W/kg` : "", ftp && watts ? t("{n}% of FTP", { n: Math.round((watts / ftp) * 100) }) : "", r.bike.np ? "NP" : t("average")].filter(Boolean).join(" · ")} />
              <Row label={t("Heart rate")} value={r.bike.hr ? `${Math.round(r.bike.hr)} bpm` : "—"} sub={r.bike.elevation ? t("{n} m of climbing", { n: Math.round(r.bike.elevation) }) : undefined} />
            </>
          )}
        </Leg>
        <Leg title={t("Run")} color="var(--run)" time={r.run ? hms(r.run.elapsed) : null}>
          {r.run && (
            <>
              <Row label={t("Average pace")} value={`${mss(r.run.moving / (r.run.distanceM / 1000))} /km`} sub={`${fmt.num(r.run.distanceM / 1000, 2)} km`} />
              <Row label={t("Heart rate")} value={r.run.hr ? `${Math.round(r.run.hr)} bpm` : "—"} sub={r.run.hrMax ? t("max {n} bpm", { n: Math.round(r.run.hrMax) }) : undefined} />
              <Row label={t("Climb")} value={`${Math.round(r.run.elevation)} m`} />
            </>
          )}
        </Leg>
      </div>

      {(analysis?.laps.run || analysis?.laps.bike) && (
        <div className="grid gap-6 lg:grid-cols-2">
          {analysis.laps.bike && <Pacing title={t("Bike pacing")} lap={analysis.laps.bike} color="var(--ride)" />}
          {analysis.laps.run && <Pacing title={t("Run pacing")} lap={analysis.laps.run} color="var(--run)" />}
        </div>
      )}

      <Panel title={t("Race analysis")} subtitle={t("Written by Claude from the numbers of the whole race, the splits and the pacing.")}>
        {analysis ? (
          <>
            <div className="space-y-3 whitespace-pre-line leading-relaxed">{lang === "pt" ? analysis.pt : analysis.en}</div>
            <p className="label mt-4">
              {analysis.model ? `${analysis.model} · ` : ""}
              {new Intl.DateTimeFormat(lang === "pt" ? "pt-BR" : "en-US", { dateStyle: "medium" }).format(new Date(analysis.createdAt))}
            </p>
          </>
        ) : (
          <Hint>{r.complete ? t("The analysis is written automatically after the race (once an Anthropic API key is set on the server). It will appear here.") : t("The analysis needs all three legs.")}</Hint>
        )}
      </Panel>

      <Panel title={t("How the race was put together")} subtitle={t("The activities of the day were grouped by time and by the distances of the race. Warm-ups before the start are left out.")}>
        <ol className="space-y-1.5">
          {[
            r.swim && { label: t("Swim"), a: r.swim.name, s: r.swim.startMs, sec: r.swim.elapsed },
            r.t1 && { label: "T1", a: r.t1.absorbed.map((x) => x.name).join(", ") || t("pause between legs"), s: null, sec: r.t1.seconds },
            r.bike && { label: t("Bike"), a: r.bike.name, s: r.bike.startMs, sec: r.bike.elapsed },
            r.t2 && { label: "T2", a: r.t2.absorbed.map((x) => x.name).join(", ") || t("pause between legs"), s: null, sec: r.t2.seconds },
            r.run && { label: t("Run"), a: r.run.name, s: r.run.startMs, sec: r.run.elapsed },
          ]
            .filter((x): x is { label: string; a: string; s: number | null; sec: number } => !!x)
            .map((x, i) => (
              <li key={i} className="flex flex-wrap items-baseline gap-x-3 border-b border-line/60 py-1.5 last:border-0">
                <span className="label w-14">{x.label}</span>
                <span className="min-w-0 flex-1 truncate text-sm">{x.a}</span>
                <span className="num text-lg">{hms(x.sec)}</span>
                {x.s !== null && <span className="label w-12 text-right">{new Date(x.s).toISOString().slice(11, 16)}</span>}
              </li>
            ))}
        </ol>
        {r.left.length > 0 && (
          <>
            <p className="label mt-5">{t("Left out of the race")}</p>
            <ul className="mt-2 space-y-1">
              {r.left.map((l) => (
                <li key={l.id} className="flex flex-wrap items-baseline gap-x-3 text-sm text-muted">
                  <span className="label w-24">{t(l.kind)}</span>
                  <span className="min-w-0 flex-1 truncate">{l.name}</span>
                  <span>{fmt.duration(l.seconds)}</span>
                </li>
              ))}
            </ul>
          </>
        )}
        {entry.recognisedFrom && <p className="label mt-4">{t("Recognised from: {name}", { name: entry.recognisedFrom })}</p>}
      </Panel>
    </div>
  );
}

function Leg({ title, color, time, children }: { title: string; color: string; time: string | null; children: React.ReactNode }) {
  return (
    <div className="card lab-glow min-w-0 p-4 sm:p-6">
      <div className="flex items-baseline justify-between gap-3">
        <h3 className="num text-2xl uppercase" style={{ color }}>{title}</h3>
        <p className="num text-3xl">{time ?? "—"}</p>
      </div>
      <dl className="mt-4 space-y-3">{children}</dl>
    </div>
  );
}

function Row({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div>
      <dt className="label">{label}</dt>
      <dd className="num mt-0.5 text-2xl">{value}</dd>
      {sub && <p className="label mt-0.5 normal-case">{sub}</p>}
    </div>
  );
}

/** Pace (run) or speed (bike) lap by lap: taller bar = faster. */
function Pacing({ title, lap, color }: { title: string; lap: LapSummary; color: string }) {
  const { t, fmt } = useI18n();
  const [active, setActive] = useState<number | null>(null);
  // taller = faster: for pace (seconds per km) the speed is the inverse
  const speed = (v: number) => (lap.unit === "pace" ? 3600 / v : v);
  const speeds = lap.laps.map((l) => speed(l.v));
  const max = Math.max(...speeds);
  const min = Math.min(...speeds);
  const lo = Math.max(0, min - (max - min) * 0.6);
  const W = 600;
  const H = 150;
  const bw = (W - 20) / lap.laps.length;
  const label = (v: number) => (lap.unit === "pace" ? `${mss(v)} /km` : `${fmt.num(v, 1)} km/h`);
  const delta = lap.unit === "pace" ? ((lap.second - lap.first) / lap.first) * 100 : ((lap.first - lap.second) / lap.first) * 100; // + = second half slower
  const sel = active !== null ? lap.laps[active] : null;

  return (
    <Panel title={title} subtitle={t("First half {a} · second half {b}", { a: label(lap.first), b: label(lap.second) })}>
      <p className="min-h-[2.2rem]">
        {sel ? (
          <>
            <span className="label mr-3">{t("Lap {n}", { n: (active ?? 0) + 1 })} · {fmt.num(sel.km, 1)} km</span>
            <span className="num text-2xl">{label(sel.v)}</span>
            {sel.hr ? <span className="label ml-3">{sel.hr} bpm</span> : null}
            {sel.watts ? <span className="label ml-3">{sel.watts} W</span> : null}
          </>
        ) : (
          <span className="label">{t("Hover (or tap) the bars")}</span>
        )}
      </p>
      <div className="overflow-x-auto">
        <svg viewBox={`0 0 ${W} ${H}`} className="block w-full min-w-[22rem]" role="img" aria-label={title} onPointerLeave={() => setActive(null)}>
          {lap.laps.map((l, i) => {
            const h = ((speeds[i] - lo) / (max - lo || 1)) * (H - 14) + 8;
            return (
              <g key={i}>
                <rect x={10 + i * bw + bw * 0.12} y={H - h} width={bw * 0.76} height={h} rx="2" fill={color} opacity={active === null || active === i ? 0.95 : 0.45} className="lab-grow" style={{ animationDelay: `${Math.min(i, 30) * 25}ms` }} />
                <rect x={10 + i * bw} y={0} width={bw} height={H} fill="transparent" onPointerEnter={() => setActive(i)} onPointerDown={() => setActive(i)} />
              </g>
            );
          })}
        </svg>
      </div>
      <p className="mt-3 text-sm text-muted">
        {Math.abs(delta) < 1.5
          ? t("Very even: the second half was within 1.5% of the first.")
          : delta > 0
            ? t("The second half was {n}% slower than the first.", { n: fmt.num(Math.abs(delta), 1) })
            : t("The second half was {n}% faster than the first: a negative split.", { n: fmt.num(Math.abs(delta), 1) })}
        {lap.hrFirst && lap.hrSecond ? ` ${t("Heart rate {a} → {b} bpm.", { a: lap.hrFirst, b: lap.hrSecond })}` : ""}
      </p>
    </Panel>
  );
}

