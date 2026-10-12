"use client";

import { useMemo } from "react";
import { useI18n } from "@/lib/i18n";
import { hrZones, powerZones, runPaceZones, wattsPerKg, type Metric, type Profile, type Zone } from "@/lib/lab/profile";
import { LineChart } from "../charts/LineChart";
import type { LabData, ThresholdKind, ThresholdRow } from "@/lib/lab/types";
import { POWER_DURATIONS, powerLabel } from "@/lib/records";
import { Hint, Panel, SourceBadge, Stat } from "./LabBits";

const KIND_LABEL: Record<ThresholdKind, string> = {
  ftp: "FTP",
  lthr: "LTHR",
  max_hr: "Max HR",
  resting_hr: "Resting HR",
  vo2max: "VO2max",
  lt1_hr: "LT1 heart rate",
  lt2_hr: "LT2 heart rate",
  vt1_hr: "VT1 heart rate",
  vt2_hr: "VT2 heart rate",
  lt1_power: "LT1 power",
  lt2_power: "LT2 power",
  lt1_pace: "LT1 pace",
  lt2_pace: "LT2 pace",
  run_threshold_pace: "Run threshold pace",
  css: "Swim CSS",
  run_3k_pace: "3 km test pace",
  run_2mi_pace: "2-mile test pace",
  run_10k_time: "10 km best",
  weight_kg: "Body weight",
};

/** Saved only to build the estimates: not listed in the history. */
const HIDDEN_KINDS: ThresholdKind[] = ["run_10k_time"];
const PACE_KINDS: ThresholdKind[] = ["run_threshold_pace", "lt1_pace", "lt2_pace", "css", "run_3k_pace", "run_2mi_pace"];

