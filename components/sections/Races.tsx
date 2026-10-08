"use client";

import type { DashboardContext } from "@/lib/dashboard";
import { useI18n } from "@/lib/i18n";
import { upcoming } from "@/lib/races";
import { useNow } from "@/lib/use-now";
import { Reveal } from "@/components/Reveal";
import { SectionShell } from "@/components/SectionShell";

const DAY = 86_400_000;

/** Upcoming races: the nearest one is highlighted, with a countdown. */
export function Races({ ctx }: { ctx: DashboardContext }) {
  const { t, fmt } = useI18n();
  const now = useNow(ctx.today.getTime(), 3_600_000);
  const [next, ...others] = upcoming(now);
  if (!next) return null;
  const when = (iso: string) => fmt.dateLabel(`${iso}T00:00:00`, { day: "2-digit", month: "long", year: "numeric" });

  // average weekly load over the last 8 weeks (ELAPSED time, it is volume)
  const since = new Date(now - 56 * DAY).toISOString().slice(0, 10);
  const recentSecs = ctx.all.filter((a) => a.date.slice(0, 10) >= since).reduce((s, a) => s + a.elapsedTime, 0);

  return (
    <SectionShell
      id="races"
      title={t("Upcoming races")}
      kicker={t("the focus")}
      description={t("The next goals, with a countdown and the recent weekly load.")}
    >
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
                {t("Next")} · {when(next.date)}
              </p>
              <h3 className="num mt-3 text-5xl uppercase sm:text-7xl">{next.name}</h3>
              <p className="mt-3 text-muted">
                {next.location ? t(next.location) : ""}
                {next.note ? ` · ${t(next.note)}` : ""}
              </p>
              <p className="label mt-6">
                {t("Recent load")} <span className="text-fg">{fmt.duration(recentSecs / 8)}</span> {t("per week (8-week average)")}
              </p>
            </div>

            <div className="sm:text-right">
              {next.days > 0 ? (
                <>
                  <p className="num text-8xl sm:text-9xl" style={{ color: "var(--goal)" }}>
                    {next.days}
                  </p>
                  <p className="label mt-2">{t("day to the race|days to the race", { n: next.days })}</p>
                </>
              ) : (
                <p className="num text-6xl uppercase" style={{ color: "var(--goal)" }}>
                  {t("It is race day!")}
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
                    {r.location ? t(r.location) : ""}
                    {r.note ? ` · ${t(r.note)}` : ""}
                  </p>
                </div>
                <div className="shrink-0 text-right">
                  <p className="num text-6xl" style={{ color: "var(--goal)" }}>
                    {r.days}
                  </p>
                  <p className="label mt-1 text-[0.6rem]">{t("day|days", { n: r.days })}</p>
                </div>
              </div>
            </Reveal>
          ))}
        </div>
      )}
    </SectionShell>
  );
}
