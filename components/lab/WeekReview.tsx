"use client";

import { useEffect, useMemo, useState } from "react";
import { useI18n } from "@/lib/i18n";
import { matchWeek, weekCompliance } from "@/lib/compliance";
import { DAY_NAMES, SPORT_LABEL } from "@/lib/lab/plan";
import type { PlanDay } from "@/lib/lab/types";
import { lostSessions, reviewWeek, type ReviewSession } from "@/lib/session-status";
import type { Activity } from "@/lib/strava/types";
import { Chip, EntryRow, STATE_COLOR, STATE_LABEL, StatePill, hm, type Actuals } from "./PlanVsDone";
import { SPORT_COLOR } from "./SlotEditor";

const HOURS = (min: number) => `${Math.floor(min / 60)}:${String(Math.round(min % 60)).padStart(2, "0")}`;

/**
 * The week against what happened, organised in four layers so it is never a wall of text: (1) one summary band,
 * (2) planned against done per sport, (3) the lost sessions with their reason, (4) the days, each folded until
 * opened. Matching to the plan is automatic (date, sport, order); a wrong match is fixed under "Adjust" of a session.
 * A missed easy session is only shown as lost: there is no suggestion to make it up.
 */
export function WeekReview({ weekStart, days, activities, todayKey, editable }: { weekStart: string; days: PlanDay[]; activities: Activity[]; todayKey: string; editable: boolean }) {
  const { t, fmt } = useI18n();
  const [actuals, setActuals] = useState<Actuals | null>(null);
  const [reload, setReload] = useState(0);
  const [openDays, setOpenDays] = useState<Set<number> | null>(null);

  useEffect(() => {
    if (!editable) return;
    let alive = true;
    fetch(`/api/plan/actuals?week=${weekStart}`, { cache: "no-store" })
      .then((r) => (r.ok ? (r.json() as Promise<Actuals>) : null))
      .then((d) => alive && d && setActuals(d))
      .catch(() => undefined);
    return () => {
      alive = false;
    };
  }, [weekStart, editable, reload]);

  const matched = useMemo(() => matchWeek(days, weekStart, activities, actuals?.overrides ?? {}), [days, weekStart, activities, actuals?.overrides]);
  const review = useMemo(() => reviewWeek(matched, actuals?.statuses ?? {}, weekStart, todayKey), [matched, actuals?.statuses, weekStart, todayKey]);
  const week = useMemo(() => weekCompliance(matched, todayKey), [matched, todayKey]);
  const lost = useMemo(() => lostSessions(review.sessions), [review.sessions]);
  const s = review.summary;

  const rematch = async (activityId: number, value: string) => {
    const body = value === "auto" ? { activityId, clear: true } : value === "none" ? { activityId, weekStart, slot: null } : { activityId, weekStart, day: Number(value.split(":")[0]), slot: Number(value.split(":")[1]) };
    await fetch("/api/plan/match", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    setReload((n) => n + 1);
  };
  const options = matched.flatMap((d) => d.entries.map((e) => ({ value: `${e.day}:${e.slot}`, label: `${t(DAY_NAMES[e.day]).slice(0, 3)} · ${t(SPORT_LABEL[e.entry.sport])}${e.entry.description ? ` · ${e.entry.description.slice(0, 24)}` : ""}` })));

  if (s.planned === 0 && review.unplanned.length === 0) return <p className="rounded-2xl border border-dashed border-line p-6 text-sm text-muted">{t("Nothing to review yet: plan some sessions first.")}</p>;

  const scoreColor = s.score == null ? "var(--muted)" : s.score >= 80 ? STATE_COLOR.done : s.score >= 50 ? STATE_COLOR.partial : STATE_COLOR.skipped;
  const sports = Object.entries(week.bySport).filter(([, x]) => x.plannedH > 0 || x.doneH > 0);
  // the day to show open at first: the first one with a lost session, else the most recent one that is due
  const dueDays = review.sessions.filter((x) => x.state !== "pending").map((x) => x.day);
  const firstOpen = lost[0]?.day ?? (dueDays.length ? Math.max(...dueDays) : 0);
  const openSet = openDays ?? new Set([firstOpen]);
  const toggle = (d: number) => setOpenDays((cur) => { const n = new Set(cur ?? [firstOpen]); if (n.has(d)) n.delete(d); else n.add(d); return n; });

  return (
    <div className="fade-up space-y-5">
      {/* 1. the summary band */}
      <section className="grid gap-3 rounded-2xl border border-line p-4 sm:grid-cols-[auto_1fr] sm:gap-6 sm:p-5">
        <div className="flex items-baseline gap-2 sm:block">
          <p className="num text-5xl leading-none" style={{ color: scoreColor }}>{s.score == null ? "-" : `${s.score}%`}</p>
          <p className="label">{t("of the plan done so far")}</p>
        </div>
        <dl className="grid grid-cols-2 gap-x-6 gap-y-3 sm:grid-cols-4">
          <Stat label={t("Sessions")} value={`${s.done + s.changed + s.partial} / ${s.planned - s.pending}`} sub={t("{n} ahead", { n: s.pending })} />
          <Stat label={t("Lost volume")} value={`${HOURS(s.lostMin)} h`} sub={s.lostMin ? t("of {h} planned", { h: HOURS(s.plannedMin) }) : t("nothing lost")} />
          <Stat label={t("Key sessions")} value={`${s.keyDone} / ${s.keyPlanned}`} sub={s.keyLostMin ? t("{h} h lost in them", { h: HOURS(s.keyLostMin) }) : undefined} />
          <Stat label={t("Unplanned")} value={String(review.unplanned.length)} sub={review.unplanned.some((u) => u.rest) ? t("{n} on rest days", { n: review.unplanned.filter((u) => u.rest).length }) : undefined} />
        </dl>
      </section>

      {/* 2. planned against done, per sport */}
      <section>
        <p className="label mb-2">{t("Planned against done")}</p>
        <ul className="space-y-2.5">
          {sports.map(([sport, x]) => (
            <li key={sport} className="grid grid-cols-[4.5rem_1fr_auto] items-center gap-3 text-sm">
              <span className="label" style={{ color: SPORT_COLOR[sport as keyof typeof SPORT_COLOR] }}>{t(SPORT_LABEL[sport as keyof typeof SPORT_LABEL])}</span>
              <span className="relative h-2.5 overflow-hidden rounded-full bg-line/70" role="img" aria-label={`${fmt.num(x.doneH, 1)} / ${fmt.num(x.plannedH, 1)} h`}>
                <span className="grow-x absolute inset-y-0 left-0 rounded-full" style={{ width: `${x.plannedH ? Math.min(100, (x.doneH / x.plannedH) * 100) : 100}%`, background: SPORT_COLOR[sport as keyof typeof SPORT_COLOR] }} />
              </span>
              <span className="num text-right">{fmt.num(x.doneH, 1)} / {fmt.num(x.plannedH, 1)} h{x.plannedKm > 0 || x.doneKm > 0 ? <span className="label ml-2 normal-case">{fmt.num(x.doneKm, 0)} / {fmt.num(x.plannedKm, 0)} km</span> : null}</span>
            </li>
          ))}
        </ul>
      </section>

      {/* 3. the lost sessions, with the reason */}
      {lost.length > 0 && (
        <section className="rounded-2xl border border-line p-4">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <p className="label">{t("Lost sessions")}</p>
            <p className="label normal-case">
              {t("{h} h lost", { h: HOURS(s.lostMin) })}
              {s.keyLostSessions > 0 ? ` · ${t("{n} key sessions, {h} h", { n: s.keyLostSessions, h: HOURS(s.keyLostMin) })}` : ""}
            </p>
          </div>
          <ul className="mt-3 divide-y divide-line/60">
            {lost.map((x) => (
              <LostRow key={x.ref} x={x} />
            ))}
          </ul>
        </section>
      )}

      {/* 4. the days, folded */}
      <section>
        <p className="label mb-2">{t("Day by day")}</p>
        <ul className="space-y-2">
          {matched
            .filter((d) => d.entries.length > 0 || d.unplanned.length > 0)
            .map((d) => {
              const rows = review.sessions.filter((x) => x.day === d.day);
              const isOpen = openSet.has(d.day);
              const doubles = new Map<string, number>();
              return (
                <li key={d.day} className="rounded-2xl border border-line">
                  <button onClick={() => toggle(d.day)} aria-expanded={isOpen} className="flex w-full flex-wrap items-center justify-between gap-2 px-4 py-3 text-left">
                    <span className="label">
                      {t(DAY_NAMES[d.day])} <span className="ml-1 opacity-60">{d.date.slice(8)}</span>
                    </span>
                    <span className="flex flex-wrap items-center gap-1.5">
                      {rows.map((x) => (
                        <span key={x.ref} className="flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs" style={{ borderColor: STATE_COLOR[x.state], color: STATE_COLOR[x.state] }} title={t(STATE_LABEL[x.state])}>
                          <span className="size-1.5 rounded-full" style={{ background: SPORT_COLOR[x.entry.sport] }} />
                          {x.state === "done" ? "✓" : x.state === "skipped" ? "✕" : x.state === "pending" ? "·" : x.state === "changed" ? "↔" : `${x.percent ?? 0}%`}
                        </span>
                      ))}
                      {d.unplanned.map((a) => (
                        <span key={a.id} className="rounded-full border border-dashed border-line px-2 py-0.5 text-xs text-muted">+{t(SPORT_LABEL[a.sport as keyof typeof SPORT_LABEL] ?? a.sport).slice(0, 3)}</span>
                      ))}
                      <span className="label ml-1">{isOpen ? "−" : "+"}</span>
                    </span>
                  </button>
                  {isOpen && (
                    <div className="space-y-3 border-t border-line/60 px-3 pb-3 pt-3 sm:px-4">
                      {d.entries.map((e) => {
                        const n = (doubles.get(e.entry.sport) ?? 0) + 1;
                        doubles.set(e.entry.sport, n);
                        const r = rows.find((x) => x.slot === e.slot)!;
                        return <EntryRow key={e.slot} e={e} nth={n} review={r} actuals={actuals} editable={editable} options={options} weekStart={weekStart} onRematch={rematch} onStatusSaved={() => setReload((v) => v + 1)} />;
                      })}
                      {d.unplanned.map((a) => (
                        <div key={a.id} className="rounded-xl border border-dashed border-line p-3 text-sm">
                          <span className="label">{d.rest ? t("Unplanned on a rest day") : t("Unplanned")}</span>
                          <p className="mt-1">
                            <span style={{ color: SPORT_COLOR[a.sport as keyof typeof SPORT_COLOR] }}>{t(SPORT_LABEL[a.sport as keyof typeof SPORT_LABEL] ?? a.sport)}</span> · {a.name} · {hm(a.elapsedTime)}
                            {a.distance > 0 ? ` · ${(a.distance / 1000).toFixed(1)} km` : ""}
                          </p>
                        </div>
                      ))}
                    </div>
                  )}
                </li>
              );
            })}
        </ul>
        {actuals && actuals.pending.length > 0 && <p className="label mt-2">{t("Some laps are still being fetched from Strava: open the week again in a moment.")}</p>}
      </section>
    </div>
  );
}

function Stat({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div>
      <dt className="label">{label}</dt>
      <dd className="num mt-0.5 text-2xl leading-none">{value}</dd>
      {sub && <p className="label mt-1 normal-case">{sub}</p>}
    </div>
  );
}

function LostRow({ x }: { x: ReviewSession }) {
  const { t } = useI18n();
  return (
    <li className="flex flex-wrap items-center gap-x-3 gap-y-1 py-2.5 text-sm">
      <span className="label w-10">{t(DAY_NAMES[x.day]).slice(0, 3)}</span>
      <span className="flex min-w-0 flex-1 items-center gap-2">
        <span className="size-2 shrink-0 rounded-full" style={{ background: SPORT_COLOR[x.entry.sport] }} />
        <span className="truncate">{x.entry.name || x.entry.description || t(SPORT_LABEL[x.entry.sport])}</span>
        {x.key && <span className="shrink-0 rounded-full border border-current px-1.5 text-[10px]">{t("key")}</span>}
      </span>
      <StatePill s={x} />
      {x.reasonTag && <Chip color="var(--muted)">{x.reasonTag}</Chip>}
      <span className="num w-14 text-right">-{HOURS(x.lostMin)}</span>
    </li>
  );
}
