"use client";

import { useI18n } from "@/lib/i18n";
import { useState } from "react";

export interface LinePoint {
  label: string;
  value: number | null;
}

const W = 600;
const H = 220;
const M = { l: 44, r: 12, t: 14, b: 30 };

/** Linha com pontos; valores `null` quebram a linha. Leitura ao passar o mouse. */
export function LineChart({
  points,
  format,
  yTicks,
  domain,
  labelEvery = 1,
  color = "var(--brand)",
}: {
  points: LinePoint[];
  format: (v: number) => string;
  yTicks: number[];
  domain: [number, number];
  labelEvery?: number;
  color?: string;
}) {
  const { t } = useI18n();
  const [active, setActive] = useState<number | null>(null);
  const known = points.filter((p) => p.value !== null).length;
  if (known < 2) return <p className="py-10 text-muted">{t("Few data points in this period.")}</p>;

  const n = points.length;
  const px = (i: number) => M.l + (n === 1 ? 0.5 : i / (n - 1)) * (W - M.l - M.r);
  const py = (v: number) => H - M.b - ((v - domain[0]) / (domain[1] - domain[0])) * (H - M.b - M.t);

  // segmentos contínuos
  const segs: string[] = [];
  let cur = "";
  points.forEach((p, i) => {
    if (p.value === null) {
      if (cur) segs.push(cur);
      cur = "";
    } else cur += `${cur ? "L" : "M"}${px(i).toFixed(1)},${py(p.value).toFixed(1)} `;
  });
  if (cur) segs.push(cur);

  const sel = active !== null ? points[active] : null;

  return (
    <div onMouseLeave={() => setActive(null)}>
      <div className="min-h-[2.4rem]">
        {sel ? (
          <p className="pt-1">
            <span className="label mr-3">{sel.label}</span>
            <span className="num text-3xl">{sel.value === null ? "—" : format(sel.value)}</span>
          </p>
        ) : (
          <p className="label pt-1">{t("Hover (or tap) the points")}</p>
        )}
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} className="block w-full" role="img">
        {yTicks.map((t) => (
          <g key={t}>
            <line x1={M.l} x2={W - M.r} y1={py(t)} y2={py(t)} stroke="var(--line)" strokeDasharray="2 4" />
            <text x={M.l - 8} y={py(t)} textAnchor="end" dominantBaseline="middle" fontSize="9" fill="var(--muted)" style={{ fontFamily: "var(--f-mono)" }}>
              {format(t)}
            </text>
          </g>
        ))}
        {segs.map((d, i) => (
          <path key={i} d={d} fill="none" stroke={color} strokeWidth="2.2" strokeLinejoin="round" strokeLinecap="round" pathLength={1} className="draw-in" />
        ))}
        {points.map((p, i) => (
          <g key={i}>
            {p.value !== null && <circle cx={px(i)} cy={py(p.value)} r={active === i ? 5.5 : 3} fill={color} />}
            <rect x={px(i) - (W - M.l - M.r) / n / 2} y={M.t} width={(W - M.l - M.r) / n} height={H - M.t - M.b} fill="transparent" onMouseEnter={() => setActive(i)} onClick={() => setActive(i)} />
            {i % labelEvery === 0 && (
              <text x={px(i)} y={H - 10} textAnchor="middle" fontSize="9" fill="var(--muted)" style={{ fontFamily: "var(--f-mono)" }}>
                {p.label}
              </text>
            )}
          </g>
        ))}
      </svg>
    </div>
  );
}
