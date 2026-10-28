"use client";

import { useMemo, useRef, useState } from "react";
import type { SportKey } from "@/site.config";
import { useI18n } from "@/lib/i18n";
import type { Profile } from "@/lib/lab/profile";
import type { LabData } from "@/lib/lab/types";
import { workoutFacts, workoutFindings, type Finding, type WorkoutFacts } from "@/lib/lab/workout";
import type { Activity } from "@/lib/strava/types";
import { usePlanSession } from "@/lib/use-plan-session";
import { Hint, Panel, Pills } from "./LabBits";
import { RpePicker } from "./RpePicker";
import { METHOD_LABEL } from "./SessionsRpe";

const TONE_COLOR = { good: "var(--brand)", warn: "var(--goal)", info: "var(--muted)" } as const;
const SPORT_LABEL: Record<SportKey, string> = { run: "Run", ride: "Bike", swim: "Swim", strength: "Strength", other: "Other" };
const LEVEL_COLOR: Record<WorkoutFacts["intensity"], string> = {
  recovery: "#2bd4ff",
  easy: "var(--brand)",
  moderate: "#c6f432",
  hard: "#ffb020",
  "very hard": "var(--goal)",
};

export function WorkoutTab({ activities, profile, lab, labels }: { activities: Activity[]; profile: Profile; lab: LabData; labels: Record<number, string> }) {
  const { t, fmt, lang } = useI18n();
  const session = usePlanSession();
  const [sport, setSport] = useState<SportKey | "all">("all");
  const [pick, setPick] = useState<number | null>(null);
  const detail = useRef<HTMLDivElement>(null);
  const choose = (id: number) => {
    setPick(id);
    // on a phone the detail sits below the list: bring it into view
    if (typeof window !== "undefined" && window.innerWidth < 1024) setTimeout(() => detail.current?.scrollIntoView({ behavior: "smooth", block: "start" }), 60);
  };

  const list = useMemo(() => activities.filter((a) => sport === "all" || a.sport === sport).slice(0, 80), [activities, sport]);
  const selected = list.find((a) => a.id === pick) ?? list[0] ?? null;
  const facts = useMemo(() => (selected ? workoutFacts(selected, activities, profile) : null), [selected, activities, profile]);
  const findings = useMemo(() => (facts ? workoutFindings(facts) : []), [facts]);
  const ai = selected ? lab.analyses[selected.id] : undefined;

  const sports = (["all", "swim", "ride", "run", "strength"] as const).map((k) => ({ value: k, label: k === "all" ? t("All") : t(SPORT_LABEL[k]) }));

  return (
    <div className="lab-enter space-y-6">
      <div className="grid gap-6 lg:grid-cols-[22rem_1fr]">
        <div className="card min-w-0 self-start p-3.5 sm:p-5">
          <Pills value={sport} onChange={(v) => { setSport(v); setPick(null); }} options={sports} />
          <ul className="mt-4 max-h-72 space-y-1 overflow-y-auto pr-1 lg:max-h-[44rem]">
            {list.map((a) => {
              const active = selected?.id === a.id;
              return (
                <li key={a.id}>
                  <button
                    onClick={() => choose(a.id)}
                    aria-pressed={active}
                    className={`flex w-full items-center gap-3 rounded-lg px-2.5 py-2 text-left transition-colors ${active ? "bg-soft" : "hover:bg-soft"}`}
                  >
                    <span className="size-2.5 shrink-0 rounded-full" style={{ background: `var(--${a.sport})` }} />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm">{a.name}</span>
                      {labels[a.id] && <span className="block truncate text-xs text-brand">{labels[a.id]}</span>}
                      <span className="label block">
                        {fmt.dateLabel(a.date, { day: "2-digit", month: "short", year: "2-digit" })} · {fmt.duration(a.movingTime)}
                        {a.distance > 0 ? ` · ${fmt.km(a.distance, 1)} km` : ""}
                      </span>
                    </span>
                    {lab.analyses[a.id] && <span className="label text-brand" title={t("AI analysis")}>AI</span>}
                  </button>
                </li>
              );
            })}
            {list.length === 0 && <li className="text-muted">{t("No activities yet.")}</li>}
          </ul>
        </div>

        {selected && facts ? (
          <div ref={detail} className="min-w-0 scroll-mt-36 space-y-6">
            <Panel
              title={selected.name}
              subtitle={`${t(SPORT_LABEL[selected.sport])} · ${fmt.dateLabel(selected.date, { day: "2-digit", month: "long", year: "numeric" })} · ${fmt.timeOfDay(selected.date)}${selected.indoor ? ` · ${t("indoor")}` : ""}${selected.race ? ` · ${t("race")}` : ""}`}
              aside={
                <span className="text-right">
                  {labels[selected.id] && <span className="num block text-2xl text-brand">{labels[selected.id]}</span>}
                  <span className="num block text-xl uppercase" style={{ color: LEVEL_COLOR[facts.intensity] }}>{t(facts.intensity)}</span>
                </span>
              }
            >
              <dl className="grid grid-cols-2 gap-x-6 gap-y-4 sm:grid-cols-3">
                <Metric label={t("Distance")} value={selected.distance > 0 ? `${fmt.km(selected.distance, 2)} km` : "—"} />
                <Metric label={t("Moving time")} value={fmt.duration(selected.movingTime)} sub={facts.stoppedShare >= 0.1 ? t("{n} stopped", { n: fmt.duration(selected.elapsedTime - selected.movingTime) }) : undefined} />
                <Metric
                  label={selected.sport === "ride" ? t("Speed") : t("Pace")}
                  value={(() => {
                    const p = fmt.pace(selected.sport, selected.distance / Math.max(1, selected.movingTime));
                    return p.value === "—" ? "—" : `${p.value} ${p.unit}`;
                  })()}
                />
                <Metric label={t("Heart rate")} value={facts.hr ? `${Math.round(facts.hr)} bpm` : "—"} sub={facts.hrPctLthr ? t("{pct}% of LTHR", { pct: Math.round(facts.hrPctLthr) }) : undefined} />
                <Metric label={t("Power")} value={facts.watts ? `${facts.watts} W` : "—"} sub={facts.np ? t("NP {w} W", { w: facts.np }) : undefined} />
                <Metric
                  label={t("Training load")}
                  value={fmt.int(facts.load)}
                  sub={`${t(METHOD_LABEL[facts.loadMethod])}${facts.loadPercentile !== null ? ` · ${t("heavier than {pct}% of recent sessions", { pct: Math.round(facts.loadPercentile * 100) })}` : ""}`}
                />
                {facts.cadence ? <Metric label={t("Cadence")} value={`${Math.round(selected.sport === "run" ? facts.cadence * 2 : facts.cadence)} ${selected.sport === "run" ? "spm" : "rpm"}`} /> : null}
                {selected.elevation > 0 ? <Metric label={t("Climb")} value={`${fmt.int(selected.elevation)} m`} /> : null}
                {facts.ef ? <Metric label={t("Efficiency factor")} value={fmt.num(facts.ef, 2)} sub={t("power per heartbeat")} /> : null}
              </dl>
            </Panel>

            {session.unlocked && (
              <Panel title={t("How hard did it feel?")} subtitle={t("Session RPE, 1 = very easy, 10 = all out.")}>
                <RpePicker key={selected.id} activityId={selected.id} value={selected.rpe} editable />
              </Panel>
            )}

            <Panel title={t("Reading")} subtitle={t("Rule-based reading from sports-science rules of thumb, using your thresholds and your last 120 days.")}>
              <ul className="space-y-3">
                {findings.map((f) => (
                  <li key={f.id} className="flex gap-3">
                    <span className="mt-2 size-2.5 shrink-0 rounded-full" style={{ background: TONE_COLOR[f.tone] }} />
                    <span>{say(f, t)}</span>
                  </li>
                ))}
              </ul>
            </Panel>

            <Panel title={t("AI analysis")} subtitle={t("Written once by Claude when the workout arrives, from the numbers above.")}>
              {ai ? (
                <>
                  <div className="space-y-3 whitespace-pre-line leading-relaxed">{lang === "pt" ? ai.pt : ai.en}</div>
                  <p className="label mt-4">
                    {ai.model ? `${ai.model} · ` : ""}
                    {new Intl.DateTimeFormat(lang === "pt" ? "pt-BR" : "en-US", { dateStyle: "medium" }).format(new Date(ai.createdAt))}
                  </p>
                </>
              ) : (
                <Hint>{t("No AI analysis for this workout yet. New workouts are analyzed automatically once an Anthropic API key is set on the server.")}</Hint>
              )}
            </Panel>
          </div>
        ) : (
          <Hint>{t("No activities yet.")}</Hint>
        )}
      </div>
    </div>
  );
}

function Metric({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div>
      <dt className="label">{label}</dt>
      <dd className="num mt-1 text-3xl">{value}</dd>
      {sub && <p className="label mt-0.5">{sub}</p>}
    </div>
  );
}

/** Translates a finding and its translatable variables (the intensity level). */
function say(f: Finding, t: (k: string, v?: Record<string, string | number>) => string): string {
  const vars: Record<string, string | number> = { ...f.vars };
  if (typeof vars.level === "string") vars.level = t(vars.level);
  if (typeof vars.leg === "string") vars.leg = t(vars.leg);
  return t(f.text, vars);
}
