"use client";

import { useMemo, useState } from "react";
import { siteConfig, type SportKey } from "@/site.config";
import type { DashboardContext } from "@/lib/dashboard";
import { hrHistogram, monthlyHr, paceValue, withHr } from "@/lib/stats";
import { clock, dateLabel, duration } from "@/lib/format";
import { useActivityDialog } from "@/components/ActivityDialog";
import { BarChart, type BarItem } from "@/components/BarChart";
import { ChartCard } from "@/components/ChartCard";
import { LineChart } from "@/components/charts/LineChart";
import { ScatterChart, type ScatterPoint } from "@/components/charts/ScatterChart";
import { Reveal } from "@/components/Reveal";
import { SectionShell } from "@/components/SectionShell";

type Tab = "run" | "ride" | "all";

const zones = siteConfig.heartRate.zones;
/** Índice da zona de um bpm (limite superior inclusivo). */
const zoneIndex = (hr: number) => zones.findIndex((z) => hr <= z.max);
const nf = (d: number) => new Intl.NumberFormat(siteConfig.locale, { maximumFractionDigits: d });
const pct = (arr: number[], p: number) => {
  const s = [...arr].sort((a, b) => a - b);
  return s[Math.min(s.length - 1, Math.floor(p * s.length))];
};
const monthShort = (key: string, withYear: boolean) =>
  new Intl.DateTimeFormat(siteConfig.locale, {
    month: "short",
    ...(withYear ? { year: "2-digit" as const } : {}),
    timeZone: "UTC",
  })
    .format(new Date(`${key}-01T00:00:00Z`))
    .replace(".", "");

