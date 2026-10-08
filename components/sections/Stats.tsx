"use client";

import { useEffect, useMemo, useState } from "react";
import { ALL_SPORTS, siteConfig, TRI_SPORTS, type SportKey } from "@/site.config";
import type { DashboardContext } from "@/lib/dashboard";
import type { WeatherSummary } from "@/lib/strava/weather-summary";
import { useI18n } from "@/lib/i18n";
import { usePeriodLabel } from "@/lib/i18n/period";
import { annualTotals, distanceDistribution, hourHistogram, paceValues, weekdayAverages } from "@/lib/stats";
import { clock } from "@/lib/format";
import { CONDITIONS, TEMP_BANDS } from "@/lib/weather";
import { BarChart, type BarItem } from "@/components/BarChart";
import { ChartCard } from "@/components/ChartCard";
import { DensityChart } from "@/components/charts/DensityChart";
import { DonutChart } from "@/components/charts/DonutChart";
import { HBarChart } from "@/components/charts/HBarChart";
import { RadarChart } from "@/components/charts/RadarChart";
import { Reveal } from "@/components/Reveal";
import { SectionShell } from "@/components/SectionShell";
import { dropSmall, SmallToggle } from "@/components/SmallToggle";

type Filter = "all" | SportKey;
type Units = "metric" | "imperial";

const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const MI = 1609.344;
/** Applies the "hide small values" filter when it is on. */
const trim = <T,>(items: T[], on: boolean, value: (i: T) => number) => (on ? dropSmall(items, value) : items);
const pct = (arr: number[], p: number) => {
  const s = [...arr].sort((a, b) => a - b);
  return s[Math.min(s.length - 1, Math.floor(p * s.length))];
};

/** Scale of the pace chart for each sport. */
function paceView(sport: SportKey, values: number[], num: (v: number, d?: number) => string) {
  const secs = sport !== "ride";
  const lo0 = pct(values, 0.01);
  const hi0 = pct(values, 0.99);
  const step = sport === "ride" ? 5 : sport === "swim" ? 10 : 30;
  const lo = Math.floor((lo0 * 0.97) / step) * step;
  const hi = Math.ceil((hi0 * 1.03) / step) * step;
  const round = sport === "ride" ? 1 : 5;
  const ticks = Array.from({ length: 5 }, (_, i) => Math.round((lo + ((hi - lo) * i) / 4) / round) * round);
  return {
    domain: [lo, hi] as [number, number],
    ticks,
    bandwidth: sport === "run" ? 9 : sport === "swim" ? 4 : 1.3,
    reverse: secs, // fewer seconds = faster, goes to the right
    format: (x: number) => (secs ? clock(x) : num(x, 0)),
    unit: sport === "run" ? "/km" : sport === "swim" ? "/100m" : "km/h",
  };
}

