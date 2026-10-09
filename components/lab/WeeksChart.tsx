"use client";

import { useState } from "react";
import { useI18n } from "@/lib/i18n";
import type { BuildWeek, Phase } from "@/lib/lab/builds";

export const PHASE_COLOR: Record<Phase, string> = {
  base: "var(--swim)",
  build: "var(--ride)",
  peak: "var(--run)",
  taper: "#b06bff",
  race: "var(--goal)",
};

const W = 720;
const H = 230;
const M = { l: 36, r: 8, t: 14, b: 30 };

/** Weekly hours: outlined bar = plan, filled bar = what was trained. Past weeks show only the filled bar. */
export function WeeksChart({ weeks, compact = false }: { weeks: BuildWeek[]; compact?: boolean }) {
  const { t, fmt } = useI18n();
  const [active, setActive] = useState<number | null>(null);
  const n = weeks.length;
  if (n === 0) return null;

  const max = Math.max(4, ...weeks.map((w) => Math.max(w.actual, w.target ?? 0))) * 1.12;
  const slot = (W - M.l - M.r) / n;
  const bw = Math.min(34, slot * 0.7);
  const y = (h: number) => H - M.b - (h / max) * (H - M.t - M.b);
  const x = (i: number) => M.l + slot * i + slot / 2;
  const ticks = [0, 0.5, 1].map((f) => Math.round(max * f));
  const sel = active !== null ? weeks[active] : null;

  return (
    <div onMouseLeave={() => setActive(null)}>
      {!compact && (
        <div className="min-h-[3rem]">
          {sel ? (
            <p className="flex flex-wrap items-baseline gap-x-4">
              <span className="label">{fmt.dateLabel(`${sel.start}T00:00:00`, { day: "2-digit", month: "short" })}</span>
              {sel.phase && <span className="label" style={{ color: PHASE_COLOR[sel.phase] }}>{t(sel.phase)}</span>}
              {sel.target !== null && (
                <span className="num text-2xl">
                  {fmt.hours(sel.target * 3600, 1)} h <span className="label">{t("planned")}</span>
                </span>
              )}
              <span className="num text-2xl">
                {fmt.hours(sel.actual * 3600, 1)} h <span className="label">{t("done")}</span>
              </span>
              {sel.title && <span className="text-sm text-muted">{sel.title}</span>}
            </p>
          ) : (
            <p className="label pt-1">{t("Hover (or tap) the bars")}</p>
          )}
        </div>
      )}
      <svg viewBox={`0 0 ${W} ${H}`} className="block w-full" role="img" aria-label={t("Weekly hours: plan and actual")}>
        {ticks.map((v) => (
          <g key={v}>
            <line x1={M.l} x2={W - M.r} y1={y(v)} y2={y(v)} stroke="var(--line)" strokeDasharray="2 4" />
            <text x={M.l - 6} y={y(v)} textAnchor="end" dominantBaseline="middle" fontSize="9" fill="var(--muted)" style={{ fontFamily: "var(--f-mono)" }}>
              {v}h
            </text>
          </g>
        ))}
        {weeks.map((w, i) => {
          const color = w.phase ? PHASE_COLOR[w.phase] : "var(--muted)";
          return (
            <g key={w.start} opacity={active !== null && active !== i ? 0.55 : 1}>
              {w.target !== null && (
                <rect x={x(i) - bw / 2} y={y(w.target)} width={bw} height={Math.max(0, H - M.b - y(w.target))} rx="3" fill="none" stroke={color} strokeWidth={w.custom ? 2.2 : 1.4} strokeDasharray={w.custom ? undefined : "4 3"} />
              )}
              {w.state !== "future" && (
                <rect x={x(i) - bw / 2 + 3} y={y(w.actual)} width={bw - 6} height={Math.max(0, H - M.b - y(w.actual))} rx="2" fill={color} opacity={w.state === "current" ? 0.55 : 0.9} />
              )}
              {w.state === "current" && (
                <text x={x(i)} y={M.t - 2} textAnchor="middle" fontSize="8" fill="var(--fg)" style={{ fontFamily: "var(--f-mono)" }}>
                  {t("now")}
                </text>
              )}
              {(!compact || i % 2 === 0) && (
                <text x={x(i)} y={H - 10} textAnchor="middle" fontSize="8.5" fill="var(--muted)" style={{ fontFamily: "var(--f-mono)" }}>
                  {fmt.dateLabel(`${w.start}T00:00:00`, { day: "2-digit", month: "2-digit" })}
                </text>
              )}
              <rect x={x(i) - slot / 2} y={M.t} width={slot} height={H - M.t - M.b} fill="transparent" onMouseEnter={() => setActive(i)} onClick={() => setActive(i)} />
            </g>
          );
        })}
      </svg>
    </div>
  );
}
