"use client";

import { useI18n } from "@/lib/i18n";
const W = 600;
const H = 230;
const M = { l: 12, r: 12, t: 28, b: 30 };

/**
 * Curva de distribuição (estimativa de densidade por kernel gaussiano).
 * `reverse` inverte o eixo: usado em ritmo, onde menos segundos = mais rápido (à direita).
 */
export function DensityChart({
  values,
  domain,
  bandwidth,
  ticks,
  format,
  reverse = false,
  unit = "",
  color = "var(--brand)",
}: {
  values: number[];
  domain: [number, number];
  bandwidth: number;
  ticks: number[];
  format: (x: number) => string;
  reverse?: boolean;
  /** unidade exibida junto da média (ex.: "/km") */
  unit?: string;
  color?: string;
}) {
  const { t } = useI18n();
  if (values.length < 3) return <p className="py-10 text-muted">{t("Few data points in this period.")}</p>;

  const [lo, hi] = domain;
  const N = 140;
  const xs = Array.from({ length: N + 1 }, (_, i) => lo + ((hi - lo) * i) / N);
  const dens = xs.map(
    (x) => values.reduce((s, v) => s + Math.exp(-0.5 * ((x - v) / bandwidth) ** 2), 0) / (values.length * bandwidth * 2.5066),
  );
  const maxD = Math.max(...dens) || 1;
  const px = (x: number) => {
    const t = (x - lo) / (hi - lo);
    return M.l + (reverse ? 1 - t : t) * (W - M.l - M.r);
  };
  const py = (d: number) => H - M.b - (d / maxD) * (H - M.b - M.t);
  const line = xs.map((x, i) => `${i ? "L" : "M"}${px(x).toFixed(1)},${py(dens[i]).toFixed(1)}`).join(" ");
  const area = `${line} L${px(xs[N]).toFixed(1)},${H - M.b} L${px(xs[0]).toFixed(1)},${H - M.b} Z`;
  const mean = values.reduce((a, b) => a + b, 0) / values.length;

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="block w-full" role="img">
      <defs>
        <linearGradient id="dens-fill" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.35" />
          <stop offset="100%" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={area} fill="url(#dens-fill)" className="fade-in" />
      <path d={line} fill="none" stroke={color} strokeWidth="2" pathLength={1} className="draw-in" />
      <line x1={M.l} x2={W - M.r} y1={H - M.b} y2={H - M.b} stroke="var(--line)" />

      <line x1={px(mean)} x2={px(mean)} y1={M.t - 6} y2={H - M.b} stroke={color} strokeDasharray="3 4" opacity="0.8" />
      <text x={px(mean)} y={12} textAnchor="middle" fontSize="10" fill="var(--fg)" style={{ fontFamily: "var(--f-mono)" }}>
        {t("avg:")} {format(mean)} {unit}
      </text>

      {ticks.map((t) => (
        <text
          key={t}
          x={px(t)}
          y={H - 10}
          textAnchor="middle"
          fontSize="9"
          fill="var(--muted)"
          style={{ fontFamily: "var(--f-mono)" }}
        >
          {format(t)}
        </text>
      ))}
    </svg>
  );
}
