"use client";

import { useMemo, useState } from "react";
import { ALL_SPORTS, siteConfig, type SportKey } from "@/site.config";
import { useI18n } from "@/lib/i18n";
import { pointCount, pointSeconds, type VolumePoint } from "@/lib/stats";

const STACK_ORDER: SportKey[] = ["other", "strength", "swim", "ride", "run"]; // bottom to top of each bar
type Mode = "weekly" | "monthly";
type Metric = "time" | "sessions";

/** Multiple of 4 so the axis has whole divisions (0, 1/4, 1/2, 3/4, top). */
const niceMax = (v: number) => Math.max(4, Math.ceil(v / 4) * 4);

/**
 * Volume chart. ALWAYS includes every sport (swim, bike, run, strength and other).
 * "Time" is ELAPSED time (start to finish); "Sessions" counts activities.
 */
export function VolumeChart({ weekly, monthly }: { weekly: VolumePoint[] | null; monthly: VolumePoint[] }) {
  const { t, fmt, locale } = useI18n();
  const [wanted, setWanted] = useState<Mode>("weekly");
  const [metric, setMetric] = useState<Metric>("time");
  const [active, setActive] = useState<number | null>(null);
  const mode: Mode = weekly ? wanted : "monthly"; // without weekly data, only monthly
  const points = mode === "weekly" && weekly ? weekly : monthly;
  const sel = active !== null && active < points.length ? points[active] : null;

  const value = (p: VolumePoint, s: SportKey) => (metric === "time" ? p.secs[s] / 3600 : p.count[s]);
  const total = (p: VolumePoint) => (metric === "time" ? pointSeconds(p) / 3600 : pointCount(p));
  const show = (v: number) => (metric === "time" ? fmt.duration(v * 3600) : fmt.int(v));

  const max = useMemo(
    () => niceMax(Math.max(...points.map((p) => (metric === "time" ? pointSeconds(p) / 3600 : pointCount(p))), 0)),
    [points, metric],
  );
  const grid = [1, 0.75, 0.5, 0.25, 0].map((f) => max * f);
  const many = points.length > 24;

  const monthShort = (iso: string) =>
    new Intl.DateTimeFormat(locale, { month: "short", timeZone: "UTC" }).format(new Date(iso)).replace(".", "");

  const label = (p: VolumePoint, i: number): string => {
    if (mode === "monthly") {
      if (monthly.length > 12) return p.key.endsWith("-01") ? p.key.slice(0, 4) : "";
      return monthShort(p.key + "-01T00:00:00Z");
    }
    // a week belongs to the month of its Thursday (as in ISO 8601); label only when the month changes
    const mid = (key: string) => new Date(new Date(key + "T00:00:00Z").getTime() + 3 * 86_400_000);
    const d = mid(p.key);
    if (i > 0 && mid(points[i - 1].key).getUTCMonth() === d.getUTCMonth()) return "";
    return monthShort(d.toISOString());
  };

  const title = (p: VolumePoint | null): string => {
    if (!p) return t("Total in the period");
    if (mode === "weekly") {
      return (
        t("Week of {date}", {
          date: new Intl.DateTimeFormat(locale, { day: "2-digit", month: "short", timeZone: "UTC" })
            .format(new Date(p.key + "T00:00:00Z"))
            .replace(".", ""),
        })
      );
    }
    return new Intl.DateTimeFormat(locale, { month: "long", year: "numeric", timeZone: "UTC" }).format(
      new Date(p.key + "-01T00:00:00Z"),
    );
  };

  const sportTotal = (s: SportKey) => (sel ? value(sel, s) : points.reduce((a, q) => a + value(q, s), 0));
  const grand = sel ? total(sel) : points.reduce((a, q) => a + total(q), 0);

  return (
    <div className="card p-5 sm:p-8">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="label">
            {title(sel)} · {metric === "time" ? t("elapsed time") : t("sessions")}
          </p>
          <p className="num mt-2 text-5xl sm:text-6xl">{show(grand)}</p>
          <div className="mt-3 flex min-h-5 flex-wrap gap-x-5 gap-y-1 text-sm">
            {[...STACK_ORDER].reverse().map((s) => {
              const v = sportTotal(s);
              if (v === 0 && s !== "run" && s !== "ride" && s !== "swim") return null;
              return (
                <span key={s} className="inline-flex items-center gap-2 text-muted">
                  <span className="size-2.5 rounded-full" style={{ background: `var(--${s})` }} />
                  {t(siteConfig.sports[s].label)} <span className="text-fg">{show(v)}</span>
                  {metric === "sessions" && grand > 0 && (
                    <span className="text-[0.7rem]">({Math.round((v / grand) * 100)}%)</span>
                  )}
                </span>
              );
            })}
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div role="tablist" aria-label={t("Metric")} className="label flex rounded-full border border-line p-1">
            {(["time", "sessions"] as Metric[]).map((m) => (
              <button
                key={m}
                role="tab"
                aria-selected={metric === m}
                onClick={() => {
                  setMetric(m);
                  setActive(null);
                }}
                className={`rounded-full px-4 py-1.5 transition-colors ${metric === m ? "bg-fg text-bg" : "hover:text-fg"}`}
              >
                {m === "time" ? t("Elapsed time") : t("Sessions")}
              </button>
            ))}
          </div>
          <div role="tablist" aria-label={t("Grouping")} className="label flex rounded-full border border-line p-1">
            {(["weekly", "monthly"] as Mode[]).map((m) => (
              <button
                key={m}
                role="tab"
                aria-selected={mode === m}
                disabled={m === "weekly" && !weekly}
                onClick={() => {
                  setWanted(m);
                  setActive(null);
                }}
                className={`rounded-full px-4 py-1.5 transition-colors disabled:opacity-30 ${
                  mode === m ? "bg-fg text-bg" : "hover:text-fg"
                }`}
              >
                {m === "weekly" ? t("Weekly") : t("Monthly")}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="relative mt-8 h-64 sm:h-80" onMouseLeave={() => setActive(null)}>
        {grid.map((g, i) => (
          <div
            key={`${metric}-${g}`}
            className="absolute inset-x-0 flex items-center gap-3"
            style={{ top: `${(i / (grid.length - 1)) * 100}%` }}
          >
            <span className="label w-8 shrink-0 -translate-y-px text-right text-[0.62rem]">
              {g}
              {metric === "time" ? "h" : ""}
            </span>
            <div className="h-px flex-1 bg-line" />
          </div>
        ))}

        <div
          key={`${mode}-${metric}-${points.length}`}
          className={`absolute inset-y-0 right-0 left-11 flex items-stretch ${many ? "gap-[2px]" : "gap-2"}`}
        >
          {points.map((p, i) => {
            const tot = total(p);
            return (
              <button
                key={p.key}
                type="button"
                aria-label={`${title(p)}: ${show(tot)}`}
                onMouseEnter={() => setActive(i)}
                onFocus={() => setActive(i)}
                onClick={() => setActive(i)}
                className="group relative flex flex-1 flex-col justify-end outline-none"
              >
                <div
                  className="flex flex-col-reverse overflow-hidden rounded-t-[3px] transition-opacity"
                  style={{ height: `${(tot / max) * 100}%`, opacity: active === null || active === i ? 1 : 0.35 }}
                >
                  {STACK_ORDER.filter((s) => ALL_SPORTS.includes(s)).map((s) =>
                    value(p, s) > 0 ? (
                      <div
                        key={s}
                        className="bar-seg"
                        style={{
                          flex: `${value(p, s)} 1 0%`,
                          background: `var(--${s})`,
                          animationDelay: `${i * (many ? Math.min(14, 900 / points.length) : 60)}ms`,
                        }}
                      />
                    ) : null,
                  )}
                </div>
                <span className="label absolute top-full left-0 mt-3 text-[0.62rem] whitespace-nowrap">{label(p, i)}</span>
              </button>
            );
          })}
        </div>
      </div>
      <div className="h-6" />
    </div>
  );
}
