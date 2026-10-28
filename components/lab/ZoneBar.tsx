"use client";

import { siteConfig } from "@/site.config";
import { useI18n } from "@/lib/i18n";
import type { ActivityZones } from "@/lib/zones-data";
import { PACE_ZONE_NAMES, POWER_ZONE_NAMES } from "@/lib/zones";

const HR = siteConfig.heartRate.zones;
const POWER_COLORS = ["#7a8794", "#2bd4ff", "#1fe08a", "#c6f432", "#ffb020", "#ff5a1f", "#ff2d6f"];
const PACE_COLORS = ["#2bd4ff", "#1fe08a", "#c6f432", "#ffb020", "#ff5a1f"];

function Bar({ title, secs, names, colors }: { title: string; secs: number[]; names: string[]; colors: string[] }) {
  const { t, fmt } = useI18n();
  const total = secs.reduce((s, x) => s + x, 0);
  if (!total) return null;
  return (
    <div>
      <p className="label mb-1.5">{title}</p>
      <div className="flex h-4 overflow-hidden rounded-full" role="img" aria-label={title}>
        {secs.map((s, i) => (s > 0 ? <span key={i} style={{ width: `${(s / total) * 100}%`, background: colors[i] }} title={`${t(names[i])}: ${fmt.duration(s)}`} /> : null))}
      </div>
      <ul className="label mt-1.5 flex flex-wrap gap-x-4 gap-y-1 normal-case">
        {secs.map((s, i) =>
          s >= 30 ? (
            <li key={i}>
              <span style={{ color: colors[i] }}>●</span> {t(names[i])} {fmt.duration(s)} ({Math.round((s / total) * 100)}%)
            </li>
          ) : null,
        )}
      </ul>
    </div>
  );
}

/** Time in zone of one activity: heart rate, and power (rides) or pace (runs), from the second-by-second data. */
export function ZoneBars({ z }: { z: ActivityZones | undefined }) {
  const { t } = useI18n();
  if (!z || (!z.hr && !z.power && !z.pace)) return <p className="text-sm text-muted">{t("No second-by-second data read for this session yet.")}</p>;
  return (
    <div className="space-y-4">
      {z.hr && <Bar title={t("Heart-rate zones")} secs={z.hr} names={HR.map((h) => h.name)} colors={HR.map((h) => h.color)} />}
      {z.power && <Bar title={t("Power zones (Coggan, from FTP)")} secs={z.power} names={POWER_ZONE_NAMES} colors={POWER_COLORS} />}
      {z.pace && <Bar title={t("Pace zones (from threshold pace)")} secs={z.pace} names={PACE_ZONE_NAMES} colors={PACE_COLORS} />}
      {z.three && <Bar title={t("3-zone model")} secs={z.three} names={["below LT1", "LT1 to LT2", "LT2 and up"]} colors={["var(--swim)", "#ffb020", "var(--run)"]} />}
    </div>
  );
}
