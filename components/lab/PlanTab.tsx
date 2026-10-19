"use client";

import { useMemo, useRef, useState, useSyncExternalStore } from "react";
import { siteConfig } from "@/site.config";
import { useI18n } from "@/lib/i18n";
import { weeklyHours } from "@/lib/lab/builds";
import { DAY_NAMES, emptyDays, fmtMinutes, isComplete, parseMinutes, planHash, totals } from "@/lib/lab/plan";
import { mondayOf } from "@/lib/lab/progress";
import { buildSeason, defaultPriority, type SeasonPhase, type SeasonRace, type SeasonWeek } from "@/lib/lab/season";
import type { LabData, PlanDay } from "@/lib/lab/types";
import type { Activity } from "@/lib/strava/types";
import { Hint, Panel } from "./LabBits";

const PHASE_COLOR: Record<SeasonPhase, string> = {
  base: "var(--swim)",
  build: "var(--ride)",
  peak: "var(--run)",
  taper: "#b06bff",
  race: "var(--goal)",
  recovery: "var(--muted)",
};
const KEY_STORAGE = "plan-key";
const subscribeKey = (cb: () => void) => {
  window.addEventListener("plan-key", cb);
  window.addEventListener("storage", cb);
  return () => {
    window.removeEventListener("plan-key", cb);
    window.removeEventListener("storage", cb);
  };
};
const readKey = () => {
  try {
    return localStorage.getItem(KEY_STORAGE) ?? "";
  } catch {
    return "";
  }
};
type Status = "idle" | "saving" | "saved" | "describing" | `error:${string}`;
interface Written {
  title?: string;
  en: string;
  pt: string;
  hash?: string;
}

const addDays = (key: string, n: number) => new Date(Date.parse(key + "T00:00:00Z") + n * 86_400_000).toISOString().slice(0, 10);

/**
 * The training planner (hidden part of the Lab). The whole year is laid out from the race calendar; the weeks are
 * filled in day by day (description, time, distance). When all 7 days of a week are filled, the week gets a written
 * description that knows where it sits in the cycle and what the race asks for. Saving needs the edit key.
 */