export function MachineTab({ profile, lab }: { profile: Profile; lab: LabData }) {
  const { t, fmt } = useI18n();
  const clock = fmt.clock;

  const show = (k: ThresholdKind, m?: Metric): string => {
    if (!m) return "—";
    if (PACE_KINDS.includes(k)) return clock(m.value);
    return fmt.int(m.value);
  };
  const unit = (k: ThresholdKind): string =>
    k === "ftp" || k === "lt1_power" || k === "lt2_power" ? "W" : k === "css" ? "/100m" : PACE_KINDS.includes(k) ? "/km" : k === "vo2max" ? "ml/kg/min" : k === "weight_kg" ? "kg" : "bpm";

  const headline: ThresholdKind[] = ["ftp", "lthr", "max_hr", "run_3k_pace", "run_threshold_pace", "css"];
  const wkg = wattsPerKg(profile);
  const rows: { label: string; hr?: ThresholdKind; power?: ThresholdKind; pace?: ThresholdKind }[] = [
    { label: "LT1 · aerobic threshold", hr: "lt1_hr", power: "lt1_power", pace: "lt1_pace" },
    { label: "VT1 · first ventilatory threshold", hr: "vt1_hr" },
    { label: "LT2 · lactate threshold", hr: "lt2_hr", power: "lt2_power", pace: "lt2_pace" },
    { label: "VT2 · second ventilatory threshold", hr: "vt2_hr" },
  ];

  const ftp = profile.ftp?.value;
  const runPace = profile.run_threshold_pace?.value;
  const hasTests = lab.thresholds.some((r) => !HIDDEN_KINDS.includes(r.kind));

  return (
    <div className="lab-enter space-y-6">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-3">
        {headline.map((k) => {
          const m = profile[k];
          return (
            <Stat
              key={k}
              label={t(KIND_LABEL[k])}
              value={show(k, m)}
              count={m && !PACE_KINDS.includes(k) ? { value: m.value } : undefined}
              unit={m ? unit(k) : undefined}
              badge={m ? <SourceBadge m={m} /> : undefined}
              sub={k === "ftp" && wkg ? `${fmt.num(wkg, 2)} W/kg` : m?.how ? t(m.how) : m?.source === "test" && k === "run_3k_pace" ? t("Latest test") : m ? undefined : t("Not available yet")}
              accent={m?.source === "test" ? "var(--brand)" : undefined}
            />
          );
        })}
      </div>

      <Panel
        title={t("Thresholds")}
        subtitle={t("Lactate (LT) and ventilatory (VT) thresholds. Real tests are shown in green; the rest are estimates until you add a test.")}
      >
        <ul className="space-y-3 sm:hidden">
          {rows.map((r) => (
            <li key={r.label} className="rounded-xl border border-line p-3.5">
              <p className="text-sm">{t(r.label)}</p>
              <dl className="mt-2 grid grid-cols-3 gap-2">
                {([
                  [t("Heart rate"), r.hr],
                  [t("Bike power"), r.power],
                  [t("Run pace"), r.pace],
                ] as [string, ThresholdKind | undefined][]).map(([label, k]) => {
                  const m = k ? profile[k] : undefined;
                  return (
                    <div key={label} className="min-w-0">
                      <dt className="label text-[0.58rem]">{label}</dt>
                      <dd className="num mt-1 text-2xl" style={m?.source === "test" ? { color: "var(--brand)" } : undefined}>
                        {k && m ? show(k, m) : "—"}
                        {k && m && <span className="label ml-1 text-[0.58rem]">{unit(k)}</span>}
                      </dd>
                      {m && <SourceBadge m={m} />}
                    </div>
                  );
                })}
              </dl>
            </li>
          ))}
        </ul>
        <div className="hidden overflow-x-auto sm:block">
          <table className="w-full min-w-[34rem] text-left">
            <thead>
              <tr className="label border-b border-line">
                <th className="py-2 pr-4 font-normal">{t("Threshold")}</th>
                <th className="py-2 pr-4 font-normal">{t("Heart rate")}</th>
                <th className="py-2 pr-4 font-normal">{t("Bike power")}</th>
                <th className="py-2 font-normal">{t("Run pace")}</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.label} className="border-b border-line/60 last:border-0">
                  <td className="py-3 pr-4 text-sm">{t(r.label)}</td>
                  {([r.hr, r.power, r.pace] as (ThresholdKind | undefined)[]).map((k, i) => {
                    const m = k ? profile[k] : undefined;
                    return (
                      <td key={i} className="py-3 pr-4">
                        {k && m ? (
                          <span className="inline-flex flex-wrap items-baseline gap-x-2">
                            <span className="num text-2xl" style={m.source === "test" ? { color: "var(--brand)" } : undefined}>
                              {show(k, m)}
                            </span>
                            <span className="label">{unit(k)}</span>
                            <SourceBadge m={m} />
                          </span>
                        ) : (
                          <span className="text-muted">—</span>
                        )}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Panel>

      <div className="grid gap-6 lg:grid-cols-2">
        <Panel title={t("Heart-rate zones")} subtitle={t("Set in site.config.ts and used across the whole site.")}>
          <ZoneTable zones={hrZones()} format={(v) => fmt.int(v)} unit="bpm" />
        </Panel>

        <Panel
          title={t("Power zones")}
          subtitle={ftp ? t("Coggan zones from an FTP of {w} W.", { w: fmt.int(ftp) }) : t("Needs an FTP (test or power curve).")}
          aside={profile.ftp && <SourceBadge m={profile.ftp} />}
        >
          {ftp ? <ZoneTable zones={powerZones(ftp)} format={(v) => fmt.int(v)} unit="W" /> : <Hint>{t("Not available yet")}</Hint>}
        </Panel>

        <Panel
          title={t("Run pace zones")}
          subtitle={runPace ? t("From a threshold pace of {pace} /km.", { pace: clock(runPace) }) : t("Needs a run threshold pace (test or a long steady run).")}
          aside={profile.run_threshold_pace && <SourceBadge m={profile.run_threshold_pace} />}
        >
          {runPace ? <ZoneTable zones={runPaceZones(runPace)} format={(v) => clock(v)} unit="/km" pace /> : <Hint>{t("Not available yet")}</Hint>}
        </Panel>

        <Panel title={t("Power profile")} subtitle={t("Best average power for each duration, indoor and outdoor.")}>
          <ul className="grid grid-cols-2 gap-x-6 gap-y-1 sm:grid-cols-3">
            {POWER_DURATIONS.map((d) => {
              const w = lab.power[String(d)];
              return (
                <li key={d} className="flex items-baseline justify-between border-b border-line/60 py-2">
                  <span className="label">{powerLabel(d)}</span>
                  <span className="num text-xl">
                    {w ? fmt.int(w) : "—"}
                    {w && ftp ? <span className="label ml-2">{Math.round((w / ftp) * 100)}%</span> : null}
                  </span>
                </li>
              );
            })}
          </ul>
        </Panel>
      </div>

      <RunTests rows={lab.thresholds} />

      <TestHistory rows={lab.thresholds} dbReady={lab.dbReady} hasTests={hasTests} />
    </div>
  );
}

function ZoneTable({ zones, format, unit, pace = false }: { zones: Zone[]; format: (v: number) => string; unit: string; pace?: boolean }) {
  const { t } = useI18n();
  const range = (z: Zone): string => {
    const { from, to } = z;
    if (from === null && to === null) return "—";
    if (pace) {
      // pace: Z1 has no slow limit, the last zone no fast limit
      if (from === null) return `> ${format(to!)}`;
      if (to === null) return `< ${format(from)}`;
      return `${format(from)} – ${format(to)}`;
    }
    if (from === null) return `≤ ${format(to!)}`;
    if (to === null) return `≥ ${format(from)}`;
    return `${format(from)} – ${format(to)}`;
  };
  return (
    <ul className="space-y-1.5">
      {zones.map((z) => (
        <li key={z.name} className="flex items-center gap-3">
          <span className="size-3 shrink-0 rounded-full" style={{ background: z.color }} />
          <span className="min-w-0 flex-1 truncate text-sm">{t(z.name)}</span>
          <span className="num text-lg">{range(z)}</span>
          <span className="label w-10">{unit}</span>
        </li>
      ))}
    </ul>
  );
}

function TestHistory({ rows, dbReady, hasTests }: { rows: ThresholdRow[]; dbReady: boolean; hasTests: boolean }) {
  const { t, fmt } = useI18n();
  const fmtValue = (r: ThresholdRow) =>
    r.unit === "s/km" || r.unit === "s/100m" ? `${fmt.clock(r.value)} ${r.unit === "s/km" ? "/km" : "/100m"}` : `${fmt.num(r.value, 1)} ${r.unit}`;
  const monthYear = (iso: string) => fmt.dateLabel(`${iso}T00:00:00`, { month: "short", year: "numeric" });
  const sorted = useMemo(() => rows.filter((r) => !HIDDEN_KINDS.includes(r.kind)).sort((a, b) => (a.testDate < b.testDate ? 1 : -1)), [rows]);

  return (
    <Panel title={t("Test history")} subtitle={t("Every threshold test saved in your database, newest first.")}>
      {!hasTests ? (
        <Hint>
          {dbReady
            ? t("No tests yet. Add them in Supabase → Table Editor → thresholds (see supabase/schema-lab.sql for the format) and they appear here.")
            : t("The database is not connected, so only estimates are shown.")}
        </Hint>
      ) : (
        <ul>
          {sorted.map((r, i) => (
            <li key={`${r.kind}${r.testDate}${i}`} className="flex flex-wrap items-baseline justify-between gap-x-4 border-b border-line/60 py-2.5 last:border-0">
              <span className="text-sm">{t(KIND_LABEL[r.kind])}</span>
              <span className="num text-xl">{fmtValue(r)}</span>
              <span className="label">{monthYear(r.testDate)}</span>
              {r.notes && <span className="w-full text-sm text-muted">{r.notes}</span>}
            </li>
          ))}
        </ul>
      )}
    </Panel>
  );
}

/** 3 km and 2-mile test paces over time (lower is faster). */
function RunTests({ rows }: { rows: ThresholdRow[] }) {
  const { t, fmt } = useI18n();
  const byDate = new Map<string, { k3?: number; mi2?: number }>();
  for (const r of rows) {
    if (r.kind !== "run_3k_pace" && r.kind !== "run_2mi_pace") continue;
    const o = byDate.get(r.testDate) ?? {};
    if (r.kind === "run_3k_pace") o.k3 = r.value;
    else o.mi2 = r.value;
    byDate.set(r.testDate, o);
  }
  const list = [...byDate.entries()].sort(([a], [b]) => (a < b ? -1 : 1));
  if (list.length === 0) return null;

  const month = (iso: string, year: "numeric" | "2-digit" = "numeric") => fmt.dateLabel(`${iso}T00:00:00`, { month: "short", year });
  const k3 = list.filter(([, v]) => v.k3 !== undefined);
  const values = k3.map(([, v]) => v.k3!);
  const lo = Math.floor((Math.min(...values) - 6) / 10) * 10;
  const hi = Math.ceil((Math.max(...values) + 6) / 10) * 10;
  const first = values[0];
  const last = values[values.length - 1];

  return (
    <Panel
      title={t("Run test progression")}
      subtitle={t("3 km and 2-mile test paces over time. Lower is faster.")}
      aside={values.length >= 2 ? <span className="label text-brand">{t("{s} s/km faster since the first test", { s: Math.round(first - last) })}</span> : undefined}
    >
      <div className="grid gap-6 lg:grid-cols-2">
        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead>
              <tr className="label border-b border-line">
                <th className="py-2 pr-4 font-normal">{t("Date")}</th>
                <th className="py-2 pr-4 font-normal">{t("3 km")}</th>
                <th className="py-2 font-normal">{t("2 miles")}</th>
              </tr>
            </thead>
            <tbody>
              {[...list].reverse().map(([date, v], i) => (
                <tr key={date} className="border-b border-line/60 last:border-0">
                  <td className="label py-2.5 pr-4">{i === 0 ? t("Latest") : month(date)}</td>
                  <td className="num py-2.5 pr-4 text-2xl" style={i === 0 ? { color: "var(--brand)" } : undefined}>
                    {v.k3 !== undefined ? `${fmt.clock(v.k3)}/km` : "—"}
                  </td>
                  <td className="num py-2.5 text-2xl text-muted">{v.mi2 !== undefined ? `${fmt.clock(v.mi2)}/km` : "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="overflow-x-auto"><div className="min-w-[24rem]"><LineChart
          points={k3.map(([date, v]) => ({ label: month(date, "2-digit"), value: v.k3! }))}
          format={(v) => fmt.clock(v)}
          yTicks={[lo, (lo + hi) / 2, hi]}
          domain={[lo, hi]}
          color="var(--run)"
        /></div></div>
      </div>
    </Panel>
  );
}
