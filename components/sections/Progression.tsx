"use client";

import { useMemo, useState } from "react";
import { siteConfig } from "@/site.config";
import type { DashboardContext } from "@/lib/dashboard";
import { heatmapDays, streaks, type HeatDay } from "@/lib/stats";
import { dateLabel, duration, timeOfDay } from "@/lib/format";
import { useActivityDialog } from "@/components/ActivityDialog";
import { HEAT_MIX, Heatmap } from "@/components/Heatmap";
import { Reveal } from "@/components/Reveal";
import { SectionShell } from "@/components/SectionShell";
import { SportIcon } from "@/components/SportIcon";

type View = "365" | "all" | number;
const DAY = 86_400_000;

export function Progression({ ctx }: { ctx: DashboardContext }) {
  const open = useActivityDialog();
  const [view, setView] = useState<View>("365");
  const [selected, setSelected] = useState<HeatDay | null>(null);
  const colorBySport = siteConfig.rules.heatmapColorBySport;

  const todayKey = ctx.today.toISOString().slice(0, 10);

  /** Um bloco de dias por linha do heatmap. */
  const blocks = useMemo(() => {
    const yearRange = (y: number) => heatmapDays(ctx.all, `${y}-01-01`, `${y}-12-31`, todayKey);
    if (view === "365") {
      const start = new Date(ctx.today.getTime() - 364 * DAY).toISOString().slice(0, 10);
      return [{ label: "", days: heatmapDays(ctx.all, start, todayKey, todayKey) }];
    }
    if (view === "all") {
      return [...ctx.years].reverse().map((y) => ({ label: String(y), days: yearRange(y) }));
    }
    return [{ label: "", days: yearRange(view) }];
  }, [ctx.all, ctx.today, ctx.years, todayKey, view]);

  const st = useMemo(() => streaks(blocks.flatMap((b) => b.days)), [blocks]);
  const tabs: { value: View; label: string }[] = [
    { value: "365", label: "Últimos 365" },
    { value: "all", label: "Todos" },
    ...[...ctx.years].reverse().map((y) => ({ value: y as View, label: String(y) })),
  ];

  const chips = [
    { label: "Dias de descanso", value: `${st.restDays}/${st.totalDays}` },
    { label: "Sequência atual", value: `${st.current}d` },
    { label: "Maior sequência", value: `${st.longest}d` },
  ];

  return (
    <SectionShell
      id="progression"
      title="Progressão"
      kicker="consistência"
      aside={
        <dl className="flex gap-6">
          {chips.map((c) => (
            <div key={c.label}>
              <dt className="label">{c.label}</dt>
              <dd className="num mt-1 text-3xl">{c.value}</dd>
            </div>
          ))}
        </dl>
      }
    >
      <Reveal>
        <div className="card p-5 sm:p-8">
          <div role="tablist" aria-label="Período do heatmap" className="label -mx-1 mb-6 flex gap-1.5 overflow-x-auto px-1 pb-1 [scrollbar-width:none]">
            {tabs.map((t) => (
              <button
                key={String(t.value)}
                role="tab"
                aria-selected={view === t.value}
                onClick={() => {
                  setView(t.value);
                  setSelected(null);
                }}
                className={`shrink-0 rounded-full border px-3.5 py-1.5 transition-colors ${
                  view === t.value ? "border-fg bg-fg text-bg" : "border-line hover:text-fg"
                }`}
              >
                {t.label}
              </button>
            ))}
          </div>

          {/* leitura do dia selecionado */}
          <div className="min-h-16">
            {selected ? (
              <>
                <p className="label">{dateLabel(selected.date, { weekday: "short", day: "2-digit", month: "long", year: "numeric" })}</p>
                {selected.activities.length === 0 ? (
                  <p className="mt-2 text-muted">Dia de descanso</p>
                ) : (
                  <ul className="mt-2 flex flex-wrap gap-2">
                    {selected.activities.map((a) => (
                      <li key={a.id}>
                        <button
                          onClick={() => open(a)}
                          className="inline-flex items-center gap-2 rounded-full border border-line px-3 py-1.5 text-sm transition-colors hover:border-fg/40"
                        >
                          <span style={{ color: `var(--${a.sport})` }}>
                            <SportIcon sport={a.sport} className="size-4" />
                          </span>
                          {a.name}
                          <span className="text-muted">
                            {timeOfDay(a.date)} · {duration(a.movingTime)}
                          </span>
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </>
            ) : (
              <>
                <p className="label">Passe o mouse (ou toque) em um dia</p>
                <p className="mt-2 text-muted">Cada quadrado é um dia; quanto mais forte a cor, mais tempo treinado. Clique para ver os treinos.</p>
              </>
            )}
          </div>

          <div className={`mt-4 space-y-3 ${view === "all" ? "" : ""}`}>
            {blocks.map((b) => (
              <Heatmap
                key={`${view}-${b.label}`}
                days={b.days}
                colorBySport={colorBySport}
                cell={view === "all" ? 11 : 14}
                gap={view === "all" ? 2 : 3}
                scrollToEnd={view === "365" || view === ctx.currentYear}
                selected={selected?.date}
                onSelect={setSelected}
                label={b.label}
              />
            ))}
          </div>

          <div className="label mt-4 flex flex-wrap items-center justify-between gap-3 text-[0.62rem]">
            <span className="flex items-center gap-4">
              {(["swim", "ride", "run", "strength"] as const).map((s) => (
                <span key={s} className="inline-flex items-center gap-1.5">
                  <span className="size-2.5 rounded-[3px]" style={{ background: `var(--${s})` }} />
                  {siteConfig.sports[s].label}
                </span>
              ))}
            </span>
            <span className="flex items-center gap-2">
              Menos
              {[0, 1, 2, 3, 4].map((l) => (
                <span
                  key={l}
                  className="size-3 rounded-[3px]"
                  style={{
                    background: l === 0 ? "var(--bg-soft)" : `color-mix(in oklab, var(--fg) ${HEAT_MIX[l]}%, var(--bg-soft))`,
                  }}
                />
              ))}
              Mais
            </span>
          </div>
        </div>
      </Reveal>
    </SectionShell>
  );
}
