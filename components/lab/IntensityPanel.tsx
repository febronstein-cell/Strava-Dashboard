"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { useI18n } from "@/lib/i18n";
import { mondayOf } from "@/lib/lab/progress";
import type { Activity } from "@/lib/strava/types";
import { usePlanSession } from "@/lib/use-plan-session";
import { useBoxWidth } from "@/lib/use-box-width";
import { LockedHint } from "../EditLock";
import type { ActivityZones, ZoneMeta } from "@/lib/zones-data";
import { polarization, type Distribution } from "@/lib/zones";
import { Panel, Pills } from "./LabBits";

const Z_COLOR = ["var(--swim)", "#ffb020", "var(--run)"];
const LABEL: Record<Distribution, string> = { polarized: "polarized", pyramidal: "pyramidal", threshold: "threshold-heavy", mixed: "mixed" };
type SportFilter = "all" | "run" | "ride" | "swim";
const DAY = 86_400_000;
const addDays = (key: string, n: number) => new Date(Date.parse(key + "T00:00:00Z") + n * DAY).toISOString().slice(0, 10);

/**
 * Weekly intensity distribution from the true time in zone: the 3-zone split per week (below LT1, between LT1 and LT2,
 * at or above LT2), the share of zone 1 against the usual 75-85% band, and the label of the last 4 weeks
 * (polarization index, Treff et al. 2019).
 */
