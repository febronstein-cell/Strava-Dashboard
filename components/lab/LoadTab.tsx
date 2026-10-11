"use client";

import { useMemo, useState } from "react";
import { useI18n } from "@/lib/i18n";
import { acwr, activityLoad, formState, monotonyStrain, rampRate, sportFitness, type AcwrState, type FormState, type LoadDay, type LoadMethod } from "@/lib/lab/load";
import type { Profile } from "@/lib/lab/profile";
import type { FormComment } from "@/lib/lab/types";
import type { Activity } from "@/lib/strava/types";
import { Hint, Panel, Pills, Stat } from "./LabBits";
import { LoadChart } from "./LoadChart";

const STATE_TEXT: Record<FormState, { label: string; text: string; color: string }> = {
  transition: { label: "Very fresh", text: "Much more rested than loaded: good for a break, but fitness fades if it lasts.", color: "#b06bff" },
  fresh: { label: "Fresh", text: "Rested with fitness intact: the usual window for a race (about +5 to +25).", color: "#2bd4ff" },
  neutral: { label: "Neutral", text: "Balanced: fatigue roughly matches fitness.", color: "var(--muted)" },
  productive: { label: "Productive", text: "Training hard with manageable fatigue: where fitness is built (about −10 to −30).", color: "var(--ride)" },
  overreaching: { label: "High fatigue", text: "Very high fatigue: plan recovery to avoid overreaching.", color: "var(--goal)" },
};

const ACWR_TEXT: Record<AcwrState, { label: string; text: string; color: string }> = {
  low: { label: "Low", text: "Your last week was lighter than your recent norm: fine for recovery, but fitness can slip if it continues.", color: "#2bd4ff" },
  sweet: { label: "Sweet spot", text: "The last week fits your recent load: the zone with the lowest injury risk in the research.", color: "var(--brand)" },
  caution: { label: "Caution", text: "The last week was clearly heavier than your recent norm: avoid stacking another big jump.", color: "var(--ride)" },
  high: { label: "High", text: "A big jump in load: the period where injury and illness risk is highest. Consider an easier few days.", color: "var(--goal)" },
};

type Span = 90 | 180 | 365 | 0;

const REFERENCES = [
  "Banister EW et al. (1975). A systems model of training for athletic performance. Aust J Sports Med 7:57.",
  "Allen H, Coggan AR (2019). Training and Racing with a Power Meter, 3rd ed. VeloPress.",
  "Foster C (1998). Monitoring training in athletes with reference to overtraining syndrome. Med Sci Sports Exerc 30:1164.",
  "Gabbett TJ (2016). The training–injury prevention paradox. Br J Sports Med 50:273.",
  "Williams S et al. (2017). Better way to determine the acute:chronic workload ratio? Br J Sports Med 51:209.",
  "Impellizzeri FM et al. (2020). Acute:chronic workload ratio: conceptual issues and fundamental pitfalls. Int J Sports Physiol Perform 15:907.",
  "Friel J (2016). The Triathlete's Training Bible, 4th ed. VeloPress.",
  "Mujika I, Padilla S (2003). Scientific bases for precompetition tapering strategies. Med Sci Sports Exerc 35:1182.",
  "Bosquet L et al. (2007). Effects of tapering on performance: a meta-analysis. Med Sci Sports Exerc 39:1358.",
];

