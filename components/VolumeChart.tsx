"use client";

import { useMemo, useState } from "react";
import { ALL_SPORTS, siteConfig, type SportKey } from "@/site.config";
import type { VolumePoint } from "@/lib/stats";

const STACK_ORDER: SportKey[] = ["strength", "swim", "ride", "run"]; // de baixo para cima na barra
type Mode = "weekly" | "monthly";

const fmtHours = (s: number) => {
  const h = Math.floor(s / 3600);
  const m = Math.round((s % 3600) / 60);
  return h ? `${h}h${String(m).padStart(2, "0")}` : `${m}min`;
};
const totalOf = (p: VolumePoint) => ALL_SPORTS.reduce((a, s) => a + p.secs[s], 0);

/** Múltiplo de 4 h, para o eixo ter divisões inteiras. */
const niceMax = (seconds: number) => Math.max(4, Math.ceil(seconds / 3600 / 4) * 4);

const monthShort = (iso: string) =>
  new Intl.DateTimeFormat(siteConfig.locale, { month: "short", timeZone: "UTC" }).format(new Date(iso)).replace(".", "");

export function VolumeChart({ weekly, monthly }: { weekly: VolumePoint[] | null; monthly: VolumePoint[] }) {
  const [wanted, setWanted] = useState<Mode>("weekly");
  const [active, setActive] = useState<number | null>(null);
  // sem semanas (período "todos"): só mensal
  const mode: Mode = weekly ? wanted : "monthly";
  const points = mode === "weekly" && weekly ? weekly : monthly;
  const sel = active !== null && active < points.length ? points[active] : null;

  const maxHours = useMemo(() => niceMax(Math.max(...points.map(totalOf), 0)), [points]);
  const grid = [1, 0.75, 0.5, 0.25, 0].map((f) => maxHours * f);
  const many = points.length > 24; // semanas, ou meses de vários anos

  const label = (p: VolumePoint, i: number): string => {
    if (mode === "monthly") {
      if (monthly.length > 12) return p.key.endsWith("-01") ? p.key.slice(0, 4) : "";
      return monthShort(p.key + "-01T00:00:00Z");
    }
    // semana pertence ao mês da sua quinta-feira (como na ISO 8601); rótulo só quando o mês muda
    const mid = (key: string) => new Date(new Date(key + "T00:00:00Z").getTime() + 3 * 86_400_000);
    const d = mid(p.key);
    if (i > 0 && mid(points[i - 1].key).getUTCMonth() === d.getUTCMonth()) return "";
    return monthShort(d.toISOString());
  };

  const title = (p: VolumePoint | null): string => {
    if (!p) return "Total no período";
    if (mode === "weekly") {
      return (
        "Semana de " +
        new Intl.DateTimeFormat(siteConfig.locale, { day: "2-digit", month: "short", timeZone: "UTC" })
          .format(new Date(p.key + "T00:00:00Z"))
          .replace(".", "")
      );
    }
    return new Intl.DateTimeFormat(siteConfig.locale, { month: "long", year: "numeric", timeZone: "UTC" }).format(
      new Date(p.key + "-01T00:00:00Z"),
    );
  };

  const secsBySport = (s: SportKey) => (sel ? sel.secs[s] : points.reduce((a, q) => a + q.secs[s], 0));
  const total = sel ? totalOf(sel) : points.reduce((a, q) => a + totalOf(q), 0);

  return (
    <div className="card p-5 sm:p-8">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="label">{title(sel)}</p>
          <p className="num mt-2 text-5xl sm:text-6xl">{fmtHours(total)}</p>
          <div className="mt-3 flex min-h-5 flex-wrap gap-x-5 gap-y-1 text-sm">
            {[...STACK_ORDER].reverse().map((s) => (
              <span key={s} className="inline-flex items-center gap-2 text-muted">
                <span className="size-2.5 rounded-full" style={{ background: `var(--${s})` }} />
                {siteConfig.sports[s].label} <span className="text-fg">{fmtHours(secsBySport(s))}</span>
              </span>
            ))}
          </div>
        </div>

        <div role="tablist" aria-label="Agrupamento" className="label flex rounded-full border border-line p-1">
          {(["weekly", "monthly"] as Mode[]).map((m) => (
            <button
              key={m}
              role="tab"
              aria-selected={mode === m}
              disabled={m === "weekly" && !weekly}
              onClick={() => {
                setWanted(m);
                setActive(null);
              }}
              className={`rounded-full px-4 py-1.5 transition-colors disabled:opacity-30 ${
                mode === m ? "bg-fg text-bg" : "hover:text-fg"
              }`}
            >
              {m === "weekly" ? "Semanal" : "Mensal"}
            </button>
          ))}
        </div>
      </div>

      <div className="relative mt-8 h-64 sm:h-80" onMouseLeave={() => setActive(null)}>
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
          key={`${mode}-${points.length}`}
          className={`absolute inset-y-0 right-0 left-11 flex items-stretch ${many ? "gap-[2px]" : "gap-2"}`}
        >
          {points.map((p, i) => {
            const t = totalOf(p);
            return (
              <button
                key={p.key}
                type="button"
                aria-label={`${title(p)}: ${fmtHours(t)}`}
                onMouseEnter={() => setActive(i)}
                onFocus={() => setActive(i)}
                onClick={() => setActive(i)}
                className="group relative flex flex-1 flex-col justify-end outline-none"
              >
                <div
                  className="flex flex-col-reverse overflow-hidden rounded-t-[3px] transition-opacity"
                  style={{
                    height: `${(t / 3600 / maxHours) * 100}%`,
                    opacity: active === null || active === i ? 1 : 0.35,
                  }}
                >
                  {STACK_ORDER.map((s) =>
                    p.secs[s] > 0 ? (
                      <div
                        key={s}
                        className="bar-seg"
                        style={{
                          flex: `${p.secs[s]} 1 0%`,
                          background: `var(--${s})`,
                          animationDelay: `${i * (many ? Math.min(14, 900 / points.length) : 60)}ms`,
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