export function PlanTab({ activities, lab, todayKey }: { activities: Activity[]; lab: LabData; todayKey: string }) {
  const { t, fmt, lang } = useI18n();

  // ---- the season, from the race calendar and the real recent volume
  const races = useMemo<SeasonRace[]>(
    () => siteConfig.upcomingRaces.map((r) => ({ name: r.name, date: r.date, format: r.format, priority: r.priority ?? defaultPriority(r.format), cycleStart: r.cycleStart })),
    [],
  );
  const hours = useMemo(() => weeklyHours(activities), [activities]);
  const current = mondayOf(todayKey);
  const recent = useMemo(() => {
    let s = 0;
    for (let i = 1; i <= 6; i++) s += hours.get(addDays(current, -7 * i)) ?? 0;
    return s / 6;
  }, [hours, current]);
  const season = useMemo(() => buildSeason(races, todayKey, recent, 52), [races, todayKey, recent]);

  // ---- what is already filled in
  const [plan, setPlan] = useState<Record<string, PlanDay[]>>(() => Object.fromEntries(lab.plannedWeeks.filter((w) => w.days).map((w) => [w.weekStart, w.days as PlanDay[]])));
  const [written, setWritten] = useState<Record<string, Written>>(() =>
    Object.fromEntries(lab.plannedWeeks.filter((w) => w.description).map((w) => [w.weekStart, { title: w.title, ...(w.description as { en: string; pt: string; hash?: string }) }])),
  );
  const [status, setStatus] = useState<Record<string, Status>>({});
  const [open, setOpen] = useState<Set<string>>(() => new Set(season.slice(0, 2).map((w) => w.start)));
  const [showAll, setShowAll] = useState(false);

  // ---- the edit key (kept in this browser only)
  const key = useSyncExternalStore(subscribeKey, readKey, () => "");
  const saveKey = (v: string) => {
    try {
      localStorage.setItem(KEY_STORAGE, v);
    } catch {}
    window.dispatchEvent(new Event("plan-key"));
  };

  const timers = useRef<Record<string, ReturnType<typeof setTimeout>>>({});
  const set = (week: string, s: Status) => setStatus((p) => ({ ...p, [week]: s }));

  const call = async (path: string, body: unknown) => {
    const res = await fetch(path, { method: "POST", headers: { "Content-Type": "application/json", "x-plan-key": key }, body: JSON.stringify(body) });
    const json = (await res.json().catch(() => ({}))) as { error?: string };
    if (!res.ok) throw new Error(json.error ?? `Error ${res.status}`);
    return json;
  };

  /** Saves the week; when it is complete and its description is out of date, asks for a new one. */
  const persist = async (week: string, days: PlanDay[]) => {
    set(week, "saving");
    try {
      await call("/api/plan", { weekStart: week, days });
      if (isComplete(days) && written[week]?.hash !== planHash(days)) {
        set(week, "describing");
        const d = (await call("/api/plan/describe", { weekStart: week })) as unknown as Written;
        setWritten((p) => ({ ...p, [week]: d }));
      }
      set(week, "saved");
    } catch (e) {
      set(week, `error:${e instanceof Error ? e.message : "failed"}`);
    }
  };

  const edit = (week: string, day: number, patch: Partial<PlanDay>) => {
    const days = (plan[week] ?? emptyDays()).map((d) => (d.day === day ? { ...d, ...patch } : d));
    setPlan((p) => ({ ...p, [week]: days }));
    if (!key) return;
    clearTimeout(timers.current[week]);
    set(week, "idle");
    timers.current[week] = setTimeout(() => void persist(week, days), 1300);
  };

  const canEdit = key.length > 0;
  const shown = showAll ? season : season.slice(0, 12);

  return (
    <div className="lab-enter space-y-6">
      <Panel
        title={t("Training planner")}
        subtitle={t("The whole year, laid out from your race goals. Fill each week day by day; when the 7 days are filled, the week gets a written description that knows where it sits in the cycle.")}
        aside={
          <label className="label flex items-center gap-2">
            {t("Edit key")}
            <input
              type="password"
              value={key}
              onChange={(e) => saveKey(e.target.value)}
              placeholder={t("needed to save")}
              autoComplete="off"
              className="w-36 rounded-full border border-line bg-elev px-3 py-1.5 normal-case text-fg"
            />
          </label>
        }
      >
        {!canEdit && <Hint>{t("Read-only until you type the edit key. Only the key holder can save.")}</Hint>}
        <ul className="mt-3 flex flex-wrap gap-x-6 gap-y-2">
          {races
            .filter((r) => r.date >= current)
            .map((r) => (
              <li key={r.date} className="text-sm">
                <span className="num mr-2 text-xl" style={{ color: "var(--goal)" }}>{r.priority}</span>
                {r.name} <span className="label">{fmt.dateLabel(`${r.date}T00:00:00`, { day: "2-digit", month: "short", year: "numeric" })}</span>
              </li>
            ))}
        </ul>
        <p className="label mt-4">{t("Recent real volume: {h} h per week (last 6 weeks)", { h: fmt.num(recent, 1) })}</p>
      </Panel>

      {shown.map((w, i) => {
        const prev = shown[i - 1];
        const banner = w.race && w.race.date !== prev?.race?.date;
        return (
          <div key={w.start} className="space-y-3">
            {banner && w.race && (
              <p className="label pt-2" style={{ color: "var(--goal)" }}>
                {t("Building towards {race}", { race: w.race.name })} · {fmt.dateLabel(`${w.race.date}T00:00:00`, { day: "2-digit", month: "long", year: "numeric" })}
                {w.race.format ? ` · ${w.race.format}` : ""} · {t("priority {p}", { p: w.race.priority })}
              </p>
            )}
            <WeekCard
              w={w}
              days={plan[w.start] ?? emptyDays()}
              written={written[w.start]}
              status={status[w.start] ?? "idle"}
              isOpen={open.has(w.start)}
              toggle={() => setOpen((s) => { const n = new Set(s); if (n.has(w.start)) n.delete(w.start); else n.add(w.start); return n; })}
              onEdit={(day, patch) => edit(w.start, day, patch)}
              editable={canEdit}
              prevPlanned={totals(plan[addDays(w.start, -7)] ?? []).hours || null}
              lang={lang}
            />
          </div>
        );
      })}

      {!showAll && season.length > shown.length && (
        <button onClick={() => setShowAll(true)} className="label rounded-full border border-line px-5 py-3 transition-colors hover:text-fg">
          {t("Show the rest of the year ({n} more weeks)", { n: season.length - shown.length })}
        </button>
      )}
    </div>
  );
}

