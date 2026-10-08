"use client";

import { useMemo, useState } from "react";
import { ALL_SPORTS, siteConfig } from "@/site.config";
import type { DashboardContext } from "@/lib/dashboard";
import type { Activity } from "@/lib/strava/types";
import { useI18n } from "@/lib/i18n";
import { useActivityDialog } from "@/components/ActivityDialog";
import { DonutChart } from "@/components/charts/DonutChart";
import { Reveal } from "@/components/Reveal";
import { SectionShell } from "@/components/SectionShell";
import { dropSmall, SmallToggle } from "@/components/SmallToggle";
import { SportIcon } from "@/components/SportIcon";

const DAY = 86_400_000;
type RangeId = "week" | "lastWeek" | "month" | "d60" | "ytd";

const RANGES: { id: RangeId; label: string }[] = [
  { id: "week", label: "This week" },
  { id: "lastWeek", label: "Last week" },
  { id: "month", label: "This month" },
  { id: "d60", label: "Last 60 days" },
  { id: "ytd", label: "Year to date" },
];

const iso = (ms: number) => new Date(ms).toISOString().slice(0, 10);

function rangeOf(id: RangeId, today: Date): [string, string] {
  const t = today.getTime();
  const todayKey = iso(t);
  const mondayMs = t - ((today.getUTCDay() + 6) % 7) * DAY;
  switch (id) {
    case "week":
      return [iso(mondayMs), todayKey];
    case "lastWeek":
      return [iso(mondayMs - 7 * DAY), iso(mondayMs - DAY)];
    case "month":
      return [todayKey.slice(0, 8) + "01", todayKey];
    case "d60":
      return [iso(t - 59 * DAY), todayKey];
    case "ytd":
      return [todayKey.slice(0, 4) + "-01-01", todayKey];
  }
}

export function Recent({ ctx }: { ctx: DashboardContext }) {
  const { t, fmt } = useI18n();
  const open = useActivityDialog();
  const [range, setRange] = useState<RangeId>("week");
  const [showAll, setShowAll] = useState(false);
  const [smallDonut, setSmallDonut] = useState(false);

  const list = useMemo(() => {
    const [from, to] = rangeOf(range, ctx.today);
    return ctx.all.filter((a) => {
      const k = a.date.slice(0, 10);
      return k >= from && k <= to;
    });
  }, [ctx.all, ctx.today, range]);

  // Totals of the group use ELAPSED time; each activity below uses MOVING time
  const totalSecs = list.reduce((s, a) => s + a.elapsedTime, 0);
  const tri = list.filter((a) => ["swim", "ride", "run"].includes(a.sport));
  const totalDist = tri.reduce((s, a) => s + a.distance, 0);
  const breakdown = ALL_SPORTS.map((s) => ({
    sport: s,
    secs: list.filter((a) => a.sport === s).reduce((x, a) => x + a.elapsedTime, 0),
    dist: list.filter((a) => a.sport === s).reduce((x, a) => x + a.distance, 0),
  })).filter((b) => b.secs > 0);

  const visible = showAll ? list : list.slice(0, 10);

  return (
    <SectionShell
      id="recent"
      title={t("Recent activities")}
      kicker={t("stalk me if you must")}
      description={t("Latest workouts. The group totals use elapsed time; each activity shows its moving time.")}
    >
      <Reveal>
        <div className="card overflow-hidden">
          <div
            role="tablist"
            aria-label={t("Period")}
            className="label flex gap-1.5 overflow-x-auto border-b border-line px-5 py-4 [scrollbar-width:none] sm:px-7"
          >
            {RANGES.map((r) => (
              <button
                key={r.id}
                role="tab"
                aria-selected={range === r.id}
                onClick={() => {
                  setRange(r.id);
                  setShowAll(false);
                }}
                className={`shrink-0 rounded-full border px-3.5 py-1.5 transition-colors ${
                  range === r.id ? "border-fg bg-fg text-bg" : "border-line hover:text-fg"
                }`}
              >
                {t(r.label)}
              </button>
            ))}
          </div>

          <div className="grid gap-8 border-b border-line px-5 py-6 sm:px-7 lg:grid-cols-[auto_1fr] lg:items-center lg:gap-14">
            <dl className="grid grid-cols-3 gap-6 lg:grid-cols-1 lg:gap-5">
              <Summary label={t("Activities")} value={fmt.int(list.length)} />
              <Summary label={t("Elapsed time")} value={fmt.duration(totalSecs)} />
              <Summary label={t("Total distance")} value={`${fmt.km(totalDist, 0)} km`} />
            </dl>
            {breakdown.length > 0 && (
              <div>
                <div className="mb-4 flex flex-wrap items-center gap-3">
                  <p className="label">{t("Time breakdown (elapsed)")}</p>
                  <SmallToggle on={smallDonut} onChange={setSmallDonut} />
                </div>
                <DonutChart
                  segments={(smallDonut ? dropSmall(breakdown, (b) => b.secs) : breakdown).map((b) => ({
                    name: t(siteConfig.sports[b.sport].label),
                    value: b.secs,
                    color: `var(--${b.sport})`,
                    detail: `${fmt.duration(b.secs)}${b.dist > 0 && b.sport !== "other" ? ` · ${fmt.km(b.dist, 0)} km` : ""}`,
                  }))}
                  format={(v) => `${Math.round((v / totalSecs) * 100)}%`}
                />
              </div>
            )}
          </div>

          {list.length === 0 ? (
            <p className="px-7 py-10 text-muted">{t("No activities in this period.")}</p>
          ) : (
            <ul className="divide-y divide-line">
              {visible.map((a) => (
                <Row key={a.id} a={a} onOpen={() => open(a)} />
              ))}
            </ul>
          )}

          {list.length > 10 && (
            <button
              onClick={() => setShowAll((v) => !v)}
              className="label w-full border-t border-line px-7 py-4 text-center transition-colors hover:bg-soft hover:text-fg"
            >
              {showAll ? t("Show less") : t("Show all {n} activities", { n: list.length })}
            </button>
          )}
        </div>
      </Reveal>
    </SectionShell>
  );
}

