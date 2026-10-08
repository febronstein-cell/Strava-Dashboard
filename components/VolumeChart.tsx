"use client";

import { useMemo, useState } from "react";
import { siteConfig, type SportKey } from "@/site.config";
import type { VolumePoint } from "@/lib/stats";

const SPORT_ORDER: SportKey[] = ["swim", "ride", "run"]; // de baixo para cima na barra
type Mode = "weekly" | "monthly";

const fmtHours = (s: number) => {
  const h = Math.floor(s / 3600);
  const m = Math.round((s % 3600) / 60);
  return h ? `${h}h${String(m).padStart(2, "0")}` : `${m}min`;
};

function niceMax(seconds: number) {
  // múltiplo de 4 h, para o eixo ter 4 divisões inteiras (0, 1/4, 1/2, 3/4, topo)
  return Math.max(4, Math.ceil(seconds / 3600 / 4) * 4);
}

export function VolumeChart({ weekly, monthly }: { weekly: VolumePoint[]; monthly: VolumePoint[] }) {
  const [mode, setMode] = useState<Mode>("weekly");
  const [active, setActive] = useState<number | null>(null);
  const points = mode === "weekly" ? weekly : monthly;

  const maxHours = useMemo(
    () => niceMax(Math.max(...points.map((p) => p.run + p.ride + p.swim), 0)),
    [points],
  );
  const grid = [1, 0.75, 0.5, 0.25, 0].map((f) => maxHours * f);

  const label = (p: VolumePoint, i: number): string => {
    if (mode === "monthly") {
      return new Intl.DateTimeFormat(siteConfig.locale, { month: "short", timeZone: "UTC" })
        .format(new Date(p.key + "-01T00:00:00Z"))
        .replace(".", "");
    }
    // semanal: a semana pertence ao mês da sua quinta-feira (como na ISO 8601);
    // rótulo só quando o mês muda
    const mid = (key: string) => new Date(new Date(key + "T00:00:00Z").getTime() + 3 * 86_400_000);
    const d = mid(p.key);
    if (i > 0 && mid(points[i - 1].key).getUTCMonth() === d.getUTCMonth()) return "";
    return new Intl.DateTimeFormat(siteConfig.locale, { month: "short", timeZone: "UTC" })
      .format(d)
      .replace(".", "");
  };

  const readout = (p: VolumePoint | null) => {
    if (!p) {
      const total = points.reduce((a, q) => a + q.run + q.ride + q.swim, 0);
      return { title: mode === "weekly" ? "Total no ano" : "Total no ano", total, sel: null as VolumePoint | null };
    }
    const title =
      mode === "weekly"
        ? "Semana de " +
          new Intl.DateTimeFormat(siteConfig.locale, { day: "2-digit", month: "short", timeZone: "UTC" })
            .format(new Date(p.key + "T00:00:00Z"))
            .replace(".", "")
        : new Intl.DateTimeFormat(siteConfig.locale, { month: "long", timeZone: "UTC" }).format(
            new Date(p.key + "-01T00:00:00Z"),
          );
    return { title, total: p.run + p.ride + p.swim, sel: p };
  };
  const info = readout(active === null ? null : points[active]);

  return (
    <div className="card p-5 sm:p-8">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="label">{info.title}</p>
          <p className="num mt-2 text-5xl sm:text-6xl">{fmtHours(info.total)}</p>
          <div className="mt-3 flex min-h-5 flex-wrap gap-x-5 gap-y-1 text-sm">
            {SPORT_ORDER.slice()
              .reverse()
              .map((s) => {
                const secs = info.sel
                  ? info.sel[s]
                  : points.reduce((a, q) => a + q[s], 0);
                return (
                  <span key={s} className="inline-flex items-center gap-2 text-muted">
                    <span className="size-2.5 rounded-full" style={{ background: `var(--${s})` }} />
                    {siteConfig.sports[s].label}{" "}
                    <span className="text-fg">{fmtHours(secs)}</span>
                  </span>
                );
              })}
          </div>
        </div>

        <div role="tablist" aria-label="Período" className="label flex rounded-full border border-line p-1">
          {(["weekly", "monthly"] as Mode[]).map((m) => (
            <button
              key={m}
              role="tab"
              aria-selected={mode === m}
              onClick={() => {
                setMode(m);
                setActive(null);
              }}
              className={`rounded-full px-4 py-1.5 transition-colors ${
                mode === m ? "bg-fg text-bg" : "hover:text-fg"
              }`}
            >
              {m === "weekly" ? "Semanal" : "Mensal"}
            </button>
          ))}
        </div>
      </div>

      <div className="relative mt-8 h-64 sm:h-80" onMouseLeave={() => setActive(null)}>
        {/* linhas de grade + eixo (horas) */}
        {grid.map((h, i) => (
          <div
            key={h}
            className="absolute inset-x-0 flex items-center gap-3"
            style={{ top: `${(i / (grid.length - 1)) * 100}%` }}
          >
            <span className="label w-8 shrink-0 -translate-y-px text-right text-[0.62rem]">{h}h</span>
            <div className="h-px flex-1 bg-line" />
          </div>
        ))}

        <div
          key={mode}
          className={`absolute inset-y-0 right-0 left-11 flex items-stretch ${mode === "weekly" ? "gap-[2px]" : "gap-2"}`}
        >
          {points.map((p, i) => {
            const total = p.run + p.ride + p.swim;
            return (
              <button
                key={p.key}
                type="button"
                aria-label={`${readout(p).title}: ${fmtHours(total)}`}
                onMouseEnter={() => setActive(i)}
                onFocus={() => setActive(i)}
                onClick={() => setActive(i)}
                className="group relative flex flex-1 flex-col justify-end outline-none"
              >
                <div
                  className="flex flex-col-reverse overflow-hidden rounded-t-[3px] transition-opacity"
                  style={{
                    height: `${(total / 3600 / maxHours) * 100}%`,
                    opacity: active === null || active === i ? 1 : 0.35,
                  }}
                >
                  {SPORT_ORDER.map((s) =>
                    p[s] > 0 ? (
                      <div
                        key={s}
                        className="bar-seg"
                        style={{
                          flex: `${p[s]} 1 0%`,
                          background: `var(--${s})`,
                          animationDelay: `${i * (mode === "weekly" ? 14 : 60)}ms`,
                        }}
                      />
                    ) : null,
                  )}
                </div>
                <span className="label absolute top-full left-0 mt-3 text-[0.62rem] whitespace-nowrap">
                  {label(p, i)}
                </span>
              </button>
            );
          })}
        </div>
      </div>
      <div className="h-6" />
    </div>
  );
}
