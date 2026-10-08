"use client";

import { useMemo } from "react";
import { siteConfig, type SportKey } from "@/site.config";
import type { DashboardContext } from "@/lib/dashboard";
import type { Activity } from "@/lib/strava/types";
import { useI18n } from "@/lib/i18n";
import { usePeriodLabel } from "@/lib/i18n/period";
import { POWER_DURATIONS, powerLabel, records } from "@/lib/records";
import { bestPace, maxBy, monthlyVolume, peak, weeklyVolume } from "@/lib/stats";
import { useActivityDialog } from "@/components/ActivityDialog";
import { ChartCard } from "@/components/ChartCard";
import { LineChart } from "@/components/charts/LineChart";
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

/** Records and highlights of the period, plus Strava best efforts (all time). */
export function Notable({ ctx }: { ctx: DashboardContext }) {
  const { t, fmt, locale } = useI18n();
  const open = useActivityDialog();
  const periodLabel = usePeriodLabel(ctx);
  const { acts, range } = ctx;

  const byId = useMemo(() => new Map(ctx.all.map((a) => [a.id, a])), [ctx.all]);

  const recs = useMemo(() => {
    const out: Rec[] = [];
    const add = (
      label: string,
      sport: SportKey,
      a: Activity | null,
      f: (a: Activity) => { value: string; unit: string },
    ) => {
      if (a) {
        const d = a.distance > 0 ? `${fmt.km(a.distance, a.sport === "swim" ? 2 : 1)} km · ` : "";
        out.push({ label, sport, activity: a, sub: `${d}${a.name}`, ...f(a) });
      }
    };

    // "longest" = most MOVING time; the distance goes on the line below
    add(t("Longest run"), "run", maxBy(acts, (a) => a.movingTime, "run"), (a) => ({ value: fmt.duration(a.movingTime), unit: "" }));
    add(t("Longest ride"), "ride", maxBy(acts, (a) => a.movingTime, "ride"), (a) => ({ value: fmt.duration(a.movingTime), unit: "" }));
    add(t("Longest swim"), "swim", maxBy(acts, (a) => a.movingTime, "swim"), (a) => ({ value: fmt.duration(a.movingTime), unit: "" }));

    const climb = maxBy(
      acts.filter((a) => a.sport !== "strength"),
      (a) => a.elevation,
    );
    add(t("Most elevation"), climb?.sport ?? "ride", climb, (a) => ({ value: fmt.int(a.elevation), unit: "m" }));

    for (const sport of ["run", "ride", "swim"] as SportKey[]) {
      const label = sport === "ride" ? t("Top average speed") : t("Best pace · {sport}", { sport: t(siteConfig.sports[sport].label).toLowerCase() });
      add(label, sport, bestPace(acts, sport), (a) => fmt.pace(sport, a.distance / a.movingTime));
    }

    // heaviest week (or month, for long ranges) by ELAPSED time
    const long = (Date.parse(range.to) - Date.parse(range.from)) / 86_400_000 > 800;
    const best = peak(long ? monthlyVolume(acts, range) : weeklyVolume(acts, range));
    if (best) {
      const key = best.point.key;
      const when = long
        ? new Intl.DateTimeFormat(locale, { month: "long", year: "numeric", timeZone: "UTC" }).format(new Date(`${key}-01T00:00:00Z`))
        : t("week of {date}", { date: fmt.dateLabel(`${key}T00:00:00`) });
      out.push({
        label: long ? t("Heaviest month") : t("Heaviest week"),
        sport: "run",
        value: fmt.duration(best.seconds),
        unit: "",
        sub: `${when} · ${t("elapsed time")}`,
      });
    }
    return out;
  }, [acts, range, fmt, locale, t]);

  const analyzedAny = records.analyzed.rides > 0;
  const powerPoints = POWER_DURATIONS.map((d) => ({ label: powerLabel(d), value: records.power[String(d)]?.watts ?? null }));
  const powerVals = powerPoints.map((p) => p.value).filter((v): v is number => v !== null);
  const pDomain: [number, number] = powerVals.length
    ? [0, Math.ceil(Math.max(...powerVals) / 100) * 100]
    : [0, 1];

  return (
    <SectionShell id="notable" title={t("Highlights")} kicker={periodLabel}>
      {recs.length === 0 ? (
        <p className="text-muted">{t("No activities in this period.")}</p>
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
                      {fmt.dateLabel(r.activity.date, { day: "2-digit", month: "short", year: "numeric" })}
                    </p>
                  )}
                </Tag>
              </Reveal>
            );
          })}
        </div>
      )}
      <p className="label mt-6 text-[0.62rem]">
        {t("Pace and speed only count activities above {run} km (run), {ride} km (bike) and {swim} m (swim).", {
          run: fmt.km(siteConfig.rules.minDistanceForBestPace.run, 0),
          ride: fmt.km(siteConfig.rules.minDistanceForBestPace.ride, 0),
          swim: fmt.int(siteConfig.rules.minDistanceForBestPace.swim),
        })}
      </p>

      {/* ---- Strava best efforts (all time, indoor included) ---- */}
      <div className="mt-14">
        <Reveal>
          <ChartCard
            title={t("Notable power outputs")}
            subtitle={t("Best average power from 5 seconds up to 3 hours, trainer and Zwift included")}
            hint={t("all time")}
          >
            {powerVals.length === 0 ? (
              <p className="py-6 text-muted">
                {analyzedAny ? t("No power-meter rides yet.") : t("Power needs an extra Strava permission (activity:read_all). See the README.")}
              </p>
            ) : (
              <>
                <LineChart
                  points={powerPoints}
                  format={(v) => `${fmt.int(v)} W`}
                  domain={pDomain}
                  yTicks={[0, 1, 2, 3, 4].map((i) => (pDomain[1] * i) / 4)}
                  color="var(--ride)"
                />
                <ul className="mt-4 grid grid-cols-2 gap-x-6 gap-y-1 sm:grid-cols-3">
                  {POWER_DURATIONS.map((d) => {
                    const b = records.power[String(d)];
                    return (
                      <li key={d}>
                        <button
                          disabled={!b}
                          onClick={() => {
                            const a = b && byId.get(b.id);
                            if (a) open(a);
                          }}
                          className="flex w-full items-baseline justify-between gap-2 py-1 text-left disabled:opacity-40"
                          title={b ? `${b.name} · ${fmt.dateLabel(b.date, { day: "2-digit", month: "short", year: "numeric" })}${b.indoor ? ` · ${t("Indoor")}` : ""}` : undefined}
                        >
                          <span className="label">{powerLabel(d)}</span>
                          <span className="num text-xl">{b ? `${fmt.int(b.watts)} W` : "—"}</span>
                        </button>
                      </li>
                    );
                  })}
                </ul>
              </>
            )}
            <p className="label mt-4 text-[0.6rem]">
              {t("{done} of {total} rides analyzed", { done: records.analyzed.rides, total: records.total.rides })}
            </p>
          </ChartCard>
        </Reveal>
      </div>
    </SectionShell>
  );
}
