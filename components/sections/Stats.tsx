"use client";

import { useMemo, useState } from "react";
import { ALL_SPORTS, siteConfig, TRI_SPORTS, type SportKey } from "@/site.config";
import type { DashboardContext } from "@/lib/dashboard";
import { annualTotals, hourHistogram, weekdayAverages } from "@/lib/stats";
import { BarChart, type BarItem } from "@/components/BarChart";
import { Reveal } from "@/components/Reveal";
import { SectionShell } from "@/components/SectionShell";

type Filter = "all" | SportKey;
type Units = "metric" | "imperial";

const WEEKDAYS = ["Seg", "Ter", "Qua", "Qui", "Sex", "Sáb", "Dom"];
const MI = 1609.344;

const nf = (d: number) => new Intl.NumberFormat(siteConfig.locale, { maximumFractionDigits: d });

export function Stats({ ctx }: { ctx: DashboardContext }) {
  const [filter, setFilter] = useState<Filter>("all");
  const [units, setUnits] = useState<Units>("metric");

  const sports: SportKey[] = filter === "all" ? TRI_SPORTS : [filter];
  const byTime = filter === "strength"; // força não tem distância: usamos horas
  const dist = (m: number) => (units === "metric" ? m / 1000 : m / MI);
  const unit = units === "metric" ? "km" : "mi";
  const color = (s: SportKey) => `var(--${s})`;

  const annual = useMemo<BarItem[]>(
    () =>
      annualTotals(ctx.all, ctx.firstYear, ctx.currentYear).map((y) => ({
        key: String(y.year),
        label: ctx.years.length > 8 ? `’${String(y.year).slice(2)}` : String(y.year),
        segments: sports.map((s) => ({
          name: s,
          value: byTime ? y.secs[s] / 3600 : dist(y.dist[s]),
          color: color(s),
        })),
      })),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [ctx.all, ctx.firstYear, ctx.currentYear, ctx.years.length, filter, units],
  );

  const hours = useMemo<BarItem[]>(() => {
    const per = Object.fromEntries(
      ALL_SPORTS.map((s) => [s, hourHistogram(ctx.acts.filter((a) => a.sport === s))]),
    ) as Record<SportKey, number[]>;
    const use: SportKey[] = filter === "all" ? ALL_SPORTS : [filter];
    return Array.from({ length: 24 }, (_, h) => ({
      key: String(h),
      label: `${h}h`,
      segments: use.map((s) => ({ name: s, value: per[s][h], color: color(s) })),
    }));
  }, [ctx.acts, filter]);

  const weekdays = useMemo<BarItem[]>(() => {
    const per = Object.fromEntries(
      sports.map((s) => [s, weekdayAverages(ctx.acts.filter((a) => a.sport === s))]),
    ) as Record<SportKey, number[]>;
    return WEEKDAYS.map((label, i) => ({
      key: label,
      label,
      segments: sports.map((s) => ({ name: s, value: byTime ? 0 : dist(per[s][i]), color: color(s) })),
    }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ctx.acts, filter, units]);

  const sum = (it: BarItem) => it.segments.reduce((a, s) => a + s.value, 0);
  const bestYear = annual.reduce((b, it) => (sum(it) > sum(b) ? it : b), annual[0]);
  const peakHour = hours.reduce((b, it) => (sum(it) > sum(b) ? it : b), hours[0]);
  const bestDay = weekdays.reduce((b, it) => (sum(it) > sum(b) ? it : b), weekdays[0]);

  const filters: { value: Filter; label: string }[] = [
    { value: "all", label: "Tudo" },
    ...ALL_SPORTS.map((s) => ({ value: s as Filter, label: siteConfig.sports[s].label })),
  ];

  return (
    <SectionShell
      id="stats"
      title="Estatísticas"
      kicker="medido, não chutado"
      aside={
        <div className="flex flex-wrap items-center gap-3">
          <div role="tablist" aria-label="Modalidade" className="label flex flex-wrap rounded-full border border-line p-1">
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
          <div role="tablist" aria-label="Unidades" className="label flex rounded-full border border-line p-1">
            {(["metric", "imperial"] as Units[]).map((u) => (
              <button
                key={u}
                role="tab"
                aria-selected={units === u}
                onClick={() => setUnits(u)}
                className={`rounded-full px-3 py-1.5 transition-colors ${units === u ? "bg-fg text-bg" : "hover:text-fg"}`}
              >
                {u === "metric" ? "Métrico" : "Imperial"}
              </button>
            ))}
          </div>
        </div>
      }
    >
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
        <Reveal className="lg:col-span-2">
          <ChartCard
            title={byTime ? "Horas por ano" : `Distância anual (${unit})`}
            insight={bestYear && sum(bestYear) > 0 ? `${bestYear.key} foi o ano mais forte` : undefined}
          >
            <BarChart
              items={annual}
              format={(v) => (byTime ? `${nf(0).format(v)}h` : `${nf(0).format(v)} ${unit}`)}
              height={190}
            />
          </ChartCard>
        </Reveal>

        <Reveal>
          <ChartCard
            title="Atividades por horário"
            insight={peakHour && sum(peakHour) > 0 ? `pico: ${peakHour.label}` : undefined}
            hint={ctx.periodLabel}
          >
            <BarChart items={hours} format={(v) => `${nf(0).format(v)} ativ.`} labelEvery={3} />
          </ChartCard>
        </Reveal>

        <Reveal delay={90}>
          <ChartCard
            title={byTime ? "Dia da semana" : `Distância média por dia (${unit})`}
            insight={!byTime && bestDay && sum(bestDay) > 0 ? `${bestDay.label} é o dia mais forte` : undefined}
            hint={ctx.periodLabel}
          >
            {byTime ? (
              <p className="py-10 text-muted">Treino de força não tem distância; veja horas por ano ao lado.</p>
            ) : (
              <BarChart items={weekdays} format={(v) => `${nf(1).format(v)} ${unit}`} />
            )}
          </ChartCard>
        </Reveal>
      </div>

      <div className="label mt-5 flex flex-wrap gap-x-5 gap-y-1 text-[0.62rem]">
        {(filter === "all" ? ALL_SPORTS : [filter]).map((s) => (
          <span key={s} className="inline-flex items-center gap-2">
            <span className="size-2 rounded-full" style={{ background: color(s) }} />
            {siteConfig.sports[s].label}
          </span>
        ))}
      </div>
    </SectionShell>
  );
}

function ChartCard({
  title,
  insight,
  hint,
  children,
}: {
  title: string;
  insight?: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="card h-full p-5 sm:p-7">
      <div className="mb-5 flex flex-wrap items-baseline justify-between gap-x-4">
        <h3 className="num text-2xl uppercase sm:text-3xl">{title}</h3>
        <p className="label">
          {hint && <span className="mr-3">{hint}</span>}
          {insight && <span className="text-brand">{insight}</span>}
        </p>
      </div>
      {children}
    </div>
  );
}
