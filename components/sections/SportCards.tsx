import { siteConfig, type SportKey } from "@/site.config";
import type { DashboardContext } from "@/lib/dashboard";
import { SPORTS } from "@/lib/stats";
import { dateLabel, duration, int, km, pace } from "@/lib/format";
import { CountUp } from "@/components/CountUp";
import { Reveal } from "@/components/Reveal";
import { SectionShell } from "@/components/SectionShell";
import { SportIcon } from "@/components/SportIcon";

// Ordem em que as modalidades aparecem. Reordene para mudar o destaque.
const ORDER: SportKey[] = ["swim", "ride", "run"];

export function SportCards({ ctx }: { ctx: DashboardContext }) {
  return (
    <SectionShell id="modalidades" index="01" title="Por modalidade">
      <div className="grid gap-5 lg:grid-cols-3">
        {ORDER.filter((s) => SPORTS.includes(s)).map((sport, i) => {
          const st = ctx.sports[sport];
          const cfg = siteConfig.sports[sport];
          const p = pace(sport, st.avgSpeed);
          const color = `var(--${sport})`;
          return (
            <Reveal key={sport} delay={i * 110}>
              <article className="card relative h-full overflow-hidden p-6 sm:p-7">
                <div aria-hidden className="absolute inset-x-0 top-0 h-1" style={{ background: color }} />
                <div className="flex items-center justify-between" style={{ color }}>
                  <span className="num text-3xl uppercase">{cfg.label}</span>
                  <SportIcon sport={sport} className="size-7" />
                </div>

                <p className="mt-8 flex items-baseline gap-2">
                  <CountUp
                    value={st.distance / 1000}
                    decimals={sport === "swim" ? 1 : 0}
                    className="num text-7xl sm:text-8xl"
                  />
                  <span className="num text-2xl text-muted">km</span>
                </p>

                <dl className="mt-8 grid grid-cols-2 gap-x-4 gap-y-6">
                  <Metric label="Tempo" value={duration(st.movingTime)} />
                  <Metric label="Atividades" value={int(st.count)} />
                  <Metric label={`${cfg.unitLabel} médio`} value={p.value} unit={p.unit} />
                  {sport !== "swim" && <Metric label="Elevação" value={int(st.elevation)} unit="m" />}
                </dl>

                {st.longest && (
                  <div className="mt-8 border-t border-line pt-4">
                    <p className="label">Maior atividade</p>
                    <p className="mt-2 truncate font-medium">{st.longest.name}</p>
                    <p className="mt-1 text-sm text-muted">
                      {km(st.longest.distance, 1)} km · {duration(st.longest.movingTime)} ·{" "}
                      {dateLabel(st.longest.date)}
                    </p>
                  </div>
                )}
              </article>
            </Reveal>
          );
        })}
      </div>
    </SectionShell>
  );
}

function Metric({ label, value, unit }: { label: string; value: string; unit?: string }) {
  return (
    <div>
      <dt className="label">{label}</dt>
      <dd className="mt-1.5 flex items-baseline gap-1">
        <span className="num text-3xl">{value}</span>
        {unit && <span className="text-sm text-muted">{unit}</span>}
      </dd>
    </div>
  );
}
