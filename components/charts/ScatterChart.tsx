"use client";

import { useState } from "react";

export interface ScatterPoint {
  id: number;
  x: number;
  y: number;
  /** texto da leitura ao passar o mouse */
  label: string;
}

const W = 600;
const H = 300;
const M = { l: 46, r: 12, t: 12, b: 34 };

/** Dispersão: um ponto por atividade. Clique num ponto para abrir o treino. */
export function ScatterChart({
  points,
  xDomain,
  yDomain,
  xTicks,
  yTicks,
  formatX,
  formatY,
  reverseX = false,
  onPick,
  color = "var(--brand)",
}: {
  points: ScatterPoint[];
  xDomain: [number, number];
  yDomain: [number, number];
  xTicks: number[];
  yTicks: number[];
  formatX: (x: number) => string;
  formatY: (y: number) => string;
  reverseX?: boolean;
  onPick: (id: number) => void;
  color?: string;
}) {
  const [active, setActive] = useState<ScatterPoint | null>(null);
  if (points.length < 3) return <p className="py-10 text-muted">Poucos dados neste período.</p>;

  const px = (x: number) => {
    const t = (x - xDomain[0]) / (xDomain[1] - xDomain[0]);
    return M.l + (reverseX ? 1 - t : t) * (W - M.l - M.r);
  };
  const py = (y: number) => H - M.b - ((y - yDomain[0]) / (yDomain[1] - yDomain[0])) * (H - M.b - M.t);

  return (
    <div onMouseLeave={() => setActive(null)}>
      <div className="min-h-[2.4rem]">
        {active ? (
          <p className="label pt-1 text-fg">{active.label}</p>
        ) : (
          <p className="label pt-1">Passe o mouse num ponto; clique para abrir o treino</p>
        )}
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} className="block w-full" role="img">
        {yTicks.map((t) => (
          <g key={t}>
            <line x1={M.l} x2={W - M.r} y1={py(t)} y2={py(t)} stroke="var(--line)" strokeDasharray="2 4" />
            <text x={M.l - 8} y={py(t)} textAnchor="end" dominantBaseline="middle" fontSize="9" fill="var(--muted)" style={{ fontFamily: "var(--f-mono)" }}>
              {formatY(t)}
            </text>
          </g>
        ))}
        {xTicks.map((t) => (
          <text key={t} x={px(t)} y={H - 12} textAnchor="middle" fontSize="9" fill="var(--muted)" style={{ fontFamily: "var(--f-mono)" }}>
            {formatX(t)}
          </text>
        ))}
        <g className="fade-in">
          {points.map((p) => (
            <circle
              key={p.id}
              cx={px(p.x)}
              cy={py(p.y)}
              r={active?.id === p.id ? 6 : 3.6}
              fill={color}
              fillOpacity={active?.id === p.id ? 0.95 : 0.35}
              stroke={color}
              strokeOpacity="0.6"
              style={{ cursor: "pointer", transition: "r .15s" }}
              onMouseEnter={() => setActive(p)}
              onClick={() => onPick(p.id)}
            />
          ))}
        </g>
      </svg>
    </div>
  );
}
