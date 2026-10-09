"use client";

import { useMemo, useState } from "react";
import { useI18n } from "@/lib/i18n";
import { activityLoad, formState, rampRate, type FormState, type LoadDay, type LoadMethod } from "@/lib/lab/load";
import type { Profile } from "@/lib/lab/profile";
import type { Activity } from "@/lib/strava/types";
import { Hint, Panel, Pills, Stat } from "./LabBits";
import { LoadChart } from "./LoadChart";

const STATE_TEXT: Record<FormState, { label: string; text: string; color: string }> = {
  fresh: { label: "Fresh", text: "You are rested: a good place to race, but if it lasts long you start losing fitness.", color: "#2bd4ff" },
  neutral: { label: "Neutral", text: "Balanced: fatigue roughly matches fitness.", color: "var(--muted)" },
  productive: { label: "Productive", text: "Training hard with manageable fatigue: where fitness is built.", color: "var(--ride)" },
  overreaching: { label: "High fatigue", text: "Very high fatigue: plan recovery to avoid overreaching.", color: "var(--goal)" },
};

type Span = 90 | 180 | 365 | 0;

export function LoadTab({ activities, series, profile }: { activities: Activity[]; series: LoadDay[]; profile: Profile }) {
  const { t, fmt } = useI18n();
  const [span, setSpan] = useState<Span>(180);

  const days = useMemo(() => (span === 0 ? series : series.slice(-span)), [series, span]);
  const now = series[series.length - 1];
  const ramp = rampRate(series);
  const state = now ? STATE_TEXT[formState(now.tsb)] : null;

  // how each session's load was estimated (transparency)
  const methods = useMemo(() => {
    const c: Record<LoadMethod, number> = { power: 0, hr: 0, duration: 0 };
    for (const a of activities) c[activityLoad(a, profile).method]++;
    return c;
  }, [activities, profile]);
  const total = activities.length || 1;

  if (!now) return <Hint>{t("No activities yet.")}</Hint>;

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
          sub={t("Change of fitness over the last 4 weeks")}
        />
      </div>

      {state && (
        <p className="rounded-xl border border-line px-4 py-3 text-sm" style={{ borderColor: state.color }}>
          <span className="label mr-2" style={{ color: state.color }}>{t(state.label)}</span>
          {t(state.text)}
        </p>
      )}

      <Panel
        title={t("Fitness, fatigue and form")}
        subtitle={t("Estimated from every session with power, heart rate or duration. Moving time; 100 points = one hour at threshold.")}
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

      <Panel title={t("How the load is calculated")} subtitle={t("The more sessions with a power meter or heart rate, the more accurate the curve.")}>
        <ul className="grid gap-3 sm:grid-cols-3">
          {(
            [
              ["power", "Power (normalized power vs FTP)"],
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
      </Panel>
    </div>
  );
}
