"use client";

import type { DashboardContext } from "@/lib/dashboard";
import { dateLabel, duration } from "@/lib/format";
import { upcoming } from "@/lib/races";
import { useNow } from "@/lib/use-now";
import { Reveal } from "@/components/Reveal";
import { SectionShell } from "@/components/SectionShell";

const DAY = 86_400_000;
const when = (iso: string) => dateLabel(`${iso}T00:00:00`, { day: "2-digit", month: "long", year: "numeric" });

/** Próximas provas: a mais próxima em destaque, com contagem regressiva. */
export function Races({ ctx }: { ctx: DashboardContext }) {
  const now = useNow(ctx.today.getTime(), 3_600_000);
  const [next, ...others] = upcoming(now);
  if (!next) return null;

  // média de horas por semana nas últimas 8 semanas
  const since = new Date(now - 56 * DAY).toISOString().slice(0, 10);
  const recentSecs = ctx.all.filter((a) => a.date.slice(0, 10) >= since).reduce((s, a) => s + a.movingTime, 0);

  return (
    <SectionShell id="races" title="Próximas provas" kicker="o foco">
      <Reveal>
        <div className="relative overflow-hidden rounded-[var(--radius)] border border-goal/40 bg-elev p-6 sm:p-10">
          <div
            aria-hidden
            className="pointer-events-none absolute -right-24 -top-24 size-80 rounded-full opacity-25 blur-3xl"
            style={{ background: "var(--goal)" }}
          />
          <div className="relative grid items-end gap-8 sm:grid-cols-[1fr_auto]">
            <div className="min-w-0">
              <p className="label" style={{ color: "var(--goal)" }}>
                Próxima · {when(next.date)}
              </p>
              <h3 className="num mt-3 text-5xl uppercase sm:text-7xl">{next.name}</h3>
              <p className="mt-3 text-muted">
                {next.location}
                {next.note ? ` · ${next.note}` : ""}
              </p>
              <p className="label mt-6">
                Carga recente <span className="text-fg">{duration(recentSecs / 8)}</span> por semana (média de 8 semanas)
              </p>
            </div>

            <div className="sm:text-right">
              {next.days > 0 ? (
                <>
                  <p className="num text-8xl sm:text-9xl" style={{ color: "var(--goal)" }}>
                    {next.days}
                  </p>
                  <p className="label mt-2">{next.days === 1 ? "dia para a prova" : "dias para a prova"}</p>
                </>
              ) : (
                <p className="num text-6xl uppercase" style={{ color: "var(--goal)" }}>
                  É hoje!
                </p>
              )}
            </div>
          </div>
        </div>
      </Reveal>

      {others.length > 0 && (
        <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
          {others.map((r, i) => (
            <Reveal key={r.name + r.date} delay={i * 90}>
              <div className="card flex h-full items-end justify-between gap-4 p-5 sm:p-6">
                <div className="min-w-0">
                  <p className="label">{when(r.date)}</p>
                  <p className="num mt-2 text-3xl uppercase sm:text-4xl">{r.name}</p>
                  <p className="mt-2 text-sm text-muted">
                    {r.location}
                    {r.note ? ` · ${r.note}` : ""}
                  </p>
                </div>
                <div className="shrink-0 text-right">
                  <p className="num text-6xl" style={{ color: "var(--goal)" }}>
                    {r.days}
                  </p>
                  <p className="label mt-1 text-[0.6rem]">{r.days === 1 ? "dia" : "dias"}</p>
                </div>
              </div>
            </Reveal>
          ))}
        </div>
      )}
    </SectionShell>
  );
}