export function LoadTab({ activities, series, profile, comments }: { activities: Activity[]; series: LoadDay[]; profile: Profile; comments: FormComment[] }) {
  const { t, fmt, lang } = useI18n();
  const [span, setSpan] = useState<Span>(180);

  const days = useMemo(() => (span === 0 ? series : series.slice(-span)), [series, span]);
  const now = series[series.length - 1];
  const ramp = rampRate(series);
  const state = now ? STATE_TEXT[formState(now.tsb)] : null;
  const ratio = useMemo(() => acwr(series), [series]);
  const mono = useMemo(() => monotonyStrain(series), [series]);
  const bySport = useMemo(() => (now ? sportFitness(activities, profile, now.date) : null), [activities, profile, now]);

  // how each session's load was estimated (transparency)
  const methods = useMemo(() => {
    const c: Record<LoadMethod, number> = { power: 0, pace: 0, hr: 0, duration: 0 };
    for (const a of activities) c[activityLoad(a, profile).method]++;
    return c;
  }, [activities, profile]);
  const total = activities.length || 1;

  if (!now) return <Hint>{t("No activities yet.")}</Hint>;

  const sportRows = bySport
    ? ([
        ["swim", "Swim", "var(--swim)"],
        ["ride", "Bike", "var(--ride)"],
        ["run", "Run", "var(--run)"],
      ] as const).map(([k, label, color]) => ({ k, label, color, v: bySport[k] }))
    : [];
  const sportMax = Math.max(1, ...sportRows.map((r) => r.v));
  const acwrInfo = ratio ? ACWR_TEXT[ratio.state] : null;

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label={t("Fitness")} value={fmt.int(now.ctl)} sub={t("42-day average load")} accent="var(--brand)" />
        <Stat label={t("Fatigue")} value={fmt.int(now.atl)} sub={t("7-day average load")} accent="var(--goal)" />
        <Stat label={t("Form")} value={`${now.tsb > 0 ? "+" : ""}${fmt.int(now.tsb)}`} sub={state ? t(state.label) : undefined} accent={state?.color} />
        <Stat
          label={t("Fitness trend")}
          value={ramp === null ? "—" : `${ramp > 0 ? "+" : ""}${fmt.num(ramp, 1)}`}
          unit={ramp === null ? undefined : t("per week")}
          sub={ramp !== null && ramp > 7 ? t("Steep: above about +7 per week the risk of overload grows") : t("Change of fitness over the last 4 weeks")}
        />
      </div>

      {state && (
        <p className="rounded-xl border border-line px-4 py-3 text-sm" style={{ borderColor: state.color }}>
          <span className="label mr-2" style={{ color: state.color }}>{t(state.label)}</span>
          {t(state.text)}
        </p>
      )}

      <Panel title={t("Today's reading")} subtitle={t("A short comment on your fitness, fatigue and form, written by Claude when a workout arrives.")}>
        {comments[0] ? (
          <>
            <p className="whitespace-pre-line leading-relaxed">{lang === "pt" ? comments[0].pt : comments[0].en}</p>
            <p className="label mt-4">
              {fmt.dateLabel(`${comments[0].day}T00:00:00`, { day: "2-digit", month: "long", year: "numeric" })}
              {comments[0].model ? ` · ${comments[0].model}` : ""}
            </p>
          </>
        ) : (
          <Hint>{t("No comment yet. It is written automatically after each new workout once an Anthropic API key is set on the server.")}</Hint>
        )}
      </Panel>

      <Panel
        title={t("Fitness, fatigue and form")}
        subtitle={t("Estimated from every session with power, pace, heart rate or duration. Moving time; 100 points = one hour at threshold.")}
        aside={
          <Pills
            value={span}
            onChange={setSpan}
            options={[
              { value: 90, label: t("3 months") },
              { value: 180, label: t("6 months") },
              { value: 365, label: t("1 year") },
              { value: 0, label: t("All time") },
            ]}
          />
        }
      >
        <LoadChart days={days} />
      </Panel>

      <div className="grid gap-6 lg:grid-cols-2">
        <Panel title={t("Load balance")} subtitle={t("Acute:chronic workload ratio (7 vs 28 days, exponentially weighted).")}>
          {ratio && acwrInfo ? (
            <>
              <p className="num text-6xl leading-none" style={{ color: acwrInfo.color }}>{fmt.num(ratio.ratio, 2)}</p>
              <p className="label mt-2" style={{ color: acwrInfo.color }}>{t(acwrInfo.label)}</p>
              <p className="mt-3 text-sm text-muted">{t(acwrInfo.text)}</p>
              <p className="label mt-4">{t("Reference: 0.8–1.3 sweet spot · above 1.5 high risk")}</p>
            </>
          ) : (
            <Hint>{t("Needs about 5 weeks of history.")}</Hint>
          )}
        </Panel>

        <Panel title={t("Monotony and strain")} subtitle={t("Last 7 days: how repetitive the week was (Foster).")}>
          {mono ? (
            <>
              <div className="flex flex-wrap items-baseline gap-x-8 gap-y-2">
                <p>
                  <span className="num text-6xl leading-none" style={{ color: mono.monotony > 2 ? "var(--goal)" : "var(--fg)" }}>{fmt.num(mono.monotony, 1)}</span>
                  <span className="label ml-2">{t("monotony")}</span>
                </p>
                <p>
                  <span className="num text-4xl">{fmt.int(mono.strain)}</span>
                  <span className="label ml-2">{t("strain")}</span>
                </p>
              </div>
              <p className="mt-3 text-sm text-muted">
                {mono.monotony > 2
                  ? t("Training days look too alike. Mix hard and easy days: monotony above 2 with high load was linked to illness and overtraining.")
                  : t("Good variation between hard and easy days.")}
              </p>
            </>
          ) : (
            <Hint>{t("Needs 7 days of history.")}</Hint>
          )}
        </Panel>
      </div>

      <Panel title={t("Fitness by sport")} subtitle={t("Where today's fitness comes from: 42-day load of each sport.")}>
        <ul className="space-y-3">
          {sportRows.map((r) => (
            <li key={r.k} className="flex items-center gap-3">
              <span className="label w-14">{t(r.label)}</span>
              <span className="h-3 flex-1 overflow-hidden rounded-full bg-soft">
                <span className="block h-full rounded-full" style={{ width: `${(r.v / sportMax) * 100}%`, background: r.color }} />
              </span>
              <span className="num w-12 text-right text-xl">{fmt.int(r.v)}</span>
            </li>
          ))}
        </ul>
      </Panel>

      <Panel title={t("How the load is calculated")} subtitle={t("The more sessions with a power meter, pace or heart rate, the more accurate the curve.")}>
        <ul className="grid gap-3 sm:grid-cols-4">
          {(
            [
              ["power", "Power (normalized power vs FTP)"],
              ["pace", "Pace vs threshold (blended with heart rate)"],
              ["hr", "Heart rate (between resting HR and LTHR)"],
              ["duration", "Duration only (a flat estimate per hour)"],
            ] as [LoadMethod, string][]
          ).map(([k, label]) => (
            <li key={k} className="rounded-xl border border-line p-4">
              <p className="num text-3xl">{Math.round((methods[k] / total) * 100)}%</p>
              <p className="label mt-1">{t(label)}</p>
            </li>
          ))}
        </ul>
        <p className="mt-4 text-sm text-muted">
          {t("It uses an FTP of {ftp} W, an LTHR of {lthr} bpm and a resting HR of {rest} bpm. Adding real tests in My Machine makes it more accurate.", {
            ftp: profile.ftp ? fmt.int(profile.ftp.value) : "—",
            lthr: profile.lthr ? fmt.int(profile.lthr.value) : "—",
            rest: profile.resting_hr ? fmt.int(profile.resting_hr.value) : "—",
          })}
        </p>
        <p className="mt-3 text-sm text-muted">
          {t("Limits: heart rate and pace are session averages, so intervals look easier than they were; and these are population models, not diagnoses. Treat the numbers as trends.")}
        </p>
        <details className="mt-4 text-sm">
          <summary className="label cursor-pointer transition-colors hover:text-fg">{t("Scientific references")}</summary>
          <ul className="mt-3 list-disc space-y-1.5 pl-5 text-muted">
            {REFERENCES.map((r) => (
              <li key={r}>{r}</li>
            ))}
          </ul>
        </details>
      </Panel>
    </div>
  );
}
