"use client";

import { siteConfig, TRI_SPORTS, type SportKey } from "@/site.config";
import type { DashboardContext } from "@/lib/dashboard";
import { useI18n } from "@/lib/i18n";
import { usePeriodLabel } from "@/lib/i18n/period";
import { useActivityDialog } from "@/components/ActivityDialog";
import { CountUp } from "@/components/CountUp";
import { Reveal } from "@/components/Reveal";
import { SectionShell } from "@/components/SectionShell";
import { SportIcon } from "@/components/SportIcon";

// Order in which the sports appear. Reorder to change the emphasis.
const ORDER: SportKey[] = ["swim", "ride", "run"];

export function SportCards({ ctx }: { ctx: DashboardContext }) {
  const { t, fmt } = useI18n();
  const open = useActivityDialog();
  const periodLabel = usePeriodLabel(ctx);
  const strength = ctx.sports.strength;
  const other = ctx.sports.other;

  return (
    <SectionShell
      id="sports"
      title={t("By sport")}
      kicker={periodLabel}
      description={t("Totals and averages per sport. Time is elapsed; pace and speed use moving time.")}
    >
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-3">
        {ORDER.filter((s) => TRI_SPORTS.includes(s)).map((sport, i) => {
          const st = ctx.sports[sport];
          const cfg = siteConfig.sports[sport];
          // average pace/speed = distance / MOVING time
          const p = fmt.pace(sport, st.avgSpeed);
          const color = `var(--${sport})`;
          return (
            <Reveal key={sport} delay={i * 110}>
              <article className="card relative h-full overflow-hidden p-6 sm:p-7">
                <div aria-hidden className="absolute inset-x-0 top-0 h-1" style={{ background: color }} />
                <div className="flex items-center justify-between" style={{ color }}>
                  <span className="num text-3xl uppercase">{t(cfg.label)}</span>
                  <SportIcon sport={sport} className="size-7" />
                </div>

                <p className="mt-8 flex items-baseline gap-2">
                  <CountUp
                    value={st.distance / 1000}
                    decimals={sport === "swim" && st.distance < 100_000 ? 1 : 0}
                    className="num text-6xl sm:text-8xl"
                  />
                  <span className="num text-2xl text-muted">km</span>
                </p>

                <dl className="mt-8 grid grid-cols-2 gap-x-4 gap-y-6">
                  <Metric label={t("Elapsed time")} value={fmt.duration(st.elapsedTime)} />
                  <Metric label={t("Activities")} value={fmt.int(st.count)} />
                  <Metric
                    label={cfg.unitLabel === "speed" ? t("Avg speed") : t("Avg pace")}
                    value={p.value}
                    unit={p.unit}
                  />
                  {sport !== "swim" && <Metric label={t("Elevation")} value={fmt.int(st.elevation)} unit="m" />}
                </dl>

                {st.longest && (
                  <button
                    onClick={() => open(st.longest!)}
                    className="mt-8 block w-full border-t border-line pt-4 text-left transition-opacity hover:opacity-80"
                  >
                    <p className="label">{t("Longest · moving time")} ↗</p>
                    <p className="mt-2 truncate font-medium">{st.longest.name}</p>
                    <p className="mt-1 text-sm text-muted">
                      <span className="text-fg">{fmt.duration(st.longest.movingTime)}</span> ·{" "}
                      {fmt.km(st.longest.distance, 1)} km · {fmt.dateLabel(st.longest.date)}
                    </p>
                  </button>
                )}
              </article>
            </Reveal>
          );
        })}
      </div>

      {/* Strength and other sports: no dedicated tab, just a summary line each */}
      {[strength, other]
        .filter((s) => s.count > 0)
        .map((s, i) => (
          <Reveal key={s.sport} delay={300 + i * 100}>
            <article className="card relative mt-5 flex flex-wrap items-center justify-between gap-6 overflow-hidden p-6 sm:px-7">
              <div aria-hidden className="absolute inset-y-0 left-0 w-1" style={{ background: `var(--${s.sport})` }} />
              <div className="flex items-center gap-4" style={{ color: `var(--${s.sport})` }}>
                <SportIcon sport={s.sport} className="size-7" />
                <span className="num text-3xl uppercase">{t(siteConfig.sports[s.sport].label)}</span>
              </div>
              <dl className="flex flex-wrap gap-x-10 gap-y-4">
                <Metric label={t("Elapsed time")} value={fmt.duration(s.elapsedTime)} />
                <Metric label={t("Sessions")} value={fmt.int(s.count)} />
                <Metric label={t("Avg per session")} value={fmt.duration(s.elapsedTime / s.count)} />
              </dl>
            </article>
          </Reveal>
        ))}
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
