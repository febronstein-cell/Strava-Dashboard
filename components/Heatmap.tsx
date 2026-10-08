"use client";

import { useEffect, useRef, useState } from "react";
import { siteConfig } from "@/site.config";
import type { HeatDay } from "@/lib/stats";

const CELL = 14;
const GAP = 3;

function level(seconds: number): number {
  if (seconds <= 0) return 0;
  if (seconds < 30 * 60) return 1;
  if (seconds < 60 * 60) return 2;
  if (seconds < 100 * 60) return 3;
  return 4;
}
const MIX = [0, 32, 52, 76, 100]; // % da cor da modalidade por nível

const fmtDay = (iso: string) =>
  new Intl.DateTimeFormat(siteConfig.locale, { weekday: "short", day: "2-digit", month: "long", timeZone: "UTC" }).format(
    new Date(iso + "T00:00:00Z"),
  );

export function Heatmap({ days, colorBySport }: { days: HeatDay[]; colorBySport: boolean }) {
  const [active, setActive] = useState<HeatDay | null>(null);
  const scroller = useRef<HTMLDivElement>(null);
  const cols = Math.max(...days.map((d) => d.col)) + 1;
  const todayCol = days.filter((d) => !d.future).at(-1)?.col ?? cols - 1;

  // No celular, abre rolado até a semana atual.
  useEffect(() => {
    const el = scroller.current;
    if (el) el.scrollLeft = Math.max(0, todayCol * (CELL + GAP) - el.clientWidth + 80);
  }, [todayCol]);

  const monthMarks = days.filter((d) => d.date.endsWith("-01"));
  const weekdays = ["Seg", "", "Qua", "", "Sex", "", ""];

  return (
    <div className="card p-5 sm:p-8">
      <div className="min-h-14">
        {active ? (
          <>
            <p className="label">{fmtDay(active.date)}</p>
            <p className="mt-2 text-lg">
              {active.seconds > 0 ? (
                <>
                  <span className="num text-3xl">{Math.round(active.seconds / 60)}</span> min ·{" "}
                  {active.count} {active.count === 1 ? "atividade" : "atividades"}
                  {active.dominant && (
                    <span style={{ color: `var(--${active.dominant})` }}>
                      {" "}
                      · {siteConfig.sports[active.dominant].label}
                    </span>
                  )}
                </>
              ) : (
                <span className="text-muted">Dia de descanso</span>
              )}
            </p>
          </>
        ) : (
          <>
            <p className="label">Passe o mouse (ou toque) em um dia</p>
            <p className="mt-2 text-muted">Cada quadrado é um dia; quanto mais forte a cor, mais tempo treinado.</p>
          </>
        )}
      </div>

      <div className="mt-6 flex gap-3">
        <div
          className="label hidden shrink-0 text-[0.62rem] sm:grid"
          style={{ gridTemplateRows: `repeat(7, ${CELL}px)`, rowGap: GAP, marginTop: 22 }}
        >
          {weekdays.map((w, i) => (
            <span key={i} className="leading-[14px]">
              {w}
            </span>
          ))}
        </div>

        <div ref={scroller} className="overflow-x-auto pb-2" onMouseLeave={() => setActive(null)}>
          <div className="relative" style={{ width: cols * (CELL + GAP) - GAP }}>
            <div className="relative h-5">
              {monthMarks.map((d) => (
                <span
                  key={d.date}
                  className="label absolute text-[0.62rem]"
                  style={{ left: d.col * (CELL + GAP) }}
                >
                  {new Intl.DateTimeFormat(siteConfig.locale, { month: "short", timeZone: "UTC" })
                    .format(new Date(d.date + "T00:00:00Z"))
                    .replace(".", "")}
                </span>
              ))}
            </div>
            <div
              className="grid"
              style={{
                gridTemplateColumns: `repeat(${cols}, ${CELL}px)`,
                gridTemplateRows: `repeat(7, ${CELL}px)`,
                gap: GAP,
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
                    aria-label={`${fmtDay(d.date)}: ${Math.round(d.seconds / 60)} minutos`}
                    onMouseEnter={() => setActive(d)}
                    onClick={() => setActive(d)}
                    className="rounded-[3px] transition-transform hover:scale-125"
                    style={{
                      gridColumn: d.col + 1,
                      gridRow: d.row + 1,
                      background:
                        lv === 0
                          ? "var(--bg-soft)"
                          : `color-mix(in oklab, ${hue} ${MIX[lv]}%, var(--bg-soft))`,
                      opacity: d.future ? 0.35 : 1,
                    }}
                  />
                );
              })}
            </div>
          </div>
        </div>
      </div>

      <div className="label mt-4 flex items-center justify-end gap-2 text-[0.62rem]">
        Menos
        {[0, 1, 2, 3, 4].map((l) => (
          <span
            key={l}
            className="size-3 rounded-[3px]"
            style={{
              background: l === 0 ? "var(--bg-soft)" : `color-mix(in oklab, var(--accent) ${MIX[l]}%, var(--bg-soft))`,
            }}
          />
        ))}
        Mais
      </div>
    </div>
  );
}