/** Análise de frequência cardíaca: zonas, ritmo × FC, tendência e eficiência aeróbica. */
export function HeartRate({ ctx }: { ctx: DashboardContext }) {
  const open = useActivityDialog();
  const [tab, setTab] = useState<Tab>("run");
  const focus: SportKey = tab === "all" ? "run" : tab;
  const focusLabel = siteConfig.sports[focus].label.toLowerCase();

  const scope = useMemo(
    () => ctx.acts.filter((a) => (tab === "all" ? true : a.sport === tab)),
    [ctx.acts, tab],
  );
  const list = useMemo(() => withHr(scope), [scope]);
  const byId = useMemo(() => new Map(list.map((a) => [a.id, a])), [list]);

  const stats = useMemo(() => {
    const secs = list.reduce((s, a) => s + a.movingTime, 0);
    const avg = secs ? list.reduce((s, a) => s + a.hr * a.movingTime, 0) / secs : 0;
    const max = Math.max(0, ...list.map((a) => a.hrMax ?? a.hr));
    const counts = zones.map(() => 0);
    for (const a of list) counts[zoneIndex(a.hr)]++;
    const top = counts.indexOf(Math.max(...counts));
    return { avg, max, counts, top, coverage: scope.length ? list.length / scope.length : 0 };
  }, [list, scope.length]);

  // histograma em faixas de 5 bpm; cada barra é empilhada por zona (uma faixa pode cruzar o corte)
  const histogram = useMemo<BarItem[]>(() => {
    const bin = siteConfig.heartRate.bin;
    return hrHistogram(list, bin).map((b) => {
      const perZone = zones.map(() => 0);
      for (const a of list) if (a.hr >= b.from && a.hr < b.from + bin) perZone[zoneIndex(a.hr)]++;
      return {
        key: String(b.from),
        label: `${b.from}–${b.from + bin - 1} bpm`,
        axis: String(b.from),
        segments: zones.map((z, i) => ({ name: z.name, value: perZone[i], color: z.color })),
      };
    });
  }, [list]);

  // dispersão: ritmo (ou velocidade) × FC
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
    const fx = (x: number) => (secs ? clock(x) : nf(0).format(x));
    const unit = focus === "ride" ? "km/h" : "/km";
    const points: ScatterPoint[] = pts.map(({ a, x }) => ({
      id: a.id,
      x,
      y: a.hr,
      label: `${a.name} · ${fx(x)} ${unit} · ${a.hr} bpm · ${dateLabel(a.date)}`,
    }));
    const round = focus === "ride" ? 1 : 5;
    return {
      points,
      xDomain: [xLo, xHi] as [number, number],
      yDomain: [yLo, yHi] as [number, number],
      xTicks: Array.from({ length: 5 }, (_, i) => Math.round((xLo + ((xHi - xLo) * i) / 4) / round) * round),
      yTicks: Array.from({ length: Math.floor((yHi - yLo) / yStep) + 1 }, (_, i) => yLo + i * yStep),
      fx,
      unit,
      reverse: secs,
    };
  }, [list, focus]);

  // tendência mensal
  const months = useMemo(
    () => monthlyHr(ctx.acts, focus, ctx.period, ctx.firstYear, ctx.today),
    [ctx.acts, focus, ctx.period, ctx.firstYear, ctx.today],
  );
  const multiYear = ctx.period === "all";
  const labelEvery = Math.max(1, Math.ceil(months.length / 12));
  const hrPoints = months.map((m) => ({ label: monthShort(m.key, multiYear), value: m.hr }));
  const effPoints = months.map((m) => ({ label: monthShort(m.key, multiYear), value: m.eff }));
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
    { value: "run", label: "Corrida" },
    { value: "ride", label: "Bike" },
    { value: "all", label: "Todas" },
  ];

  const chips = [
    { label: "Atividades com FC", value: `${nf(0).format(stats.coverage * 100)}%`, sub: `${list.length} de ${scope.length}` },
    { label: "FC média", value: stats.avg ? `${nf(0).format(stats.avg)} bpm` : "—", sub: "ponderada pelo tempo" },
    { label: "FC máxima registrada", value: stats.max ? `${stats.max} bpm` : "—", sub: "em uma atividade" },
    {
      label: "Zona mais frequente",
      value: list.length ? zones[stats.top].name : "—",
      sub: list.length ? `${stats.counts[stats.top]} atividades` : "",
    },
  ];

  return (
    <SectionShell
      id="heart"
      title="Frequência cardíaca"
      kicker={ctx.periodLabel}
      aside={
        <div role="tablist" aria-label="Modalidade" className="label flex rounded-full border border-line p-1">
          {tabs.map((t) => (
            <button
              key={t.value}
              role="tab"
              aria-selected={tab === t.value}
              onClick={() => setTab(t.value)}
              className={`rounded-full px-4 py-1.5 transition-colors ${tab === t.value ? "bg-fg text-bg" : "hover:text-fg"}`}
            >
              {t.label}
            </button>
          ))}
        </div>
      }
    >
      {list.length === 0 ? (
        <p className="card p-8 text-muted">Nenhuma atividade com frequência cardíaca neste período.</p>
      ) : (
        <>
          <dl className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            {chips.map((c, i) => (
              <Reveal key={c.label} delay={i * 70}>
                <div className="card h-full p-4 sm:p-5">
                  <dt className="label">{c.label}</dt>
                  <dd className="num mt-2 text-3xl sm:text-4xl" style={c.label === "Zona mais frequente" ? { color: zones[stats.top].color } : undefined}>
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
                title="Zonas de frequência cardíaca"
                subtitle="FC média de cada atividade, agrupada em faixas de 5 bpm"
                hint={ctx.periodLabel}
                insight={`mais frequente: ${zones[stats.top].name}`}
              >
                <BarChart
                  items={histogram}
                  format={(v) => `${nf(0).format(v)} ${v === 1 ? "atividade" : "atividades"}`}
                  height={190}
                  labelEvery={Math.max(1, Math.ceil(histogram.length / 12))}
                />
                <div className="label mt-5 flex flex-wrap gap-x-5 gap-y-1.5 text-[0.62rem]">
                  {zones.map((z, i) => (
                    <span key={z.name} className="inline-flex items-center gap-2">
                      <span className="size-2.5 rounded-full" style={{ background: z.color }} />
                      {z.name}
                      <span className="text-fg">
                        {i === 0 ? `até ${z.max}` : z.max === Infinity ? `${zones[i - 1].max + 1}+` : `${zones[i - 1].max + 1}–${z.max}`} bpm
                      </span>
                      <span>· {stats.counts[i]}</span>
                    </span>
                  ))}
                </div>
              </ChartCard>
            </Reveal>

            <Reveal>
              <ChartCard
                title={focus === "ride" ? "Velocidade × FC" : "Ritmo × FC"}
                subtitle={focus === "ride" ? "Mais rápido, mais esforço" : "Mais rápido (à direita), mais esforço"}
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
                  <p className="py-10 text-muted">Poucos dados neste período.</p>
                )}
              </ChartCard>
            </Reveal>

            <Reveal delay={90}>
              <ChartCard title="FC média por mês" subtitle={`Esforço cardíaco médio em ${focusLabel}`} hint={ctx.periodLabel}>
                <LineChart
                  points={hrPoints}
                  format={(v) => `${nf(0).format(v)} bpm`}
                  domain={hrDomain}
                  yTicks={ticksOf(hrDomain)}
                  labelEvery={labelEvery}
                  color="var(--run)"
                />
              </ChartCard>
            </Reveal>

            <Reveal className="lg:col-span-2">
              <ChartCard
                title="Eficiência aeróbica"
                subtitle={`Metros percorridos por batimento em ${focusLabel} (quanto maior, mais eficiente)`}
                hint={ctx.periodLabel}
                insight={effTrend !== null ? `${effTrend >= 0 ? "+" : ""}${nf(1).format(effTrend)}% desde o início do período` : undefined}
              >
                <LineChart
                  points={effPoints}
                  format={(v) => `${nf(2).format(v)} m/bat`}
                  domain={effDomain}
                  yTicks={ticksOf(effDomain)}
                  labelEvery={labelEvery}
                  color="var(--brand)"
                />
                <p className="mt-4 text-sm text-muted">
                  Só entram atividades acima da distância mínima ({focus === "ride" ? "10 km" : focus === "run" ? "3 km" : "400 m"}). Comparar meses
                  com terreno e calor parecidos dá a leitura mais justa.
                </p>
              </ChartCard>
            </Reveal>
          </div>

          <p className="label mt-5 text-[0.62rem]">
            Atividade média de {duration(list.reduce((s, a) => s + a.movingTime, 0) / list.length)} · as zonas usam bpm absolutos e podem ser ajustadas em
            site.config.ts
          </p>
        </>
      )}
    </SectionShell>
  );
}