function Summary({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="label">{label}</dt>
      <dd className="num mt-1.5 text-3xl sm:text-5xl">{value}</dd>
    </div>
  );
}

/** One activity: everything here is based on MOVING time. */
function Row({ a, onOpen }: { a: Activity; onOpen: () => void }) {
  const { t, fmt } = useI18n();
  const p = fmt.pace(a.sport, a.distance / a.movingTime);
  const noDistance = a.sport === "strength" || a.distance === 0;
  return (
    <li>
      <button
        onClick={onOpen}
        className="grid w-full grid-cols-[auto_1fr_auto] items-center gap-x-4 gap-y-1 px-5 py-4 text-left transition-colors hover:bg-soft sm:grid-cols-[auto_1fr_6rem_6rem_7rem_5rem] sm:px-7"
      >
        <span style={{ color: `var(--${a.sport})` }} title={t(siteConfig.sports[a.sport].label)}>
          <SportIcon sport={a.sport} className="size-6" />
        </span>
        <div className="min-w-0">
          <p className="truncate font-medium">{a.name}</p>
          <p className="label text-[0.62rem] sm:hidden">
            {t(siteConfig.sports[a.sport].label)} · {fmt.dateLabel(a.date)} · {fmt.duration(a.movingTime)}
          </p>
        </div>
        <p className="num text-right text-2xl sm:text-3xl">
          {noDistance ? (
            fmt.duration(a.movingTime)
          ) : (
            <>
              {a.sport === "swim" ? fmt.meters(a.distance) : fmt.km(a.distance, 1)}
              <span className="ml-1 text-sm text-muted">{a.sport === "swim" ? "m" : "km"}</span>
            </>
          )}
        </p>
        <p className="hidden text-right text-muted sm:block">{noDistance ? "" : fmt.duration(a.movingTime)}</p>
        <p className="hidden text-right text-muted sm:block">
          {p.value !== "—" && (
            <>
              {p.value} <span className="text-xs">{p.unit}</span>
            </>
          )}
        </p>
        <p className="label hidden text-right sm:block">{fmt.dateLabel(a.date)}</p>
      </button>
    </li>
  );
}
