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

  // True power curve (5 s to 3 h), calculated by the script from Strava power streams
  const hasCurve = records.analyzed.rides > 0;

  // Best value for each duration. Without the curve yet, falls back to whole-ride averages
  // (best average of any power-meter ride at least that long; only for 5 min and above).
  const entries = useMemo(() => {
    const rides = ctx.all.filter((a) => a.sport === "ride" && a.deviceWatts && a.watts);
    return POWER_DURATIONS.map((sec) => {
      if (hasCurve) {
        const p = records.power[String(sec)];
        return p ? { ...p, approx: false } : null;
      }
      if (sec < 300) return null;
      const best = rides.reduce<Activity | null>(
        (m, r) => (r.movingTime >= sec && (!m || (r.watts ?? 0) > (m.watts ?? 0)) ? r : m),
        null,
      );
      return best
        ? { watts: best.watts ?? 0, id: best.id, name: best.name, date: best.date, indoor: !!best.indoor, approx: true }
        : null;
    });
  }, [ctx.all, hasCurve]);

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
                ? t("Best average power recorded for each duration, from 5 seconds to 3 hours. Indoor rides included.")
                : t("Best average power by ride length (whole-ride averages) until the full curve is calculated.")
            }
            hint={t("all time")}
          >
            {entries.every((e) => !e) ? (
              <p className="py-6 text-muted">{t("No power-meter rides in your history yet.")}</p>
            ) : (
              <>
                <ul className="grid grid-cols-1 gap-x-10 sm:grid-cols-2">
                  {POWER_DURATIONS.map((sec, i) => {
                    const e = entries[i];
                    const a = e ? byId.get(e.id) : undefined;
                    return (
                      <li key={sec} className="border-b border-line last:border-b-0 sm:[&:nth-last-child(2)]:border-b-0">
                        <button
                          disabled={!a}
                          onClick={() => a && open(a)}
                          className="grid w-full grid-cols-[3rem_1fr_auto] items-center gap-3 py-3 text-left transition-colors hover:text-fg disabled:opacity-50"
                        >
                          <span className="num text-2xl text-muted">{powerLabel(sec)}</span>
                          <span className="min-w-0">
                            {e ? (
                              <>
                                <span className="block truncate text-sm">{e.name}</span>
                                <span className="label mt-0.5 block text-[0.6rem]">
                                  {fmt.dateLabel(e.date, { day: "2-digit", month: "short", year: "numeric" })}
                                  {e.indoor ? ` · ${t("Indoor")}` : ""}
                                  {e.approx ? ` · ${t("ride average")}` : ""}
                                </span>
                              </>
                            ) : (
                              <span className="label text-[0.6rem]">{t("not calculated yet")}</span>
                            )}
                          </span>
                          <span className="num text-4xl" style={{ color: "var(--ride)" }}>
                            {e ? `${fmt.int(e.watts)}` : "—"}
                            {e && <span className="ml-1 text-base text-muted">W</span>}
                          </span>
                        </button>
                      </li>
                    );
                  })}
                </ul>

                <p className="label mt-6 text-[0.6rem]">
                  {hasCurve
                    ? t("{done} of {total} rides analyzed", { done: records.analyzed.rides, total: records.total.rides })
                    : t("For the full 5 s to 3 h power curve, authorize the extra Strava permission (see the README).")}
                </p>
              </>
            )}
          </ChartCard>
        </Reveal>
      </div>
    </SectionShell>
  );
}