function WeekCard({
  w,
  days,
  written,
  status,
  isOpen,
  toggle,
  onEdit,
  editable,
  prevPlanned,
  lang,
}: {
  w: SeasonWeek;
  days: PlanDay[];
  written?: Written;
  status: Status;
  isOpen: boolean;
  toggle: () => void;
  onEdit: (day: number, patch: Partial<PlanDay>) => void;
  editable: boolean;
  prevPlanned: number | null;
  lang: "en" | "pt";
}) {
  const { t, fmt } = useI18n();
  const tot = totals(days);
  const done = isComplete(days);
  const vsTarget = tot.hours > 0 ? ((tot.hours - w.target) / w.target) * 100 : null;
  const vsPrev = prevPlanned && tot.hours > 0 ? ((tot.hours - prevPlanned) / prevPlanned) * 100 : null;
  const end = addDays(w.start, 6);
  const dateOf = (iso: string) => fmt.dateLabel(`${iso}T00:00:00`, { day: "2-digit", month: "short" });
  const position = w.cycle
    ? w.phase === "recovery"
      ? t("Recovery after the race")
      : w.raceWeek
        ? t("Race week")
        : t("Week {a} of {b} · {n} weeks to the race", { a: w.cycle.week, b: w.cycle.length, n: w.cycle.weeksToRace })
    : w.race
      ? t("Base block before {race}", { race: w.race.name })
      : t("Base block");

  return (
    <div className="card lab-glow min-w-0 p-4 sm:p-6" style={{ borderLeft: `4px solid ${PHASE_COLOR[w.phase]}` }}>
      <button onClick={toggle} aria-expanded={isOpen} className="flex w-full flex-wrap items-start justify-between gap-x-4 gap-y-2 text-left">
        <span className="min-w-0">
          <span className="label block">
            {dateOf(w.start)} – {dateOf(end)}
          </span>
          <span className="num mt-1 block text-2xl uppercase sm:text-3xl" style={{ color: PHASE_COLOR[w.phase] }}>
            {written?.title ?? `${t(w.phase)}${w.kind === "deload" ? ` · ${t("lighter week")}` : ""}`}
          </span>
          <span className="mt-0.5 block text-sm text-muted">{position}</span>
        </span>
        <span className="text-right">
          <span className="num block text-2xl">
            {tot.hours > 0 ? `${fmt.num(tot.hours, 1)} h` : "—"}
            <span className="label ml-2">{t("planned")}</span>
          </span>
          <span className="label block">{t("suggested {h} h", { h: fmt.num(w.target, 1) })}</span>
          {done && <span className="label block text-brand">{t("complete")}</span>}
        </span>
      </button>

      {isOpen && (
        <div className="mt-4 space-y-4">
          <ul className="grid gap-x-6 gap-y-1 text-sm text-muted sm:grid-cols-2">
            {w.focus.map((f) => (
              <li key={f} className="flex gap-2">
                <span style={{ color: PHASE_COLOR[w.phase] }}>▸</span>
                {t(f)}
              </li>
            ))}
          </ul>

          <ul className="divide-y divide-line/60">
            {days.map((d) => (
              <li key={d.day} className="grid grid-cols-[4.5rem_1fr] gap-x-3 gap-y-2 py-2.5 sm:grid-cols-[6rem_1fr_5.5rem_5.5rem]">
                <span className="label pt-2">{t(DAY_NAMES[d.day])}</span>
                <textarea
                  value={d.description}
                  onChange={(e) => onEdit(d.day, { description: e.target.value })}
                  readOnly={!editable}
                  rows={2}
                  placeholder={t("Workout description (write Rest for a day off)")}
                  className="col-span-1 w-full resize-y rounded-xl border border-line bg-elev px-3 py-2 text-sm text-fg read-only:opacity-80"
                />
                <label className="label col-start-2 flex items-center gap-2 sm:col-start-auto sm:block">
                  <span className="sm:mb-1 sm:block">{t("Time")}</span>
                  <input
                    key={`${w.start}-${d.day}-${d.minutes}`}
                    defaultValue={fmtMinutes(d.minutes)}
                    onBlur={(e) => onEdit(d.day, { minutes: parseMinutes(e.target.value) })}
                    readOnly={!editable}
                    inputMode="text"
                    placeholder="1:30"
                    className="w-24 rounded-xl border border-line bg-elev px-3 py-2 text-sm normal-case text-fg sm:w-full"
                  />
                </label>
                <label className="label col-start-2 flex items-center gap-2 sm:col-start-auto sm:block">
                  <span className="sm:mb-1 sm:block">{t("Distance")}</span>
                  <input
                    key={`${w.start}-${d.day}-km-${d.km}`}
                    defaultValue={d.km ?? ""}
                    onBlur={(e) => {
                      const v = parseFloat(e.target.value.replace(",", "."));
                      onEdit(d.day, { km: Number.isFinite(v) ? v : null });
                    }}
                    readOnly={!editable}
                    inputMode="decimal"
                    placeholder="km"
                    className="w-24 rounded-xl border border-line bg-elev px-3 py-2 text-sm normal-case text-fg sm:w-full"
                  />
                </label>
              </li>
            ))}
          </ul>

          <div className="flex flex-wrap items-baseline gap-x-6 gap-y-1 border-t border-line pt-3">
            <span className="num text-xl">{fmt.num(tot.hours, 1)} h</span>
            <span className="num text-xl">{fmt.num(tot.km, 0)} km</span>
            <span className="label">{t("{n} sessions", { n: tot.sessions })}</span>
            {vsTarget !== null && <span className="label">{t("{p}% vs suggested", { p: `${vsTarget > 0 ? "+" : ""}${Math.round(vsTarget)}` })}</span>}
            {vsPrev !== null && <span className="label">{t("{p}% vs previous week", { p: `${vsPrev > 0 ? "+" : ""}${Math.round(vsPrev)}` })}</span>}
            <span className="label ml-auto" style={status.startsWith("error") ? { color: "var(--goal)" } : undefined}>
              {status === "saving" ? t("Saving…") : status === "describing" ? t("Writing the week description…") : status === "saved" ? t("Saved") : status.startsWith("error:") ? status.slice(6) : ""}
            </span>
          </div>

          {written ? (
            <div className="rounded-2xl border border-line p-4">
              <p className="label">{t("Week description")}</p>
              <p className="mt-2 whitespace-pre-line leading-relaxed">{lang === "pt" ? written.pt : written.en}</p>
              {written.hash && written.hash !== planHash(days) && <p className="label mt-3">{t("The plan changed since this was written: it is rewritten when the week is complete and saved.")}</p>}
            </div>
          ) : (
            <p className="label">{done ? t("Saving the week writes its description.") : t("When all 7 days are filled, the week gets its description.")}</p>
          )}
        </div>
      )}
    </div>
  );
}
