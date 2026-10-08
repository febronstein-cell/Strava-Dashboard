"use client";

import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { siteConfig } from "@/site.config";
import type { Activity } from "@/lib/strava/types";
import { dateLabel, duration, int, km, meters, pace, timeOfDay } from "@/lib/format";
import { SportIcon } from "./SportIcon";

const Ctx = createContext<(a: Activity) => void>(() => {});
/** Abre o painel de detalhes de uma atividade. */
export const useActivityDialog = () => useContext(Ctx);

export function ActivityDialogProvider({ children, isDemo }: { children: ReactNode; isDemo: boolean }) {
  const [activity, setActivity] = useState<Activity | null>(null);
  const ref = useRef<HTMLDialogElement>(null);

  const open = useCallback((a: Activity) => setActivity(a), []);

  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (activity && !d.open) d.showModal();
    if (!activity && d.open) d.close();
  }, [activity]);

  const a = activity;
  const cfg = a ? siteConfig.sports[a.sport] : null;
  const p = a ? pace(a.sport, a.distance / a.movingTime) : null;

  return (
    <Ctx.Provider value={open}>
      {children}
      <dialog
        ref={ref}
        onClose={() => setActivity(null)}
        onClick={(e) => {
          if (e.target === ref.current) setActivity(null); // clique no fundo
        }}
        className="m-auto w-[min(32rem,calc(100vw-2rem))] rounded-3xl border border-line bg-elev p-0 text-fg backdrop:bg-black/60 backdrop:backdrop-blur-sm"
      >
        {a && cfg && p && (
          <div className="p-6 sm:p-8">
            <div className="flex items-start justify-between gap-4">
              <div className="flex items-center gap-3" style={{ color: `var(--${a.sport})` }}>
                <SportIcon sport={a.sport} className="size-7" />
                <span className="label" style={{ color: "inherit" }}>
                  {cfg.label}
                  {a.race ? " · Competição" : ""}
                </span>
              </div>
              <button
                onClick={() => setActivity(null)}
                aria-label="Fechar"
                className="label -mt-1 -mr-2 rounded-full px-3 py-2 transition-colors hover:text-fg"
              >
                Fechar ✕
              </button>
            </div>

            <h3 className="num mt-5 text-4xl uppercase sm:text-5xl">{a.name}</h3>
            <p className="mt-2 text-muted">
              {dateLabel(a.date, { weekday: "long", day: "2-digit", month: "long", year: "numeric" })} · {timeOfDay(a.date)}
            </p>

            <dl className="mt-8 grid grid-cols-2 gap-x-4 gap-y-6">
              {a.distance > 0 && (
                <Stat
                  label="Distância"
                  value={a.sport === "swim" ? meters(a.distance) : km(a.distance, 2)}
                  unit={a.sport === "swim" ? "m" : "km"}
                  color={`var(--${a.sport})`}
                />
              )}
              <Stat label="Tempo" value={duration(a.movingTime)} />
              {p.value !== "—" && <Stat label={cfg.unitLabel} value={p.value} unit={p.unit} />}
              {a.elevation > 0 && <Stat label="Elevação" value={int(a.elevation)} unit="m" />}
            </dl>

            {!isDemo && (
              <a
                href={`https://www.strava.com/activities/${a.id}`}
                target="_blank"
                rel="noreferrer"
                className="label mt-8 inline-flex items-center gap-2 rounded-full border border-line px-4 py-2.5 transition-colors hover:text-fg"
              >
                Ver no Strava ↗
              </a>
            )}
          </div>
        )}
      </dialog>
    </Ctx.Provider>
  );
}

function Stat({ label, value, unit, color }: { label: string; value: string; unit?: string; color?: string }) {
  return (
    <div>
      <dt className="label">{label}</dt>
      <dd className="mt-1.5 flex items-baseline gap-1.5">
        <span className="num text-4xl" style={color ? { color } : undefined}>
          {value}
        </span>
        {unit && <span className="text-sm text-muted">{unit}</span>}
      </dd>
    </div>
  );
}
