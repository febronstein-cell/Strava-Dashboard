"use client";

import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { siteConfig } from "@/site.config";
import type { Activity } from "@/lib/strava/types";
import { useI18n } from "@/lib/i18n";
import { SportIcon } from "./SportIcon";

const Ctx = createContext<(a: Activity) => void>(() => {});
/** Opens the detail panel of an activity. */
export const useActivityDialog = () => useContext(Ctx);

export function ActivityDialogProvider({ children, isDemo }: { children: ReactNode; isDemo: boolean }) {
  const { t, fmt } = useI18n();
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
  // Single-activity view: everything is based on MOVING time
  const p = a ? fmt.pace(a.sport, a.distance / a.movingTime) : null;
  const cadence = a?.cad ? (a.sport === "run" ? { v: a.cad * 2, u: "spm" } : { v: a.cad, u: "rpm" }) : null;

  return (
    <Ctx.Provider value={open}>
      {children}
      <dialog
        ref={ref}
        onClose={() => setActivity(null)}
        onClick={(e) => {
          if (e.target === ref.current) setActivity(null); // click on the backdrop
        }}
        className="m-auto w-[min(34rem,calc(100vw-2rem))] rounded-3xl border border-line bg-elev p-0 text-fg backdrop:bg-black/60 backdrop:backdrop-blur-sm"
      >
        {a && cfg && p && (
          <div className="p-6 sm:p-8">
            <div className="flex items-start justify-between gap-4">
              <div className="flex items-center gap-3" style={{ color: `var(--${a.sport})` }}>
                <SportIcon sport={a.sport} className="size-7" />
                <span className="label" style={{ color: "inherit" }}>
                  {t(cfg.label)}
                  {a.race ? ` · ${t("Race")}` : ""}
                  {a.indoor && a.sport !== "strength" ? ` · ${t("Indoor")}` : ""}
                </span>
              </div>
              <button
                onClick={() => setActivity(null)}
                aria-label={t("Close")}
                className="label -mt-1 -mr-2 rounded-full px-3 py-2 transition-colors hover:text-fg"
              >
                {t("Close")} ✕
              </button>
            </div>

            <h3 className="num mt-5 text-4xl uppercase sm:text-5xl">{a.name}</h3>
            <p className="mt-2 text-muted">
              {fmt.dateLabel(a.date, { weekday: "long", day: "2-digit", month: "long", year: "numeric" })} ·{" "}
              {fmt.timeOfDay(a.date)}
            </p>

            <dl className="mt-8 grid grid-cols-2 gap-x-4 gap-y-6">
              {a.distance > 0 && (
                <Stat
                  label={t("Distance")}
                  value={a.sport === "swim" ? fmt.meters(a.distance) : fmt.km(a.distance, 2)}
                  unit={a.sport === "swim" ? "m" : "km"}
                  color={`var(--${a.sport})`}
                />
              )}
              <Stat label={t("Moving time")} value={fmt.duration(a.movingTime)} />
              {p.value !== "—" && <Stat label={cfg.unitLabel === "speed" ? t("Speed") : t("Pace")} value={p.value} unit={p.unit} />}
              {a.elevation > 0 && <Stat label={t("Elevation")} value={fmt.int(a.elevation)} unit="m" />}
              {a.hr && (
                <Stat
                  label={t("Avg heart rate")}
                  value={String(a.hr)}
                  unit={a.hrMax ? `bpm · ${t("max")} ${a.hrMax}` : "bpm"}
                />
              )}
              {cadence && <Stat label={t("Avg cadence")} value={fmt.int(cadence.v)} unit={cadence.u} />}
              {a.watts && (
                <Stat
                  label={t("Avg power")}
                  value={fmt.int(a.watts)}
                  unit={a.deviceWatts ? "W" : `W · ${t("estimated")}`}
                />
              )}
            </dl>

            {!isDemo && (
              <a
                href={`https://www.strava.com/activities/${a.id}`}
                target="_blank"
                rel="noreferrer"
                className="label mt-8 inline-flex items-center gap-2 rounded-full border border-line px-4 py-2.5 transition-colors hover:text-fg"
              >
                {t("View on Strava")} ↗
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
      <dd className="mt-1.5 flex flex-wrap items-baseline gap-x-1.5">
        <span className="num text-4xl" style={color ? { color } : undefined}>
          {value}
        </span>
        {unit && <span className="text-sm text-muted">{unit}</span>}
      </dd>
    </div>
  );
}
