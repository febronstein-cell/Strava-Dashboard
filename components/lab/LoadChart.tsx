"use client";

import { useState } from "react";
import { useI18n } from "@/lib/i18n";
import type { LoadDay } from "@/lib/lab/load";

const W = 720;
const M = { l: 40, r: 12 };
const TOP = { t: 12, h: 170 };
const BOT = { t: 214, h: 90 };
const H = BOT.t + BOT.h + 24;

/** Fitness (CTL) and fatigue (ATL) lines on top, form (TSB) bars below. Hover or tap to read a day. */
export function LoadChart({ days }: { days: LoadDay[] }) {
  const { t, fmt } = useI18n();
  const [active, setActive] = useState<number | null>(null);
  if (days.length < 2) return <p className="py-10 text-muted">{t("Few data points in this period.")}</p>;

  const n = days.length;
  const px = (i: number) => M.l + (i / (n - 1)) * (W - M.l - M.r);
  const maxLoad = Math.max(20, ...days.map((d) => Math.max(d.ctl, d.atl)));
  const yTop = (v: number) => TOP.t + TOP.h - (v / maxLoad) * TOP.h;
  const tsbAbs = Math.max(20, ...days.map((d) => Math.abs(d.tsb)));
  const yMid = BOT.t + BOT.h / 2;
  const yTsb = (v: number) => yMid - (v / tsbAbs) * (BOT.h / 2);

  const line = (pick: (d: LoadDay) => number) =>
    days.map((d, i) => `${i ? "L" : "M"}${px(i).toFixed(1)},${yTop(pick(d)).toFixed(1)}`).join(" ");
  const barW = Math.max(1, (W - M.l - M.r) / n - 0.5);
  const cur = active !== null ? days[active] : days[n - 1];

  // month labels
  const labels: { i: number; text: string }[] = [];
  let lastMonth = "";
  days.forEach((d, i) => {
    const m = d.date.slice(0, 7);
    if (m !== lastMonth && d.date.slice(8) <= "07") {
      lastMonth = m;
      labels.push({ i, text: fmt.dateLabel(`${d.date}T00:00:00`, { month: "short", year: n > 200 ? "2-digit" : undefined }) });
    }
  });
  const step = Math.ceil(labels.length / 10);

  return (
    <div onMouseLeave={() => setActive(null)}>
      <div className="mb-3 flex min-h-[3rem] flex-wrap items-baseline gap-x-6 gap-y-1">
        <span className="label">{fmt.dateLabel(`${cur.date}T00:00:00`, { day: "2-digit", month: "short", year: "numeric" })}</span>
        <span className="num text-2xl" style={{ color: "var(--brand)" }}>
          {fmt.int(cur.ctl)} <span className="label">{t("Fitness")}</span>
        </span>
        <span className="num text-2xl" style={{ color: "var(--goal)" }}>
          {fmt.int(cur.atl)} <span className="label">{t("Fatigue")}</span>
        </span>
        <span className="num text-2xl">
          {cur.tsb > 0 ? "+" : ""}
          {fmt.int(cur.tsb)} <span className="label">{t("Form")}</span>
        </span>
        <span className="num text-2xl text-muted">
          {fmt.int(cur.tss)} <span className="label">{t("Load that day")}</span>
        </span>
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} className="block w-full" role="img" aria-label={t("Fitness, fatigue and form")}>
        {[0.25, 0.5, 0.75, 1].map((f) => (
          <g key={f}>
            <line x1={M.l} x2={W - M.r} y1={yTop(maxLoad * f)} y2={yTop(maxLoad * f)} stroke="var(--line)" strokeDasharray="2 4" />
            <text x={M.l - 6} y={yTop(maxLoad * f)} textAnchor="end" dominantBaseline="middle" fontSize="9" fill="var(--muted)" style={{ fontFamily: "var(--f-mono)" }}>
              {fmt.int(maxLoad * f)}
            </text>
          </g>
        ))}
        <path d={line((d) => d.ctl)} fill="none" stroke="var(--brand)" strokeWidth="2.4" strokeLinejoin="round" />
        <path d={line((d) => d.atl)} fill="none" stroke="var(--goal)" strokeWidth="1.6" strokeLinejoin="round" opacity="0.9" />

        <line x1={M.l} x2={W - M.r} y1={yMid} y2={yMid} stroke="var(--line)" />
        <text x={M.l - 6} y={yMid} textAnchor="end" dominantBaseline="middle" fontSize="9" fill="var(--muted)" style={{ fontFamily: "var(--f-mono)" }}>0</text>
        {days.map((d, i) => (
          <rect
            key={d.date}
            x={px(i) - barW / 2}
            y={Math.min(yMid, yTsb(d.tsb))}
            width={barW}
            height={Math.abs(yTsb(d.tsb) - yMid)}
            fill={d.tsb > 15 ? "#2bd4ff" : d.tsb > -10 ? "var(--muted)" : d.tsb > -30 ? "var(--ride)" : "var(--goal)"}
            opacity={0.8}
          />
        ))}

        {labels.filter((_, k) => k % step === 0).map((l) => (
          <text key={l.i} x={px(l.i)} y={H - 6} textAnchor="middle" fontSize="9" fill="var(--muted)" style={{ fontFamily: "var(--f-mono)" }}>
            {l.text}
          </text>
        ))}

        {active !== null && <line x1={px(active)} x2={px(active)} y1={TOP.t} y2={BOT.t + BOT.h} stroke="var(--fg)" opacity="0.4" />}
        <rect
          x={M.l}
          y={TOP.t}
          width={W - M.l - M.r}
          height={BOT.t + BOT.h - TOP.t}
          fill="transparent"
          onMouseMove={(e) => {
            const r = e.currentTarget.getBoundingClientRect();
            setActive(Math.max(0, Math.min(n - 1, Math.round(((e.clientX - r.left) / r.width) * (n - 1)))));
          }}
          onClick={(e) => {
            const r = e.currentTarget.getBoundingClientRect();
            setActive(Math.max(0, Math.min(n - 1, Math.round(((e.clientX - r.left) / r.width) * (n - 1)))));
          }}
        />
      </svg>
      <div className="label mt-3 flex flex-wrap gap-x-5 gap-y-1">
        <span style={{ color: "var(--brand)" }}>● {t("Fitness (42-day load)")}</span>
        <span style={{ color: "var(--goal)" }}>● {t("Fatigue (7-day load)")}</span>
        <span>▮ {t("Form = fitness − fatigue")}</span>
      </div>
    </div>
  );
}
