"use client";

import { useMemo } from "react";
import { siteConfig, type SportKey } from "@/site.config";
import type { DashboardContext } from "@/lib/dashboard";
import type { Activity } from "@/lib/strava/types";
import { bestPace, maxBy, monthlyVolume, peak, weeklyVolume } from "@/lib/stats";
import { dateLabel, duration, int, km, pace } from "@/lib/format";
import { useActivityDialog } from "@/components/ActivityDialog";
import { Reveal } from "@/components/Reveal";
import { SectionShell } from "@/components/SectionShell";

interface Rec {
  label: string;
  sport: SportKey;
  value: string;
  unit: string;
  sub: string;
  activity?: Activity;
}

/** Recordes e destaques do período. Cada card com treino abre os detalhes ao clicar. */
export function Notable({ ctx }: { ctx: DashboardContext }) {
  const open = useActivityDialog();
  const { acts, period, firstYear, today } = ctx;

  const recs = useMemo(() => {
    const out: Rec[] = [];
    const add = (
      label: string,
      sport: SportKey,
      a: Activity | null,
      fmt: (a: Activity) => { value: string; unit: string },
    ) => {
      if (a) out.push({ label, sport, activity: a, sub: a.distance > 0 ? `${km(a.distance, a.sport === "swim" ? 2 : 1)} km · ${a.name}` : a.name, ...fmt(a) });
    };

    // "mais longa" = maior tempo em movimento; a distância vai na linha de baixo
    add("Corrida mais longa", "run", maxBy(acts, (a) => a.movingTime, "run"), (a) => ({ value: duration(a.movingTime), unit: "" }));
    add("Pedal mais longo", "ride", maxBy(acts, (a) => a.movingTime, "ride"), (a) => ({ value: duration(a.movingTime), unit: "" }));
    add("Nado mais longo", "swim", maxBy(acts, (a) => a.movingTime, "swim"), (a) => ({ value: duration(a.movingTime), unit: "" }));

    const climb = maxBy(acts, (a) => a.elevation);
    add("Maior elevação", climb?.sport ?? "ride", climb, (a) => ({ value: int(a.elevation), unit: "m" }));

    for (const sport of ["run", "ride", "swim"] as SportKey[]) {
      const label =
        sport === "ride" ? "Maior velocidade média" : `Melhor ritmo · ${siteConfig.sports[sport].label.toLowerCase()}`;
      add(label, sport, bestPace(acts, sport), (a) => pace(sport, a.distance / a.movingTime));
    }

    // semana (ano) ou mês (todos) mais pesado
    const series = period === "all" ? monthlyVolume(acts, period, firstYear, today) : weeklyVolume(acts, period, today);
    const best = peak(series);
    if (best) {
      const key = best.point.key;
      const when =
        period === "all"
          ? new Intl.DateTimeFormat(siteConfig.locale, { month: "long", year: "numeric", timeZone: "UTC" }).format(
              new Date(key + "-01T00:00:00Z"),
            )
          : "semana de " + dateLabel(key + "T00:00:00");
      out.push({
        label: period === "all" ? "Mês mais pesado" : "Semana mais pesada",
        sport: "run",
        value: duration(best.seconds),
        unit: "",
        sub: when,
      });
    }
    return out;
  }, [acts, period, firstYear, today]);

  return (
    <SectionShell id="notable" title="Destaques" kicker={ctx.periodLabel}>
      {recs.length === 0 ? (
        <p className="text-muted">Sem atividades neste período.</p>
      ) : (
        <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
          {recs.map((r, i) => {
            const Tag = r.activity ? "button" : "div";
            return (
              <Reveal key={r.label} delay={(i % 4) * 80}>
                <Tag
                  {...(r.activity ? { onClick: () => open(r.activity!), type: "button" as const } : {})}
                  className="card block h-full w-full p-4 text-left transition-colors hover:border-fg/30 sm:p-5"
                >
                  <p className="label flex items-center gap-2">
                    <span className="size-2 shrink-0 rounded-full" style={{ background: `var(--${r.sport})` }} />
                    {r.label}
                  </p>
                  <p className="mt-5 flex items-baseline gap-1.5">
                    <span className="num text-5xl sm:text-6xl" style={{ color: `var(--${r.sport})` }}>
                      {r.value}
                    </span>
                    {r.unit && <span className="num text-xl text-muted">{r.unit}</span>}
                  </p>
                  <p className="mt-5 truncate text-sm">{r.sub}</p>
                  {r.activity && (
                    <p className="mt-0.5 text-sm text-muted">
                      {dateLabel(r.activity.date, { day: "2-digit", month: "short", year: "numeric" })}
                    </p>
                  )}
                </Tag>
              </Reveal>
            );
          })}
        </div>
      )}
      <p className="label mt-6 text-[0.62rem]">
        Ritmo/velocidade só contam atividades acima de {km(siteConfig.rules.minDistanceForBestPace.run, 0)} km (corrida),{" "}
        {km(siteConfig.rules.minDistanceForBestPace.ride, 0)} km (bike) e {int(siteConfig.rules.minDistanceForBestPace.swim)} m
        (natação).
      </p>
    </SectionShell>
  );
}
