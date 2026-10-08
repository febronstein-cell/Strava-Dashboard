"use client";

import { useMemo, useState } from "react";
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

/** Ride lengths (seconds) for the "best average power by ride length" list. */
const RIDE_LENGTHS = [600, 1200, 1800, 3600, 7200, 10800];

/** Records and highlights of the period, plus Strava best efforts (all time). */
export function Notable({ ctx }: { ctx: DashboardContext }) {
  const { t, fmt, locale } = useI18n();
  const open = useActivityDialog();
  const periodLabel = usePeriodLabel(ctx);
  const { acts, range } = ctx;

  const [env, setEnv] = useState<"all" | "outdoor" | "indoor">("all");

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

  // Power-meter rides (real device power only), filtered by environment
  const rides = useMemo(
    () =>
      ctx.all.filter(
        (a) => a.sport === "ride" && a.deviceWatts && a.watts && (env === "all" || (env === "indoor") === !!a.indoor),
      ),
    [ctx.all, env],
  );
  // best average power of a whole ride that lasted at least N seconds
  const rideBests = useMemo(
    () =>
      RIDE_LENGTHS.map((sec) => ({
        sec,
        a: rides.reduce<Activity | null>(
          (best, r) => (r.movingTime >= sec && (!best || (r.watts ?? 0) > (best.watts ?? 0)) ? r : best),
          null,
        ),
      })),
    [rides],
  );
  const maxRideW = Math.max(1, ...rideBests.map((b) => b.a?.watts ?? 0));
  const topNp = useMemo(
    () =>
      rides
        .filter((a) => a.np && a.movingTime >= 1200)
        .sort((x, y) => (y.np ?? 0) - (x.np ?? 0))
        .slice(0, 5),
    [rides],
  );

  // True power curve (5 s to 3 h): only available after the extra Strava permission + script
  const hasCurve = records.analyzed.rides > 0;
  const powerPoints = POWER_DURATIONS.map((d) => ({ label: powerLabel(d), value: records.power[String(d)]?.watts ?? null }));
  const powerVals = powerPoints.map((p) => p.value).filter((v): v is number => v !== null);
  const pDomain: [number, number] = powerVals.length ? [0, Math.ceil(Math.max(...powerVals) / 100) * 100] : [0, 1];

  return (
    <SectionShell
      id="notable"
      title={t("Highlights")}
      kicker={periodLabel}
      description={t("Records of the chosen period and your best power outputs on the bike.")}
    >
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

      {/* ---- Notable power outputs (all time) ---- */}
      <div className="mt-14">
        <Reveal>
          <ChartCard
            title={t("Notable power outputs")}
            subtitle={
              hasCurve
                ? t("Best average power from 5 seconds up to 3 hours, plus your best whole rides")
                : t("Best average power by ride length and best normalized power. Power-meter rides only.")
            }
            hint={t("all time")}
            controls={
              <div role="tablist" aria-label={t("Environment")} className="label flex rounded-full border border-line p-1">
                {(["all", "outdoor", "indoor"] as const).map((e) => (
                  <button
                    key={e}
                    role="tab"
                    aria-selected={env === e}
                    onClick={() => setEnv(e)}
                    className={`rounded-full px-3 py-1.5 transition-colors ${env === e ? "bg-fg text-bg" : "hover:text-fg"}`}
                  >
                    {e === "all" ? t("All") : e === "outdoor" ? t("Outdoor") : t("Indoor")}
                  </button>
                ))}
              </div>
            }
          >
            {hasCurve && (
              <div className="mb-8">
                <LineChart
                  points={powerPoints}
                  format={(v) => `${fmt.int(v)} W`}
                  domain={pDomain}
                  yTicks={[0, 1, 2, 3, 4].map((i) => (pDomain[1] * i) / 4)}
                  color="var(--ride)"
                />
              </div>
            )}

            {rides.length === 0 ? (
              <p className="py-6 text-muted">{t("No power-meter rides in your history yet.")}</p>
            ) : (
              <div className="grid grid-cols-1 gap-8 lg:grid-cols-2">
                <div>
                  <p className="label mb-3">{t("Best average power by ride length")}</p>
                  <ul className="space-y-1">
                    {rideBests.map(({ sec, a }) => (
                      <li key={sec}>
                        <button
                          disabled={!a}
                          onClick={() => a && open(a)}
                          className="grid w-full grid-cols-[3.5rem_1fr_4.5rem] items-center gap-3 rounded-lg py-1.5 text-left transition-colors hover:bg-soft disabled:opacity-40"
                          title={
                            a
                              ? `${a.name} · ${fmt.dateLabel(a.date, { day: "2-digit", month: "short", year: "numeric" })}${a.indoor ? ` · ${t("Indoor")}` : ""}`
                              : undefined
                          }
                        >
                          <span className="label">≥ {powerLabel(sec)}</span>
                          <span className="h-3 overflow-hidden rounded-[3px] bg-soft">
                            <span
                              className="bar-x block h-full rounded-[3px]"
                              style={{ width: `${a ? ((a.watts ?? 0) / maxRideW) * 100 : 0}%`, background: "var(--ride)" }}
                            />
                          </span>
                          <span className="num text-right text-2xl">{a ? `${fmt.int(a.watts ?? 0)} W` : "—"}</span>
                        </button>
                      </li>
                    ))}
                  </ul>
                  <p className="mt-3 text-xs text-muted">
                    {t("Average of the whole ride, for rides at least that long (a lower bound of your true best).")}
                  </p>
                </div>

                <div>
                  <p className="label mb-3">{t("Top normalized power")}</p>
                  {topNp.length === 0 ? (
                    <p className="text-muted">{t("No normalized power recorded yet.")}</p>
                  ) : (
                    <ol className="divide-y divide-line">
                      {topNp.map((a, i) => (
                        <li key={a.id}>
                          <button
                            onClick={() => open(a)}
                            className="grid w-full grid-cols-[1.8rem_1fr_auto] items-center gap-3 py-2.5 text-left transition-colors hover:text-fg"
                          >
                            <span className="num text-2xl text-muted">{i + 1}</span>
                            <span className="min-w-0">
                              <span className="block truncate text-sm">{a.name}</span>
                              <span className="label mt-0.5 block text-[0.6rem]">
                                {fmt.dateLabel(a.date, { day: "2-digit", month: "short", year: "numeric" })} ·{" "}
                                {fmt.duration(a.movingTime)}
                                {a.indoor ? ` · ${t("Indoor")}` : ""}
                              </span>
                            </span>
                            <span className="num text-3xl" style={{ color: "var(--ride)" }}>
                              {fmt.int(a.np ?? 0)} W
                            </span>
                          </button>
                        </li>
                      ))}
                    </ol>
                  )}
                </div>
              </div>
            )}

            {!hasCurve && (
              <p className="label mt-6 text-[0.6rem]">
                {t("For the full 5 s to 3 h power curve, authorize the extra Strava permission (see the README).")}
              </p>
            )}
            {hasCurve && (
              <p className="label mt-6 text-[0.6rem]">
                {t("{done} of {total} rides analyzed", { done: records.analyzed.rides, total: records.total.rides })}
              </p>
            )}
          </ChartCard>
        </Reveal>
      </div>
    </SectionShell>
  );
}
