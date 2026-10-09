"use client";

import { useMemo, useState } from "react";
import { siteConfig } from "@/site.config";
import { useI18n } from "@/lib/i18n";
import type { LoadDay } from "@/lib/lab/load";
import { progression } from "@/lib/lab/progress";
import type { Activity } from "@/lib/strava/types";
import { Hint, Panel, Pills } from "./LabBits";

const TONE_COLOR = { good: "var(--brand)", warn: "var(--goal)", info: "var(--muted)" } as const;

export function ProgressionTab({ activities, todayKey, series }: { activities: Activity[]; todayKey: string; series: LoadDay[] }) {
  const { t, fmt } = useI18n();
  const [months, setMonths] = useState<3 | 6 | 12>(3);
  const p = useMemo(() => progression(activities, todayKey, months), [activities, todayKey, months]);
  const ctlAt = (key: string) => series.find((d) => d.date === key)?.ctl ?? null;

  const cur = p.current;
  const prev = p.previous;
  const easy = (s: number[] | null) => (s ? (s[0] + s[1]) * 100 : null);

  type Row = { label: string; now: number | null; before: number | null; fmt: (v: number) => string };
  const rows: Row[] = [
    { label: t("Training hours"), now: cur.hours, before: prev.hours, fmt: (v) => `${fmt.num(v, 0)} h` },
    { label: t("Sessions"), now: cur.sessions, before: prev.sessions, fmt: (v) => fmt.int(v) },
    { label: t("Swim hours"), now: cur.hoursBySport.swim, before: prev.hoursBySport.swim, fmt: (v) => `${fmt.num(v, 0)} h` },
    { label: t("Bike hours"), now: cur.hoursBySport.ride, before: prev.hoursBySport.ride, fmt: (v) => `${fmt.num(v, 0)} h` },
    { label: t("Run hours"), now: cur.hoursBySport.run, before: prev.hoursBySport.run, fmt: (v) => `${fmt.num(v, 0)} h` },
    { label: t("Fitness (end of period)"), now: ctlAt(cur.to), before: ctlAt(prev.to), fmt: (v) => fmt.int(v) },
    { label: t("Running efficiency (m per heartbeat)"), now: cur.runEfficiency, before: prev.runEfficiency, fmt: (v) => fmt.num(v, 2) },
    { label: t("Bike normalized power, 40+ min rides"), now: cur.rideNp, before: prev.rideNp, fmt: (v) => `${fmt.int(v)} W` },
    { label: t("Easy heart-rate time (zones 1–2)"), now: easy(cur.zoneShare), before: easy(prev.zoneShare), fmt: (v) => `${fmt.int(v)}%` },
    { label: t("Weeks with 3+ sessions"), now: cur.consistency * 100, before: prev.consistency * 100, fmt: (v) => `${fmt.int(v)}%` },
    { label: t("Longest run"), now: cur.longestRunKm || null, before: prev.longestRunKm || null, fmt: (v) => `${fmt.num(v, 1)} km` },
    { label: t("Longest ride"), now: cur.longestRideKm || null, before: prev.longestRideKm || null, fmt: (v) => `${fmt.num(v, 0)} km` },
  ];

  const label = (iso: string) => fmt.dateLabel(`${iso}T00:00:00`, { day: "2-digit", month: "short", year: "numeric" });

  return (
    <div className="space-y-6">
      <Panel
        title={t("What changed")}
        subtitle={t("Compares the chosen period with the same length just before it.")}
        aside={
          <Pills
            value={months}
            onChange={setMonths}
            options={[
              { value: 3, label: t("3 months") },
              { value: 6, label: t("6 months") },
              { value: 12, label: t("1 year") },
            ]}
          />
        }
      >
        {p.insights.length === 0 ? (
          <Hint>{t("Not enough data to compare yet.")}</Hint>
        ) : (
          <ul className="space-y-2.5">
            {p.insights.map((i) => (
              <li key={i.id} className="flex gap-3">
                <span className="mt-2 size-2.5 shrink-0 rounded-full" style={{ background: TONE_COLOR[i.tone] }} />
                <span>{t(i.text, i.vars)}</span>
              </li>
            ))}
          </ul>
        )}
      </Panel>

      <Panel
        title={t("Side by side")}
        subtitle={`${label(cur.from)} → ${label(cur.to)}  ·  ${t("vs")}  ${label(prev.from)} → ${label(prev.to)}`}
      >
        <div className="overflow-x-auto">
          <table className="w-full min-w-[32rem] text-left">
            <thead>
              <tr className="label border-b border-line">
                <th className="py-2 pr-4 font-normal">{t("Indicator")}</th>
                <th className="py-2 pr-4 font-normal">{t("Now")}</th>
                <th className="py-2 pr-4 font-normal">{t("Before")}</th>
                <th className="py-2 font-normal">{t("Change")}</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => {
                const delta = r.now !== null && r.before ? ((r.now - r.before) / r.before) * 100 : null;
                return (
                  <tr key={r.label} className="border-b border-line/60 last:border-0">
                    <td className="py-3 pr-4 text-sm">{r.label}</td>
                    <td className="num py-3 pr-4 text-xl">{r.now === null ? "—" : r.fmt(r.now)}</td>
                    <td className="num py-3 pr-4 text-xl text-muted">{r.before === null ? "—" : r.fmt(r.before)}</td>
                    <td className="num py-3 text-xl" style={{ color: delta === null || Math.abs(delta) < 1 ? "var(--muted)" : delta > 0 ? "var(--brand)" : "var(--goal)" }}>
                      {delta === null ? "—" : `${delta > 0 ? "+" : ""}${fmt.int(delta)}%`}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <p className="mt-4 text-sm text-muted">
          {t("Hours are elapsed time; efficiency, power and heart rate use moving time. Heart-rate zones come from {z}.", { z: `site.config.ts (Z4 up to ${siteConfig.heartRate.zones[3].max} bpm)` })}
        </p>
      </Panel>
    </div>
  );
}