export function IntensityPanel({ activities, zones, todayKey }: { activities: Activity[]; zones: { byId: Record<number, ActivityZones>; meta: ZoneMeta }; todayKey: string }) {
  const { t, fmt } = useI18n();
  const router = useRouter();
  const session = usePlanSession();
  const [sport, setSport] = useState<SportFilter>("all");
  const [busy, setBusy] = useState<string | null>(null);
  const current = mondayOf(todayKey);
  const weeks = useMemo(() => Array.from({ length: 12 }, (_, i) => addDays(current, -7 * (11 - i))), [current]);

  const { rows, covered, eligible } = useMemo(() => {
    const by = new Map(weeks.map((w) => [w, [0, 0, 0] as [number, number, number]]));
    let covered = 0;
    let eligible = 0;
    for (const a of activities) {
      const w = mondayOf(a.date);
      if (!by.has(w) || a.manual || (sport !== "all" && a.sport !== sport)) continue;
      if (a.movingTime < 300) continue;
      eligible++;
      const z = zones.byId[a.id]?.three;
      if (!z) continue;
      covered++;
      const row = by.get(w)!;
      z.forEach((s, i) => (row[i] += s));
    }
    return { rows: weeks.map((w) => ({ w, z: by.get(w)! })), covered, eligible };
  }, [activities, zones.byId, weeks, sport]);

  const last4 = rows.slice(-4).reduce((acc, r) => acc.map((x, i) => x + r.z[i]) as [number, number, number], [0, 0, 0] as [number, number, number]);
  const read = polarization(last4);
  const maxH = Math.max(1, ...rows.map((r) => (r.z[0] + r.z[1] + r.z[2]) / 3600));

  const backfill = async () => {
    setBusy(t("Fetching…"));
    const res = await fetch("/api/streams/backfill", { method: "POST" });
    const j = (await res.json().catch(() => ({}))) as { fetched?: number; remaining?: number; stopped?: string; error?: string };
    setBusy(res.ok ? t("{a} read, {b} to go", { a: j.fetched ?? 0, b: j.remaining ?? 0 }) + (j.stopped ? ` · ${j.stopped}` : "") : (j.error ?? String(res.status)));
    router.refresh();
  };

  const [svgRef, W] = useBoxWidth(560);
  const H = 180;
  const bw = W / rows.length;
  const y = (h: number) => H - 18 - (h / maxH) * (H - 30);
  const yPct = (p: number) => H - 18 - p * (H - 30);

  return (
    <Panel
      title={t("Intensity distribution")}
      subtitle={t("True time in zone, second by second: below LT1 ({a} bpm), between LT1 and LT2, at or above LT2 ({b} bpm). Rides with power use {c} and {d} W.", {
        a: zones.meta.three.lt1Hr,
        b: zones.meta.three.lt2Hr,
        c: zones.meta.three.lt1W ?? "—",
        d: zones.meta.three.lt2W ?? "—",
      })}
      aside={
        <Pills
          value={sport}
          onChange={(v) => setSport(v as SportFilter)}
          options={[
            { value: "all", label: t("All") },
            { value: "run", label: t("Run") },
            { value: "ride", label: t("Bike") },
            { value: "swim", label: t("Swim") },
          ]}
        />
      }
    >
      <div className="flex flex-wrap items-baseline gap-x-6 gap-y-1">
        <p className="num text-3xl uppercase">{t(LABEL[read.label])}</p>
        <p className="label">
          {t("last 4 weeks")}: {read.shares.map((s) => `${Math.round(s * 100)}%`).join(" / ")}
          {read.pi !== null ? ` · PI ${fmt.num(read.pi, 2)}` : ""}
        </p>
      </div>

      <svg ref={svgRef} viewBox={`0 0 ${W} ${H}`} className="mt-3 w-full" role="img" aria-label={t("Intensity distribution")}>
        {/* the usual zone-1 band, 75 to 85% of the time */}
        <rect x={0} y={yPct(0.85)} width={W} height={yPct(0.75) - yPct(0.85)} fill="var(--swim)" opacity={0.1} />
        {rows.map((r, i) => {
          let top = y(0);
          return (
            <g key={r.w}>
              {r.z.map((s, k) => {
                const h = s / 3600;
                const yTop = top - (y(0) - y(h));
                const el = <rect key={k} className="bar-rise" style={{ animationDelay: `${i * 35}ms` }} x={i * bw + 5} y={yTop} width={bw - 10} height={Math.max(0, top - yTop)} fill={Z_COLOR[k]} rx={2} />;
                top = yTop;
                return el;
              })}
              <title>{`${r.w}: ${r.z.map((s) => fmt.duration(s)).join(" / ")}`}</title>
              {(W >= 480 || i % 2 === 0) && <text x={i * bw + bw / 2} y={H - 4} fontSize={12} textAnchor="middle" fill="var(--muted)">
                {fmt.dateLabel(`${r.w}T00:00:00`, { day: "2-digit", month: "short" })}
              </text>}
            </g>
          );
        })}
        <polyline
          points={rows
            .map((r, i) => {
              const tot = r.z[0] + r.z[1] + r.z[2];
              return tot ? `${i * bw + bw / 2},${yPct(r.z[0] / tot)}` : null;
            })
            .filter(Boolean)
            .join(" ")}
          fill="none"
          stroke="var(--fg)"
          strokeWidth={1.6}
          strokeDasharray="4 3"
        />
      </svg>
      <p className="label mt-2 flex flex-wrap gap-x-5 gap-y-1">
        <span style={{ color: Z_COLOR[0] }}>● {t("zone 1 (below LT1)")}</span>
        <span style={{ color: Z_COLOR[1] }}>● {t("zone 2 (LT1 to LT2)")}</span>
        <span style={{ color: Z_COLOR[2] }}>● {t("zone 3 (LT2 and up)")}</span>
        <span>┄ {t("% of time in zone 1 (band: 75 to 85%)")}</span>
      </p>
      <p className="mt-3 text-sm text-muted">
        {t("Second-by-second data for {a} of {b} sessions in these 12 weeks. The rest are read in small batches each day.", { a: covered, b: eligible })}
      </p>
      {!session.unlocked && covered < eligible && (
        <div className="mt-2">
          <LockedHint what={t("Enter the password to read more sessions now")} />
        </div>
      )}
      {session.unlocked && covered < eligible && (
        <div className="mt-2 flex flex-wrap items-center gap-3">
          <button onClick={() => void backfill()} className="label rounded-full border border-line px-4 py-2 hover:text-fg">
            {t("Read more now")}
          </button>
          {busy && <span className="label normal-case">{busy}</span>}
        </div>
      )}
    </Panel>
  );
}
