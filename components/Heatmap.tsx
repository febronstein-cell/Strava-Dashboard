"use client";

import { useEffect, useRef } from "react";
import { siteConfig } from "@/site.config";
import type { HeatDay } from "@/lib/stats";

function level(seconds: number): number {
  if (seconds <= 0) return 0;
  if (seconds < 30 * 60) return 1;
  if (seconds < 60 * 60) return 2;
  if (seconds < 100 * 60) return 3;
  return 4;
}
export const HEAT_MIX = [0, 32, 52, 76, 100]; // % da cor da modalidade por nível

const monthShort = (iso: string) =>
  new Intl.DateTimeFormat(siteConfig.locale, { month: "short", timeZone: "UTC" })
    .format(new Date(iso + "T00:00:00Z"))
    .replace(".", "");

/** Grade de dias (semanas em colunas, segunda no topo), estilo GitHub. */
export function Heatmap({
  days,
  colorBySport,
  cell = 14,
  gap = 3,
  scrollToEnd = false,
  selected,
  onSelect,
  label,
}: {
  days: HeatDay[];
  colorBySport: boolean;
  cell?: number;
  gap?: number;
  scrollToEnd?: boolean;
  selected?: string | null;
  onSelect: (d: HeatDay) => void;
  /** rótulo à esquerda (ex.: o ano, no modo "todos") */
  label?: string;
}) {
  const scroller = useRef<HTMLDivElement>(null);
  const cols = Math.max(...days.map((d) => d.col)) + 1;
  const lastCol = days.filter((d) => !d.future).at(-1)?.col ?? cols - 1;
  const step = cell + gap;

  // Abre rolado até a semana atual (útil no celular).
  useEffect(() => {
    const el = scroller.current;
    if (el && scrollToEnd) el.scrollLeft = Math.max(0, lastCol * step - el.clientWidth + 80);
  }, [lastCol, step, scrollToEnd]);

  const monthMarks = days.filter((d) => d.date.endsWith("-01") || d === days[0]);

  return (
    <div className="flex gap-3">
      {label && (
        <span className="label w-9 shrink-0 pt-6 text-[0.62rem]" style={{ lineHeight: `${cell}px` }}>
          {label}
        </span>
      )}
      <div ref={scroller} className="overflow-x-auto pb-2">
        <div className="relative" style={{ width: cols * step - gap }}>
          <div className="relative h-5">
            {monthMarks.map((d) => (
              <span key={d.date} className="label absolute text-[0.62rem]" style={{ left: d.col * step }}>
                {monthShort(d.date)}
              </span>
            ))}
          </div>
          <div
            className="grid"
            style={{
              gridTemplateColumns: `repeat(${cols}, ${cell}px)`,
              gridTemplateRows: `repeat(7, ${cell}px)`,
              gap,
            }}
          >
            {days.map((d) => {
              const lv = level(d.seconds);
              const hue = colorBySport && d.dominant ? `var(--${d.dominant})` : "var(--accent)";
              return (
                <button
                  key={d.date}
                  type="button"
                  tabIndex={-1}
                  aria-label={`${d.date}: ${Math.round(d.seconds / 60)} minutos`}
                  onMouseEnter={() => onSelect(d)}
                  onClick={() => onSelect(d)}
                  className="rounded-[3px] transition-transform hover:scale-125"
                  style={{
                    gridColumn: d.col + 1,
                    gridRow: d.row + 1,
                    background:
                      lv === 0 ? "var(--bg-soft)" : `color-mix(in oklab, ${hue} ${HEAT_MIX[lv]}%, var(--bg-soft))`,
                    opacity: d.future ? 0.3 : 1,
                    outline: selected === d.date ? "2px solid var(--fg)" : undefined,
                    outlineOffset: 1,
                  }}
                />
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
