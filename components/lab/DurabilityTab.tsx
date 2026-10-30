"use client";

import { useEffect, useMemo, useState } from "react";
import { useI18n } from "@/lib/i18n";
import { driftBand } from "@/lib/durability";
import { durabilityRows, firstKmByMonth, type DurabilityRow } from "@/lib/durability-trends";
import type { Activity } from "@/lib/strava/types";
import { usePlanSession } from "@/lib/use-plan-session";
import { useBoxWidth } from "@/lib/use-box-width";
import { LockedHint } from "../EditLock";
import { ErrorNote } from "../ErrorNote";
import type { ActivityZones } from "@/lib/zones-data";
import { Hint, Panel } from "./LabBits";

const BAND_COLOR = { good: "#1fe08a", watch: "#ffb020", poor: "#ff4d4d" } as const;
const H = 160;
const PAD = 30;

/** Dots over time with a mean line; `bands` draws the 5% and 8% limits. */
function Dots({ title, rows, pick, unit, limits, color }: { title: string; rows: DurabilityRow[]; pick: (r: DurabilityRow) => number | undefined; unit: string; limits?: boolean; color: string }) {
  const { t, fmt } = useI18n();
  const [svgRef, W] = useBoxWidth(560);
  const pts = rows.map((r) => ({ r, v: pick(r) })).filter((p): p is { r: DurabilityRow; v: number } => p.v != null);
  if (pts.length < 2) return (
    <figure>
      <figcaption className="label mb-1">{title}</figcaption>
      <p className="text-sm text-muted">{t("Not enough sessions with this number yet.")}</p>
    </figure>
  );
  const t0 = Date.parse(pts[0].r.date);
  const t1 = Date.parse(pts[pts.length - 1].r.date) || t0 + 1;
  const lo = Math.min(0, ...pts.map((p) => p.v));
  const hi = Math.max(limits ? 10 : 1, ...pts.map((p) => p.v));
  const x = (d: string) => PAD + ((Date.parse(d) - t0) / Math.max(1, t1 - t0)) * (W - PAD - 8);
  const y = (v: number) => H - 18 - ((v - lo) / (hi - lo || 1)) * (H - 30);
  // 4-point moving mean
  const mean = pts.map((_, i) => {
    const s = pts.slice(Math.max(0, i - 3), i + 1);
    return `${x(pts[i].r.date)},${y(s.reduce((a, p) => a + p.v, 0) / s.length)}`;
  });
  return (
    <figure>
      <figcaption className="label mb-1">{title}</figcaption>
      <svg ref={svgRef} viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-label={title}>
        {limits && (
          <>
            <line x1={PAD} x2={W} y1={y(5)} y2={y(5)} stroke={BAND_COLOR.good} strokeDasharray="3 3" opacity={0.7} />
            <line x1={PAD} x2={W} y1={y(8)} y2={y(8)} stroke={BAND_COLOR.poor} strokeDasharray="3 3" opacity={0.7} />
            <text x={2} y={y(5) + 3} fontSize={12} fill="var(--muted)">5%</text>
            <text x={2} y={y(8) + 3} fontSize={12} fill="var(--muted)">8%</text>
          </>
        )}
        <line x1={PAD} x2={W} y1={y(0)} y2={y(0)} stroke="var(--line)" />
        <polyline points={mean.join(" ")} fill="none" stroke={color} strokeWidth={2} opacity={0.6} />
        {pts.map(({ r, v }) => (
          <circle key={r.id} cx={x(r.date)} cy={y(v)} r={4} fill={limits ? BAND_COLOR[driftBand(v)] : color}>
            <title>{`${r.date} · ${r.name} · ${fmt.num(v, 1)}${unit}${r.brick ? ` · ${t("brick")}` : ""}`}</title>
          </circle>
        ))}
        <text x={PAD} y={H - 3} fontSize={12} fill="var(--muted)">{pts[0].r.date}</text>
        <text x={W - 4} y={H - 3} fontSize={12} fill="var(--muted)" textAnchor="end">{pts[pts.length - 1].r.date}</text>
      </svg>
    </figure>
  );
}

/**
 * Durability: do pace and power hold when tired? Trends of aerobic decoupling on long runs and rides, second-half
 * fade, runs that started too fast (bricks flagged) and best 20-minute power after 1,500 and 2,500 kJ, plus a short
 * written comment on whether it is improving.
 */
