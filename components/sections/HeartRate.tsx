"use client";

import { useMemo, useState } from "react";
import { siteConfig, type SportKey } from "@/site.config";
import type { DashboardContext } from "@/lib/dashboard";
import { useI18n } from "@/lib/i18n";
import { usePeriodLabel } from "@/lib/i18n/period";
import { hrTimeHistogram, monthlyHr, paceValue, withHr } from "@/lib/stats";
import { clock } from "@/lib/format";
import { useActivityDialog } from "@/components/ActivityDialog";
import { BarChart, type BarItem } from "@/components/BarChart";
import { ChartCard } from "@/components/ChartCard";
import { LineChart } from "@/components/charts/LineChart";
import { ScatterChart, type ScatterPoint } from "@/components/charts/ScatterChart";
import { Reveal } from "@/components/Reveal";
import { SectionShell } from "@/components/SectionShell";
import { dropSmall, SmallToggle } from "@/components/SmallToggle";

type Tab = "run" | "ride" | "all";

const zones = siteConfig.heartRate.zones;
/** Zone index of a bpm value (inclusive upper limit). */
const zoneIndex = (hr: number) => zones.findIndex((z) => hr <= z.max);
const pct = (arr: number[], p: number) => {
  const s = [...arr].sort((a, b) => a - b);
  return s[Math.min(s.length - 1, Math.floor(p * s.length))];
};

/**
 * Heart-rate analysis. Everything here is based on MOVING time: the average HR of an activity,
 * time spent in each zone, pace and efficiency.
 */
