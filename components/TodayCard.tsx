"use client";

import { useEffect, useState } from "react";
import { useI18n } from "@/lib/i18n";
import { ACTION, type Checkin, type Reason, type Signal } from "@/lib/checkin";
import { SPORT_LABEL } from "@/lib/lab/plan";
import type { PlanSlot } from "@/lib/lab/types";
import { usePlanSession } from "@/lib/use-plan-session";
import { ContextReasons } from "./ContextReasons";
import type { CtxReason } from "@/lib/context-signal";

export const SIGNAL_COLOR: Record<Signal, string> = { green: "#1fe08a", yellow: "#ffb020", red: "#ff4d4d" };

interface Today {
  day: string;
  checkin: Checkin | null;
  signal: Signal | null;
  reasons: Reason[];
  ctxReasons: CtxReason[];
  medical: boolean;
  openEvents: number;
  due: number;
  rest: boolean;
  sessions: PlanSlot[];
  key: PlanSlot | null;
}

/** A reason of the signal in the page language (pain spots are translated too). */
export function useReasonText() {
  const { t } = useI18n();
  return (r: Reason) => t(r.text, r.vars?.spot ? { ...r.vars, spot: t(String(r.vars.spot)) } : r.vars);
}

/**
 * Today's readiness: the signal, its reasons in plain words, what to do and today's key session from the planner.
 * Health data is personal, so the card exists only on a device where the planner is unlocked, and the data is fetched
 * here, never written into the public page.
 */
export function TodayCard({ className = "" }: { className?: string }) {
  const { t, fmt } = useI18n();
  const session = usePlanSession();
  const [data, setData] = useState<Today | null>(null);
  const reasonText = useReasonText();

  useEffect(() => {
    if (!session.unlocked) return;
    let alive = true;
    fetch("/api/today", { cache: "no-store" })
      .then((r) => (r.ok ? (r.json() as Promise<Today>) : null))
      .then((d) => alive && setData(d))
      .catch(() => undefined);
    const again = () => fetch("/api/today", { cache: "no-store" }).then((r) => (r.ok ? r.json() : null)).then((d) => alive && d && setData(d as Today));
    window.addEventListener("checkin-saved", again);
    return () => {
      alive = false;
      window.removeEventListener("checkin-saved", again);
    };
  }, [session.unlocked]);

  if (!session.unlocked || !data) return null;
  const color = data.signal ? SIGNAL_COLOR[data.signal] : "var(--line)";

  return (
    <section className={`card lab-card fade-up p-4 sm:p-6 ${className}`} style={{ borderLeft: `4px solid ${color}` }} aria-label={t("Today")}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="label">{t("Today")} · {fmt.dateLabel(`${data.day}T00:00:00`, { weekday: "long", day: "2-digit", month: "short" })}</p>
          {data.signal ? (
            <p className="num signal-pop mt-1 inline-block text-3xl uppercase sm:text-4xl" style={{ color }}>
              {t(data.signal === "green" ? "Green" : data.signal === "yellow" ? "Yellow" : "Red")}
            </p>
          ) : (
            <p className="mt-1 text-muted">{t("No check-in yet today.")}</p>
          )}
        </div>
        <div className="flex flex-wrap gap-2">
          <a href="/lab#log" className="label rounded-full border border-line px-4 py-2.5 transition-colors hover:border-fg hover:text-fg">+ {t("Note")}</a>
          <a href="/lab#checkin" className="label rounded-full border border-line px-4 py-2.5 transition-colors hover:border-fg hover:text-fg">
            {data.checkin ? t("Edit check-in") : t("Check in")}
            {data.due > 0 ? ` · ${t("{n} questions", { n: data.due })}` : ""} →
          </a>
        </div>
      </div>

      {data.signal && (
        <>
          {data.openEvents > 0 && <ContextReasons reasons={data.ctxReasons} medical={data.medical} className="mt-2" />}
          <p className="mt-3 font-medium">{t(ACTION[data.signal])}</p>
          {data.reasons.length > 0 && (
            <ul className="mt-2 space-y-1 text-sm text-muted">
              {data.reasons.map((r, i) => (
                <li key={i} className="flex gap-2">
                  <span style={{ color: r.level === "red" ? SIGNAL_COLOR.red : SIGNAL_COLOR.yellow }}>●</span>
                  {reasonText(r)}
                </li>
              ))}
            </ul>
          )}
        </>
      )}

      <div className="mt-4 border-t border-line pt-3">
        <p className="label">{t("Key session today")}</p>
        {data.rest ? (
          <p className="mt-1">{t("Rest day")}</p>
        ) : data.key ? (
          <p className="mt-1">
            <span className="font-medium">{t(SPORT_LABEL[data.key.sport])}</span>
            {data.key.description ? ` · ${data.key.description}` : ""}
            {data.key.minutes ? <span className="text-muted"> · {Math.floor(data.key.minutes / 60)}:{String(data.key.minutes % 60).padStart(2, "0")} h</span> : null}
            {data.key.km ? <span className="text-muted"> · {fmt.num(data.key.km, 1)} km</span> : null}
          </p>
        ) : (
          <p className="mt-1 text-muted">{t("Nothing planned for today in the planner.")}</p>
        )}
        {data.sessions.length > 1 && <p className="label mt-1">{t("{n} sessions planned", { n: data.sessions.length })}</p>}
      </div>
    </section>
  );
}