export function DurabilityTab({ activities, zones }: { activities: Activity[]; zones: Record<number, ActivityZones> }) {
  const { t, lang, fmt } = useI18n();
  const session = usePlanSession();
  const rows = useMemo(() => durabilityRows(activities, zones), [activities, zones]);
  const [comment, setComment] = useState<{ day: string; en: string; pt: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    fetch("/api/durability", { cache: "no-store" }).then((r) => r.json()).then((c) => alive && setComment(c)).catch(() => undefined);
    return () => {
      alive = false;
    };
  }, []);

  const write = async () => {
    setBusy(true);
    setMsg(null);
    const res = await fetch("/api/durability", { method: "POST" });
    const j = (await res.json().catch(() => ({}))) as { saved?: boolean; comment?: { day: string; en: string; pt: string }; error?: string };
    setBusy(false);
    if (!res.ok) return setErr(j.error ?? String(res.status));
    setErr(null);
    if (j.comment) setComment(j.comment);
    if (!j.saved) setMsg(t("Not enough data yet for a comment."));
  };

  if (rows.length === 0)
    return <Hint>{t("No durability data yet: the second-by-second data of your long runs and rides is read in small batches each day (see Form & Load).")}</Hint>;

  const longRuns = rows.filter((r) => r.sport === "run" && r.movingS >= 45 * 60);
  const longRides = rows.filter((r) => r.sport === "ride" && r.movingS >= 3600);
  const flags = firstKmByMonth(rows);
  const maxRuns = Math.max(1, ...flags.map((f) => f.runs));
  const bricks = rows.filter((r) => r.brick && r.firstKm);

  return (
    <div className="lab-enter space-y-6">
      <Panel
        title={t("Is it improving?")}
        subtitle={t("A short read of your durability, written from these numbers and the current season phase.")}
        aside={
          session.unlocked ? (
            <button onClick={() => void write()} disabled={busy} className="label rounded-full border border-line px-4 py-2 hover:text-fg disabled:opacity-50">
              {busy ? t("Writing…") : t("Write a new comment")}
            </button>
          ) : (
            <LockedHint what={t("Enter the password to write a comment")} />
          )
        }
      >
        {comment ? (
          <>
            <p className="leading-relaxed">{lang === "pt" ? comment.pt : comment.en}</p>
            <p className="label mt-2">{fmt.dateLabel(`${comment.day}T00:00:00`, { day: "2-digit", month: "short", year: "numeric" })}</p>
          </>
        ) : (
          <p className="text-sm text-muted">{t("No comment yet: it is written once a week.")}</p>
        )}
        {msg && <p className="mt-2 text-sm text-muted">{msg}</p>}
        <ErrorNote error={err} className="mt-2" />
      </Panel>

      <div className="grid gap-6 lg:grid-cols-2">
        <Panel title={t("Aerobic decoupling, long runs")} fold subtitle={t("Efficiency (speed ÷ HR) of the first half against the second, after a 10 minute warm-up. Runs of 45 min or more.")}>
          <Dots title={t("% drift")} rows={longRuns} pick={(r) => r.decoupling} unit="%" limits color="var(--run)" />
        </Panel>
        <Panel title={t("Aerobic decoupling, long rides")} fold subtitle={t("Efficiency (power ÷ HR), first half against second. Rides of 60 min or more.")}>
          <Dots title={t("% drift")} rows={longRides} pick={(r) => r.decoupling} unit="%" limits color="var(--ride)" />
        </Panel>
        <Panel title={t("Second-half fade, runs")} fold subtitle={t("How much slower the second half of the distance was. Floripa 70.3 for reference: 4:24 vs 4:55 per km, 11.7%.")}>
          <Dots title={t("% slower")} rows={rows.filter((r) => r.sport === "run")} pick={(r) => r.fade} unit="%" color="var(--run)" />
        </Panel>
        <Panel title={t("Fatigue resistance, rides")} fold subtitle={t("Best 20-minute power after 1,500 and 2,500 kJ of work, as a share of the fresh best of the 90 days before.")}>
          <Dots title={t("% of fresh best, after 1,500 kJ")} rows={rows.filter((r) => r.sport === "ride")} pick={(r) => r.after1500Pct} unit="%" color="var(--ride)" />
          <div className="mt-4">
            <Dots title={t("% of fresh best, after 2,500 kJ")} rows={rows.filter((r) => r.sport === "ride")} pick={(r) => r.after2500Pct} unit="%" color="var(--goal)" />
          </div>
        </Panel>
      </div>

      <Panel title={t("Started too fast")} fold subtitle={t("Runs whose first km was more than 3% faster than km 2 to 5. Bricks (a run within 20 minutes of a ride) always show the check.")}>
        {flags.length === 0 ? (
          <p className="text-sm text-muted">{t("Not enough sessions with this number yet.")}</p>
        ) : (
          <ul className="grid gap-2 sm:grid-cols-2">
            {flags.slice(-8).map((f) => (
              <li key={f.month} className="flex items-center gap-3 text-sm">
                <span className="label w-16">{f.month}</span>
                <span className="relative h-3 flex-1 overflow-hidden rounded-full bg-line/60">
                  <span className="absolute inset-y-0 left-0 rounded-full" style={{ width: `${(f.runs / maxRuns) * 100}%`, background: "var(--run)", opacity: 0.35 }} />
                  <span className="absolute inset-y-0 left-0 rounded-full" style={{ width: `${(f.flagged / maxRuns) * 100}%`, background: "var(--goal)" }} />
                </span>
                <span className="num w-14 text-right">{f.flagged}/{f.runs}</span>
              </li>
            ))}
          </ul>
        )}
        {bricks.length > 0 && (
          <ul className="mt-4 space-y-1 text-sm">
            {bricks.slice(-5).reverse().map((r) => (
              <li key={r.id}>
                <span className="label mr-2">{t("brick")}</span>
                {r.date} · {r.name} · km 1 {Math.floor(r.firstKm!.km1 / 60)}:{String(Math.round(r.firstKm!.km1 % 60)).padStart(2, "0")} /km{" "}
                <span style={{ color: r.tooFast ? "var(--goal)" : BAND_COLOR.good }}>
                  ({r.firstKm!.fasterPct >= 0 ? "+" : ""}
                  {fmt.num(r.firstKm!.fasterPct, 1)}% {r.tooFast ? t("too fast") : t("vs km 2 to 5")})
                </span>
              </li>
            ))}
          </ul>
        )}
      </Panel>
    </div>
  );
}
