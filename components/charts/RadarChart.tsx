"use client";

import { useState } from "react";

const C = 150;
const R = 100;

/** Gráfico radar (teia). Passe o mouse ou toque nos eixos para ler o valor. */
export function RadarChart({
  labels,
  values,
  format,
  labelEvery = 1,
  color = "var(--brand)",
  defaultText,
}: {
  labels: string[];
  values: number[];
  format: (v: number) => string;
  labelEvery?: number;
  color?: string;
  defaultText?: string;
}) {
  const [active, setActive] = useState<number | null>(null);
  const n = labels.length;
  const max = Math.max(...values, 0) || 1;
  const ang = (i: number) => -Math.PI / 2 + (i * 2 * Math.PI) / n;
  // arredondado: Math.sin/cos podem diferir na última casa entre servidor e navegador (hidratação)
  const r2 = (n: number) => Math.round(n * 100) / 100;
  const pt = (i: number, r: number) => [r2(C + r * Math.cos(ang(i))), r2(C + r * Math.sin(ang(i)))] as const;
  const poly = (r: (i: number) => number) =>
    Array.from({ length: n }, (_, i) => pt(i, r(i)).join(",")).join(" ");

  return (
    <div onMouseLeave={() => setActive(null)}>
      <div className="min-h-[3.2rem]">
        {active !== null ? (
          <>
            <p className="label">{labels[active]}</p>
            <p className="num mt-1.5 text-3xl">{format(values[active])}</p>
          </>
        ) : (
          <p className="label pt-1">{defaultText ?? "Passe o mouse (ou toque) nos eixos"}</p>
        )}
      </div>

      <svg viewBox="0 0 300 300" className="mx-auto block w-full max-w-[22rem]" role="img">
        {[0.25, 0.5, 0.75, 1].map((k) => (
          <polygon key={k} points={poly(() => R * k)} fill="none" stroke="var(--line)" strokeWidth="1" />
        ))}
        {labels.map((_, i) => {
          const [x, y] = pt(i, R);
          return <line key={i} x1={C} y1={C} x2={x} y2={y} stroke="var(--line)" strokeWidth="1" />;
        })}

        <g className="radar-in" style={{ transformOrigin: `${C}px ${C}px` }}>
          <polygon
            points={poly((i) => (R * values[i]) / max)}
            fill={color}
            fillOpacity="0.22"
            stroke={color}
            strokeWidth="2"
            strokeLinejoin="round"
          />
          {values.map((v, i) => {
            const [x, y] = pt(i, (R * v) / max);
            return <circle key={i} cx={x} cy={y} r={active === i ? 5 : 2.5} fill={color} />;
          })}
        </g>

        {labels.map((l, i) => {
          if (i % labelEvery !== 0) return null;
          const [x, y] = pt(i, R + 16);
          const cos = Math.round(Math.cos(ang(i)) * 100) / 100;
          return (
            <text
              key={i}
              x={x}
              y={y}
              textAnchor={Math.abs(cos) < 0.2 ? "middle" : cos > 0 ? "start" : "end"}
              dominantBaseline="middle"
              fontSize="9"
              fill="var(--muted)"
              style={{ fontFamily: "var(--f-mono)", letterSpacing: "0.06em" }}
            >
              {l}
            </text>
          );
        })}

        {/* áreas de toque, uma por eixo */}
        {labels.map((_, i) => {
          const [x, y] = pt(i, R * 0.85);
          return (
            <circle
              key={i}
              cx={x}
              cy={y}
              r={Math.max(10, 280 / n)}
              fill="transparent"
              onMouseEnter={() => setActive(i)}
              onClick={() => setActive(i)}
            />
          );
        })}
      </svg>
    </div>
  );
}
