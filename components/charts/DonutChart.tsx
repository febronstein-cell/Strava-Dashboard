"use client";

import { useState } from "react";

export interface DonutSegment {
  name: string;
  value: number;
  color: string;
  /** texto à direita na legenda (ex.: horas e km) */
  detail?: string;
}

const CIRC = 2 * Math.PI * 70;

/** Rosca com porcentagens e legenda. Passe o mouse num item para destacá-lo. */
export function DonutChart({
  segments,
  format = (v) => String(v),
  center,
}: {
  segments: DonutSegment[];
  format?: (v: number) => string;
  center?: string;
}) {
  const [active, setActive] = useState<number | null>(null);
  const total = segments.reduce((a, s) => a + s.value, 0) || 1;
  // início de cada arco (comprimento acumulado), calculado antes de desenhar
  const starts: number[] = [];
  segments.reduce((acc, s) => {
    starts.push(acc);
    return acc + (s.value / total) * CIRC;
  }, 0);

  return (
    <div className="flex flex-col items-center gap-6 sm:flex-row sm:items-center sm:gap-8" onMouseLeave={() => setActive(null)}>
      <svg viewBox="0 0 200 200" className="size-48 shrink-0 sm:size-52" role="img">
        <g className="donut-in" style={{ transformOrigin: "100px 100px" }}>
          <g transform="rotate(-90 100 100)">
            {segments.map((s, i) => {
              const len = (s.value / total) * CIRC;
              const dash = Math.max(len - 2, 0);
              return (
                <circle
                  key={s.name}
                  cx="100"
                  cy="100"
                  r="70"
                  fill="none"
                  stroke={s.color}
                  strokeWidth={active === i ? 38 : 32}
                  strokeDasharray={`${dash} ${CIRC - dash}`}
                  strokeDashoffset={-starts[i]}
                  opacity={active === null || active === i ? 1 : 0.4}
                  style={{ transition: "stroke-width .2s, opacity .2s" }}
                  onMouseEnter={() => setActive(i)}
                  onClick={() => setActive(i)}
                />
              );
            })}
          </g>
          {/* porcentagens dentro dos arcos grandes */}
          {segments.map((s, i) => {
            const frac = s.value / total;
            if (frac < 0.07) return null;
            const mid = (starts[i] / CIRC + frac / 2) * 2 * Math.PI - Math.PI / 2;
            return (
              <text
                key={s.name}
                x={Math.round((100 + 70 * Math.cos(mid)) * 100) / 100}
                y={Math.round((100 + 70 * Math.sin(mid)) * 100) / 100}
                textAnchor="middle"
                dominantBaseline="middle"
                fontSize="10"
                fontWeight="700"
                fill="#0b0b0c"
                style={{ fontFamily: "var(--f-mono)", pointerEvents: "none" }}
              >
                {(frac * 100).toFixed(1).replace(".", ",")}%
              </text>
            );
          })}
        </g>
        {center && (
          <text
            x="100"
            y="100"
            textAnchor="middle"
            dominantBaseline="middle"
            fontSize="12"
            fill="var(--muted)"
            style={{ fontFamily: "var(--f-mono)", letterSpacing: "0.1em" }}
          >
            {center}
          </text>
        )}
      </svg>

      <ul className="w-full space-y-2">
        {segments.map((s, i) => (
          <li
            key={s.name}
            onMouseEnter={() => setActive(i)}
            className={`flex items-center gap-3 rounded-lg px-2 py-1.5 transition-opacity ${
              active === null || active === i ? "opacity-100" : "opacity-45"
            }`}
          >
            <span className="size-2.5 shrink-0 rounded-full" style={{ background: s.color }} />
            <span className="flex-1 truncate">{s.name}</span>
            <span className="num text-2xl">{format(s.value)}</span>
            {s.detail && <span className="label hidden text-[0.6rem] sm:inline">{s.detail}</span>}
          </li>
        ))}
      </ul>
    </div>
  );
}
