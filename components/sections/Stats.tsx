"use client";

import { useEffect, useMemo, useState } from "react";
import { ALL_SPORTS, siteConfig, TRI_SPORTS, type SportKey } from "@/site.config";
import type { DashboardContext } from "@/lib/dashboard";
import type { WeatherSummary } from "@/lib/strava/weather-summary";
import {
  annualTotals,
  distanceDistribution,
  hourHistogram,
  paceValues,
  weekdayAverages,
} from "@/lib/stats";
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

type Filter = "all" | SportKey;
type Units = "metric" | "imperial";

const WEEKDAYS = ["Seg", "Ter", "Qua", "Qui", "Sex", "Sáb", "Dom"];
const MI = 1609.344;
const nf = (d: number) => new Intl.NumberFormat(siteConfig.locale, { maximumFractionDigits: d });
const pct = (arr: number[], p: number) => {
  const s = [...arr].sort((a, b) => a - b);
  return s[Math.min(s.length - 1, Math.floor(p * s.length))];
};

/** Escala do gráfico de ritmo conforme a modalidade. */
function paceView(sport: SportKey, values: number[]) {
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
    reverse: secs, // menos segundos = mais rápido, vai para a direita
    format: (x: number) => (secs ? clock(x) : nf(0).format(x)),
    unit: sport === "run" ? "/km" : sport === "swim" ? "/100m" : "km/h",
  };
}