export function HeartRate({ ctx }: { ctx: DashboardContext }) {
  const { t, fmt, locale } = useI18n();
  const open = useActivityDialog();
  const periodLabel = usePeriodLabel(ctx);
  const [tab, setTab] = useState<Tab>("run");
  const [smallZones, setSmallZones] = useState(false);
  const focus: SportKey = tab === "all" ? "run" : tab;
  const focusLabel = t(siteConfig.sports[focus].label).toLowerCase();

  const scope = useMemo(() => ctx.acts.filter((a) => (tab === "all" ? true : a.sport === tab)), [ctx.acts, tab]);
  const list = useMemo(() => withHr(scope), [scope]);
  const byId = useMemo(() => new Map(list.map((a) => [a.id, a])), [list]);

  const stats = useMemo(() => {
    const secs = list.reduce((s, a) => s + a.movingTime, 0);
    const avg = secs ? list.reduce((s, a) => s + a.hr * a.movingTime, 0) / secs : 0;
    const max = Math.max(0, ...list.map((a) => a.hrMax ?? a.hr));
    // time spent in each zone (moving seconds) and number of activities
    const zoneSecs = zones.map(() => 0);
    const zoneCount = zones.map(() => 0);
    for (const a of list) {
      const z = zoneIndex(a.hr);
      zoneSecs[z] += a.movingTime;
      zoneCount[z]++;
    }
    const top = zoneSecs.indexOf(Math.max(...zoneSecs));
    return { avg, max, zoneSecs, zoneCount, top, total: secs, coverage: scope.length ? list.length / scope.length : 0 };
  }, [list, scope.length]);

  // histogram in 5 bpm bands: TIME SPENT (hours of moving time), stacked by zone
  const histogram = useMemo<BarItem[]>(() => {
    const bin = siteConfig.heartRate.bin;
    return hrTimeHistogram(list, bin).map((b) => {
      const perZone = zones.map(() => 0);
      for (const a of list) if (a.hr >= b.from && a.hr < b.from + bin) perZone[zoneIndex(a.hr)] += a.movingTime / 3600;
      return {
        key: String(b.from),
        label: `${b.from}–${b.from + bin - 1} bpm`,
        axis: String(b.from),
        segments: zones.map((z, i) => ({ name: z.name, value: perZone[i], color: z.color })),
      };
    });
  }, [list]);

  // "hide small values": drops the bands with almost no time (under 3% of the total)
  const bars = useMemo(
    () => (smallZones ? dropSmall(histogram, (b) => b.segments.reduce((a, x) => a + x.value, 0), 0.03) : histogram),
    [histogram, smallZones],
  );

  // scatter: pace (or speed) × HR
  const scatter = useMemo(() => {
    const pts = list
      .filter((a) => a.sport === focus)
      .map((a) => ({ a, x: paceValue(a) }))
      .filter((p): p is { a: (typeof list)[number]; x: number } => p.x !== null);
    if (pts.length < 3) return null;
    const xs = pts.map((p) => p.x);
    const ys = pts.map((p) => p.a.hr);
    const secs = focus !== "ride";
    const step = focus === "ride" ? 5 : 30;
    const xLo = Math.floor((pct(xs, 0.01) * 0.97) / step) * step;
    const xHi = Math.ceil((pct(xs, 0.99) * 1.03) / step) * step;
    const yLo = Math.floor((Math.min(...ys) - 3) / 10) * 10;
    const yHi = Math.ceil((Math.max(...ys) + 3) / 10) * 10;
    const yStep = yHi - yLo > 60 ? 20 : 10;
    const fx = (x: number) => (secs ? clock(x) : fmt.num(x, 0));
    const unit = focus === "ride" ? "km/h" : "/km";
    const points: ScatterPoint[] = pts.map(({ a, x }) => ({
      id: a.id,
      x,
      y: a.hr,
      label: `${a.name} · ${fx(x)} ${unit} · ${a.hr} bpm · ${fmt.dateLabel(a.date)}`,
    }));
    const round = focus === "ride" ? 1 : 5;
    return {
      points,
      xDomain: [xLo, xHi] as [number, number],
      yDomain: [yLo, yHi] as [number, number],
      xTicks: Array.from({ length: 5 }, (_, i) => Math.round((xLo + ((xHi - xLo) * i) / 4) / round) * round),
      yTicks: Array.from({ length: Math.floor((yHi - yLo) / yStep) + 1 }, (_, i) => yLo + i * yStep),
      fx,
      reverse: secs,
    };
  }, [list, focus, fmt]);

  // monthly trend
  const months = useMemo(() => monthlyHr(ctx.acts, focus, ctx.range), [ctx.acts, focus, ctx.range]);
  const multiYear = ctx.range.from.slice(0, 4) !== ctx.range.to.slice(0, 4);
  const labelEvery = Math.max(1, Math.ceil(months.length / 12));
  const monthName = (key: string) =>
    new Intl.DateTimeFormat(locale, { month: "short", ...(multiYear ? { year: "2-digit" as const } : {}), timeZone: "UTC" })
      .format(new Date(`${key}-01T00:00:00Z`))
      .replace(".", "");
  const hrPoints = months.map((m) => ({ label: monthName(m.key), value: m.hr }));
  const effPoints = months.map((m) => ({ label: monthName(m.key), value: m.eff }));
  const known = (k: "hr" | "eff") => months.map((m) => m[k]).filter((v): v is number => v !== null);
  const domainOf = (vals: number[], pad: number): [number, number] =>
    vals.length ? [Math.floor(Math.min(...vals) - pad), Math.ceil(Math.max(...vals) + pad)] : [0, 1];
  const hrDomain = domainOf(known("hr"), 4);
  const effVals = known("eff");
  const effDomain: [number, number] = effVals.length
    ? [Math.floor((Math.min(...effVals) - 0.1) * 10) / 10, Math.ceil((Math.max(...effVals) + 0.1) * 10) / 10]
    : [0, 1];
  const ticksOf = ([lo, hi]: [number, number], n = 4) => Array.from({ length: n + 1 }, (_, i) => lo + ((hi - lo) * i) / n);
  const effTrend =
    effVals.length >= 4
      ? (effVals.slice(-2).reduce((a, b) => a + b, 0) / 2 / (effVals.slice(0, 2).reduce((a, b) => a + b, 0) / 2) - 1) * 100
      : null;

  const tabs: { value: Tab; label: string }[] = [
    { value: "run", label: t("Run") },
    { value: "ride", label: t("Bike") },
    { value: "all", label: t("All") },
  ];

  const chips = [
    {
      label: t("Activities with HR"),
      value: `${fmt.num(stats.coverage * 100, 0)}%`,
      sub: t("{a} of {b}", { a: list.length, b: scope.length }),
    },
    { label: t("Average HR"), value: stats.avg ? `${fmt.num(stats.avg, 0)} bpm` : "—", sub: t("weighted by moving time") },
    { label: t("Max HR recorded"), value: stats.max ? `${stats.max} bpm` : "—", sub: t("in a single activity") },
    {
      label: t("Most time spent in"),
      value: list.length ? t(zones[stats.top].name) : "—",
      sub: list.length ? t("{time} of moving time", { time: fmt.duration(stats.zoneSecs[stats.top]) }) : "",
      color: list.length ? zones[stats.top].color : undefined,
    },
  ];

  return (
    <SectionShell
      id="heart"
      title={t("Heart rate")}
      kicker={periodLabel}
      description={t("Time spent in each heart-rate zone, pace versus effort and aerobic efficiency. Everything here uses moving time.")}
      aside={
        <div role="tablist" aria-label={t("Sport")} className="label flex rounded-full border border-line p-1">
          {tabs.map((x) => (
            <button
              key={x.value}
              role="tab"
              aria-selected={tab === x.value}
              onClick={() => setTab(x.value)}
              className={`rounded-full px-4 py-1.5 transition-colors ${tab === x.value ? "bg-fg text-bg" : "hover:text-fg"}`}
            >
              {x.label}
            </button>
          ))}
        </div>
      }
    >
      {list.length === 0 ? (
        <p className="card p-8 text-muted">{t("No activities with heart rate in this period.")}</p>
      ) : (
        <>
          <dl className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            {chips.map((c, i) => (
              <Reveal key={c.label} delay={i * 70}>
                <div className="card h-full p-4 sm:p-5">
                  <dt className="label">{c.label}</dt>
                  <dd className="num mt-2 text-3xl sm:text-4xl" style={c.color ? { color: c.color } : undefined}>
                    {c.value}
                  </dd>
                  <p className="mt-1 text-xs text-muted">{c.sub}</p>
                </div>
              </Reveal>
            ))}
          </dl>

          <div className="mt-5 grid grid-cols-1 gap-5 lg:grid-cols-2">
            <Reveal className="lg:col-span-2">
              <ChartCard
                title={t("Time spent in heart rate zones")}
                controls={<SmallToggle on={smallZones} onChange={setSmallZones} share={0.03} />}
                subtitle={t("Moving time of each activity, grouped by its average HR in 5 bpm bands")}
                hint={periodLabel}
                insight={t("most time: {zone}", { zone: t(zones[stats.top].name) })}
              >
                <BarChart
                  items={bars}
                  format={(v) => fmt.duration(v * 3600)}
                  height={190}
                  labelEvery={Math.max(1, Math.ceil(bars.length / 12))}
                />
                <div className="label mt-5 flex flex-wrap gap-x-5 gap-y-1.5 text-[0.62rem]">
                  {zones.map((z, i) => (
                    <span key={z.name} className="inline-flex items-center gap-2">
                      <span className="size-2.5 rounded-full" style={{ background: z.color }} />
                      {t(z.name)}
                      <span className="text-fg">
                        {i === 0
                          ? t("up to {x}", { x: z.max })
                          : z.max === Infinity
                            ? `${zones[i - 1].max + 1}+`
                            : `${zones[i - 1].max + 1}–${z.max}`}{" "}
                        bpm
                      </span>
                      <span>
                        · {fmt.duration(stats.zoneSecs[i])} ({stats.total ? Math.round((stats.zoneSecs[i] / stats.total) * 100) : 0}%)
                      </span>
                    </span>
                  ))}
                </div>
              </ChartCard>
            </Reveal>

            <Reveal>
              <ChartCard
                title={focus === "ride" ? t("Speed × HR") : t("Pace × HR")}
                subtitle={focus === "ride" ? t("Faster, harder") : t("Faster (to the right), harder")}
                hint={focusLabel}
              >
                {scatter ? (
                  <ScatterChart
                    points={scatter.points}
                    xDomain={scatter.xDomain}
                    yDomain={scatter.yDomain}
                    xTicks={scatter.xTicks}
                    yTicks={scatter.yTicks}
                    formatX={scatter.fx}
                    formatY={(y) => String(y)}
                    reverseX={scatter.reverse}
                    onPick={(id) => {
                      const a = byId.get(id);
                      if (a) open(a);
                    }}
                    color={`var(--${focus})`}
                  />
                ) : (
                  <p className="py-10 text-muted">{t("Few data points in this period.")}</p>
                )}
              </ChartCard>
            </Reveal>

            <Reveal delay={90}>
              <ChartCard
                title={t("Average HR by month")}
                subtitle={t("Average heart-rate effort in {sport}", { sport: focusLabel })}
                hint={periodLabel}
              >
                <LineChart
                  points={hrPoints}
                  format={(v) => `${fmt.num(v, 0)} bpm`}
                  domain={hrDomain}
                  yTicks={ticksOf(hrDomain)}
                  labelEvery={labelEvery}
                  color="var(--run)"
                />
              </ChartCard>
            </Reveal>

            <Reveal className="lg:col-span-2">
              <ChartCard
                title={t("Aerobic efficiency")}
                subtitle={t("Meters covered per heartbeat in {sport} (higher = more efficient)", { sport: focusLabel })}
                hint={periodLabel}
                insight={
                  effTrend !== null
                    ? t("{x}% since the start of the period", { x: `${effTrend >= 0 ? "+" : ""}${fmt.num(effTrend, 1)}` })
                    : undefined
                }
              >
                <LineChart
                  points={effPoints}
                  format={(v) => `${fmt.num(v, 2)} m/beat`}
                  domain={effDomain}
                  yTicks={ticksOf(effDomain)}
                  labelEvery={labelEvery}
                  color="var(--brand)"
                />
                <p className="mt-4 text-sm text-muted">
                  {t("Only activities above the minimum distance count ({d}). Compare months with similar terrain and heat for the fairest reading.", {
                    d: focus === "ride" ? "10 km" : "3 km",
                  })}
                </p>
              </ChartCard>
            </Reveal>
          </div>

          <p className="label mt-5 text-[0.62rem]">
            {t("Zones use absolute bpm and can be adjusted in site.config.ts")}
          </p>
        </>
      )}
    </SectionShell>
  );
}