export function Stats({ ctx }: { ctx: DashboardContext }) {
  const { t, fmt } = useI18n();
  const periodLabel = usePeriodLabel(ctx);
  const [filter, setFilter] = useState<Filter>("all");
  const [units, setUnits] = useState<Units>("metric");
  const [more, setMore] = useState(false);
  const [smallDist, setSmallDist] = useState(false);
  const [smallTemp, setSmallTemp] = useState(false);
  const [smallCond, setSmallCond] = useState(false);
  const [weather, setWeather] = useState<WeatherSummary | null>(null);
  const [weatherFailed, setWeatherFailed] = useState(false);

  const sports: SportKey[] = filter === "all" ? TRI_SPORTS : [filter];
  const focus: SportKey = filter === "all" || filter === "other" ? "run" : filter; // single-sport charts
  const focusLabel = t(siteConfig.sports[focus].label).toLowerCase();
  const byTime = filter === "strength" || filter === "other"; // no distance: show hours
  const dist = (m: number) => (units === "metric" ? m / 1000 : m / MI);
  const unit = units === "metric" ? "km" : "mi";
  const color = (s: SportKey) => `var(--${s})`;

  // weather: only fetched when the user opens "more charts"
  useEffect(() => {
    if (!more || weather || weatherFailed) return;
    let alive = true;
    fetch("/api/weather")
      .then((r) => (r.ok ? (r.json() as Promise<WeatherSummary>) : Promise.reject(new Error(String(r.status)))))
      .then((w) => alive && setWeather(w))
      .catch(() => alive && setWeatherFailed(true));
    return () => {
      alive = false;
    };
  }, [more, weather, weatherFailed]);

  // yearly totals: distance, or ELAPSED hours for sports without distance
  const annual = useMemo<BarItem[]>(
    () =>
      annualTotals(ctx.all, ctx.firstYear, ctx.currentYear).map((y) => ({
        key: String(y.year),
        label: String(y.year),
        segments: (byTime ? [filter as SportKey] : sports).map((s) => ({
          name: s,
          value: byTime ? y.secs[s] / 3600 : dist(y.dist[s]),
          color: color(s),
        })),
      })),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [ctx.all, ctx.firstYear, ctx.currentYear, filter, units],
  );

  const inFilter = useMemo(
    () => ctx.acts.filter((a) => (filter === "all" ? true : a.sport === filter)),
    [ctx.acts, filter],
  );
  const hours = useMemo(() => hourHistogram(inFilter), [inFilter]);
  const weekdays = useMemo(
    () => weekdayAverages(inFilter).map((m) => dist(m)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [inFilter, units],
  );

  const bins = useMemo(() => distanceDistribution(ctx.acts, focus), [ctx.acts, focus]);
  const paces = useMemo(() => paceValues(ctx.acts, focus), [ctx.acts, focus]);
  const view = useMemo(() => (paces.length >= 3 ? paceView(focus, paces, fmt.num) : null), [paces, focus, fmt.num]);

  // outdoor × indoor, one chart per sport (does not depend on the filter above)
  const splitOf = (sport: SportKey) => {
    const list = ctx.acts.filter((a) => a.sport === sport);
    const closed = list.filter((a) => a.indoor).length;
    return { open: list.length - closed, closed };
  };
  const runSplit = useMemo(() => splitOf("run"), [ctx.acts]); // eslint-disable-line react-hooks/exhaustive-deps
  const rideSplit = useMemo(() => splitOf("ride"), [ctx.acts]); // eslint-disable-line react-hooks/exhaustive-deps

  const sum = (it: BarItem) => it.segments.reduce((a, s) => a + s.value, 0);
  const bestYear = annual.reduce((b, it) => (sum(it) > sum(b) ? it : b), annual[0]);
  const peakHour = hours.indexOf(Math.max(...hours));
  const bestDay = weekdays.indexOf(Math.max(...weekdays));

  const wTemp = weather
    ? TEMP_BANDS.map((b, i) => ({
        label: t(b.label),
        sub: b.range,
        value: sports.reduce((a, s) => a + weather.temp[i][s], 0),
      }))
    : [];
  const wCond = weather
    ? CONDITIONS.map((c, i) => ({ label: t(c.label), value: sports.reduce((a, s) => a + weather.cond[i][s], 0) }))
        .filter((c) => c.value > 0)
        .sort((a, b) => b.value - a.value)
    : [];

  const filters: { value: Filter; label: string }[] = [
    { value: "all", label: t("All") },
    ...ALL_SPORTS.map((s) => ({ value: s as Filter, label: t(siteConfig.sports[s].label) })),
  ];

  return (
    <SectionShell
      id="stats"
      title={t("Stats")}
      kicker={t("measured, not guessed")}
      description={t("When, how much and where you train. Pick a sport to focus; open more charts for distances, pace, indoor vs outdoor and weather.")}
      aside={
        <div className="flex flex-wrap items-center gap-3">
          <div role="tablist" aria-label={t("Sport")} className="label flex flex-wrap rounded-full border border-line p-1">
            {filters.map((f) => (
              <button
                key={f.value}
                role="tab"
                aria-selected={filter === f.value}
                onClick={() => setFilter(f.value)}
                className={`rounded-full px-3 py-1.5 transition-colors ${filter === f.value ? "bg-fg text-bg" : "hover:text-fg"}`}
              >
                {f.label}
              </button>
            ))}
          </div>
          <div role="tablist" aria-label={t("Units")} className="label flex rounded-full border border-line p-1">
            {(["metric", "imperial"] as Units[]).map((u) => (
              <button
                key={u}
                role="tab"
                aria-selected={units === u}
                onClick={() => setUnits(u)}
                className={`rounded-full px-3 py-1.5 transition-colors ${units === u ? "bg-fg text-bg" : "hover:text-fg"}`}
              >
                {u === "metric" ? t("Metric") : t("Imperial")}
              </button>
            ))}
          </div>
        </div>
      }
    >
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
        <Reveal className="lg:col-span-2">
          <ChartCard
            title={byTime ? t("Elapsed hours per year") : t("Yearly distance ({unit})", { unit })}
            insight={bestYear && sum(bestYear) > 0 ? t("{year} was the strongest year", { year: bestYear.key }) : undefined}
          >
            <BarChart
              items={annual}
              format={(v) => (byTime ? `${fmt.num(v, 0)}h` : `${fmt.num(v, 0)} ${unit}`)}
              height={190}
            />
          </ChartCard>
        </Reveal>

        <Reveal>
          <ChartCard
            title={t("Activities by time of day")}
            subtitle={t("What time of day you usually train")}
            insight={Math.max(...hours) > 0 ? t("peak: {h}h", { h: peakHour }) : undefined}
            hint={periodLabel}
          >
            <RadarChart
              labels={hours.map((_, h) => `${h}h`)}
              values={hours}
              labelEvery={3}
              format={(v) => t("{n} activity|{n} activities", { n: v })}
            />
          </ChartCard>
        </Reveal>

        <Reveal delay={90}>
          <ChartCard
            title={byTime ? t("Day of the week") : t("Average distance by day ({unit})", { unit })}
            subtitle={t("How much you accumulate on each day of the week")}
            insight={
              !byTime && Math.max(...weekdays) > 0 ? t("{day} is the strongest day", { day: t(WEEKDAYS[bestDay]) }) : undefined
            }
            hint={periodLabel}
          >
            {byTime ? (
              <p className="py-10 text-muted">{t("This sport has no distance; see elapsed hours per year above.")}</p>
            ) : (
              <RadarChart labels={WEEKDAYS.map((d) => t(d))} values={weekdays} format={(v) => `${fmt.num(v, 1)} ${unit}`} />
            )}
          </ChartCard>
        </Reveal>

        {more && (
          <>
            <p className="label border-b border-line pb-2 pt-4 lg:col-span-2">{t("Indoor vs outdoor")}</p>
            <Reveal>
              <ChartCard
                title={t("Run: outdoor × treadmill")}
                subtitle={t("Runs without GPS (treadmill) count as indoor")}
                hint={periodLabel}
              >
                {runSplit.open + runSplit.closed === 0 ? (
                  <p className="py-10 text-muted">{t("No runs in this period.")}</p>
                ) : (
                  <DonutChart
                    segments={[
                      { name: t("Outdoor"), value: runSplit.open, color: "var(--run)" },
                      { name: t("Treadmill"), value: runSplit.closed, color: "var(--muted)" },
                    ]}
                    format={(v) => fmt.num(v, 0)}
                  />
                )}
              </ChartCard>
            </Reveal>

            <Reveal delay={90}>
              <ChartCard
                title={t("Bike: outdoor × trainer/Zwift")}
                subtitle={t("Trainer, Zwift and rides without GPS count as indoor")}
                hint={periodLabel}
              >
                {rideSplit.open + rideSplit.closed === 0 ? (
                  <p className="py-10 text-muted">{t("No rides in this period.")}</p>
                ) : (
                  <DonutChart
                    segments={[
                      { name: t("Outdoor"), value: rideSplit.open, color: "var(--ride)" },
                      { name: t("Trainer / Zwift"), value: rideSplit.closed, color: "var(--muted)" },
                    ]}
                    format={(v) => fmt.num(v, 0)}
                  />
                )}
              </ChartCard>
            </Reveal>

            <p className="label border-b border-line pb-2 pt-4 lg:col-span-2">{t("Distance and pace")}</p>
            <Reveal>
              <ChartCard
                title={t("Distance distribution")}
                controls={<SmallToggle on={smallDist} onChange={setSmallDist} />}
                subtitle={byTime ? undefined : t("{sport} activities by distance band", { sport: focusLabel })}
                hint={periodLabel}
                insight={filter === "all" ? t("run") : undefined}
              >
                {byTime ? (
                  <p className="py-10 text-muted">{t("No distance for this sport.")}</p>
                ) : (
                  <HBarChart
                    items={trim(
                      bins.map((b) => ({ label: t(b.label), value: b.count, color: color(focus) })),
                      smallDist,
                      (i) => i.value,
                    )}
                    format={(v) => fmt.num(v, 0)}
                  />
                )}
              </ChartCard>
            </Reveal>

            <Reveal delay={90}>
              <ChartCard
                title={focus === "ride" ? t("Speed distribution") : t("Pace distribution")}
                subtitle={
                  focus === "ride"
                    ? t("How your {sport} activities are distributed", { sport: focusLabel })
                    : t("How your {sport} activities are distributed (faster on the right)", { sport: focusLabel })
                }
                hint={periodLabel}
                insight={filter === "all" ? t("run") : undefined}
              >
                {view && !byTime ? (
                  <DensityChart
                    values={paces}
                    domain={view.domain}
                    bandwidth={view.bandwidth}
                    ticks={view.ticks}
                    format={view.format}
                    reverse={view.reverse}
                    unit={view.unit}
                    color={color(focus)}
                  />
                ) : (
                  <p className="py-10 text-muted">{t("Few data points in this period.")}</p>
                )}
              </ChartCard>
            </Reveal>

            <p className="label border-b border-line pb-2 pt-4 lg:col-span-2">{t("Weather")}</p>
            <Reveal>
              <ChartCard
                title={t("Temperature")}
                controls={<SmallToggle on={smallTemp} onChange={setSmallTemp} />}
                subtitle={t("Temperature bands in outdoor workouts")}
                insight={weather?.avgTemp != null ? t("avg {x}°C", { x: fmt.num(weather.avgTemp, 1) }) : undefined}
                hint={t("all years")}
              >
                {weatherFailed ? (
                  <p className="py-10 text-muted">{t("Could not load the weather right now.")}</p>
                ) : !weather ? (
                  <p className="label animate-pulse py-10">{t("Loading weather…")}</p>
                ) : byTime ? (
                  <p className="py-10 text-muted">{t("No weather for this sport.")}</p>
                ) : (
                  <HBarChart items={trim(wTemp, smallTemp, (i) => i.value)} format={(v) => fmt.num(v, 0)} />
                )}
              </ChartCard>
            </Reveal>

            <Reveal delay={90}>
              <ChartCard
                title={t("Weather conditions")}
                subtitle={t("What the weather was like when you trained")}
                hint={t("all years")}
                controls={<SmallToggle on={smallCond} onChange={setSmallCond} />}
              >
                {weatherFailed ? (
                  <p className="py-10 text-muted">{t("Could not load the weather right now.")}</p>
                ) : !weather ? (
                  <p className="label animate-pulse py-10">{t("Loading weather…")}</p>
                ) : byTime || wCond.length === 0 ? (
                  <p className="py-10 text-muted">{t("No weather data for this selection.")}</p>
                ) : (
                  <HBarChart items={trim(wCond, smallCond, (i) => i.value)} format={(v) => fmt.num(v, 0)} color="var(--swim)" />
                )}
              </ChartCard>
            </Reveal>
          </>
        )}
      </div>

      <div className="mt-6 flex flex-wrap items-center justify-between gap-4">
        <div className="label flex flex-wrap gap-x-5 gap-y-1 text-[0.62rem]">
          {(filter === "all" ? TRI_SPORTS : [filter]).map((s) => (
            <span key={s} className="inline-flex items-center gap-2">
              <span className="size-2 rounded-full" style={{ background: color(s) }} />
              {t(siteConfig.sports[s].label)}
            </span>
          ))}
        </div>
        <button
          onClick={() => setMore((v) => !v)}
          className="label rounded-full border border-line px-5 py-2.5 transition-colors hover:border-fg/40 hover:text-fg"
        >
          {more ? t("Show fewer charts") : t("Show more charts")}
        </button>
      </div>
    </SectionShell>
  );
}