export function Stats({ ctx }: { ctx: DashboardContext }) {
  const [filter, setFilter] = useState<Filter>("all");
  const [units, setUnits] = useState<Units>("metric");
  const [more, setMore] = useState(false);
  const [weather, setWeather] = useState<WeatherSummary | null>(null);
  const [weatherFailed, setWeatherFailed] = useState(false);

  const sports: SportKey[] = filter === "all" ? TRI_SPORTS : [filter];
  const focus: SportKey = filter === "all" ? "run" : filter; // gráficos de uma modalidade só
  const focusLabel = siteConfig.sports[focus].label.toLowerCase();
  const byTime = filter === "strength"; // força não tem distância
  const dist = (m: number) => (units === "metric" ? m / 1000 : m / MI);
  const unit = units === "metric" ? "km" : "mi";
  const color = (s: SportKey) => `var(--${s})`;

  // clima: busca só quando o usuário abre "mais gráficos"
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

  const annual = useMemo<BarItem[]>(
    () =>
      annualTotals(ctx.all, ctx.firstYear, ctx.currentYear).map((y) => ({
        key: String(y.year),
        label: String(y.year),
        segments: sports.map((s) => ({
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
  const view = useMemo(() => (paces.length >= 3 ? paceView(focus, paces) : null), [paces, focus]);

  const split = useMemo(() => {
    const list = ctx.acts.filter((a) => sports.includes(a.sport));
    const closed = list.filter((a) => a.indoor).length;
    return { open: list.length - closed, closed };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ctx.acts, filter]);

  const sum = (it: BarItem) => it.segments.reduce((a, s) => a + s.value, 0);
  const bestYear = annual.reduce((b, it) => (sum(it) > sum(b) ? it : b), annual[0]);
  const peakHour = hours.indexOf(Math.max(...hours));
  const bestDay = weekdays.indexOf(Math.max(...weekdays));

  const wTemp = weather
    ? TEMP_BANDS.map((b, i) => ({
        label: b.label,
        sub: b.range,
        value: sports.reduce((a, s) => a + weather.temp[i][s], 0),
      }))
    : [];
  const wCond = weather
    ? CONDITIONS.map((c, i) => ({ label: c.label, value: sports.reduce((a, s) => a + weather.cond[i][s], 0) }))
        .filter((c) => c.value > 0)
        .sort((a, b) => b.value - a.value)
    : [];

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
            subtitle="Em que hora do dia você costuma treinar"
            insight={Math.max(...hours) > 0 ? `pico: ${peakHour}h` : undefined}
            hint={ctx.periodLabel}
          >
            <RadarChart
              labels={hours.map((_, h) => `${h}h`)}
              values={hours}
              labelEvery={3}
              format={(v) => `${nf(0).format(v)} ${v === 1 ? "atividade" : "atividades"}`}
            />
          </ChartCard>
        </Reveal>

        <Reveal delay={90}>
          <ChartCard
            title={byTime ? "Dia da semana" : `Distância média por dia (${unit})`}
            subtitle="Quanto você acumula em cada dia da semana"
            insight={!byTime && Math.max(...weekdays) > 0 ? `${WEEKDAYS[bestDay]} é o dia mais forte` : undefined}
            hint={ctx.periodLabel}
          >
            {byTime ? (
              <p className="py-10 text-muted">Treino de força não tem distância; veja horas por ano acima.</p>
            ) : (
              <RadarChart labels={WEEKDAYS} values={weekdays} format={(v) => `${nf(1).format(v)} ${unit}`} />
            )}
          </ChartCard>
        </Reveal>

        {more && (
          <>
            <Reveal>
              <ChartCard
                title="Distribuição de distâncias"
                subtitle={byTime ? undefined : `Atividades de ${focusLabel} por faixa de distância`}
                hint={ctx.periodLabel}
                insight={filter === "all" ? "corrida" : undefined}
              >
                {byTime ? (
                  <p className="py-10 text-muted">Sem distância para treino de força.</p>
                ) : (
                  <HBarChart
                    items={bins.map((b) => ({ label: b.label, value: b.count, color: color(focus) }))}
                    format={(v) => nf(0).format(v)}
                  />
                )}
              </ChartCard>
            </Reveal>

            <Reveal delay={90}>
              <ChartCard
                title="Ar livre × ambiente fechado"
                subtitle="Esteira, rolo, Zwift e piscina contam como fechado"
                hint={ctx.periodLabel}
              >
                {split.open + split.closed === 0 ? (
                  <p className="py-10 text-muted">Sem atividades neste período.</p>
                ) : (
                  <DonutChart
                    segments={[
                      { name: "Ar livre", value: split.open, color: "var(--brand)" },
                      { name: "Ambiente fechado", value: split.closed, color: "var(--muted)" },
                    ]}
                    format={(v) => nf(0).format(v)}
                  />
                )}
              </ChartCard>
            </Reveal>

            <Reveal className="lg:col-span-2">
              <ChartCard
                title={focus === "ride" ? "Distribuição de velocidade" : "Distribuição de ritmo"}
                subtitle={`Como as suas atividades de ${focusLabel} se distribuem${focus === "ride" ? "" : " (mais rápido à direita)"}`}
                hint={ctx.periodLabel}
                insight={filter === "all" ? "corrida" : undefined}
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
                  <p className="py-10 text-muted">Poucos dados neste período.</p>
                )}
              </ChartCard>
            </Reveal>

            <Reveal>
              <ChartCard
                title="Temperatura"
                subtitle="Faixas de temperatura nos treinos ao ar livre"
                insight={weather?.avgTemp != null ? `média ${nf(1).format(weather.avgTemp)}°C` : undefined}
                hint="todos os anos"
              >
                {weatherFailed ? (
                  <p className="py-10 text-muted">Não consegui carregar o clima agora.</p>
                ) : !weather ? (
                  <p className="label animate-pulse py-10">Carregando clima…</p>
                ) : byTime ? (
                  <p className="py-10 text-muted">Sem clima para treino de força.</p>
                ) : (
                  <HBarChart items={wTemp} format={(v) => nf(0).format(v)} />
                )}
              </ChartCard>
            </Reveal>

            <Reveal delay={90}>
              <ChartCard title="Condições do tempo" subtitle="Como estava o tempo quando você treinou" hint="todos os anos">
                {weatherFailed ? (
                  <p className="py-10 text-muted">Não consegui carregar o clima agora.</p>
                ) : !weather ? (
                  <p className="label animate-pulse py-10">Carregando clima…</p>
                ) : byTime || wCond.length === 0 ? (
                  <p className="py-10 text-muted">Sem dados de clima para esta seleção.</p>
                ) : (
                  <HBarChart items={wCond} format={(v) => nf(0).format(v)} color="var(--swim)" />
                )}
              </ChartCard>
            </Reveal>
          </>
        )}
      </div>

      <div className="mt-6 flex flex-wrap items-center justify-between gap-4">
        <div className="label flex flex-wrap gap-x-5 gap-y-1 text-[0.62rem]">
          {(filter === "all" ? ALL_SPORTS : [filter]).map((s) => (
            <span key={s} className="inline-flex items-center gap-2">
              <span className="size-2 rounded-full" style={{ background: color(s) }} />
              {siteConfig.sports[s].label}
            </span>
          ))}
        </div>
        <button
          onClick={() => setMore((v) => !v)}
          className="label rounded-full border border-line px-5 py-2.5 transition-colors hover:border-fg/40 hover:text-fg"
        >
          {more ? "Mostrar menos gráficos" : "Mostrar mais gráficos"}
        </button>
      </div>
    </SectionShell>
  );
}
