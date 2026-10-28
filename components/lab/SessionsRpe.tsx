"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { useI18n } from "@/lib/i18n";
import { activityLoad, type LoadMethod } from "@/lib/lab/load";
import { SPORT_LABEL } from "@/lib/lab/plan";
import type { Profile } from "@/lib/lab/profile";
import type { Activity } from "@/lib/strava/types";
import { Panel } from "./LabBits";
import { RpePicker } from "./RpePicker";

export const METHOD_LABEL: Record<LoadMethod, string> = {
  power: "load from power",
  pace: "load from pace",
  hr: "load from heart rate",
  rpe: "load from RPE",
  duration: "load from duration only",
};
const hm = (s: number) => `${Math.floor(s / 3600)}:${String(Math.round((s % 3600) / 60)).padStart(2, "0")}`;

/**
 * Yesterday's and today's sessions with an RPE picker each (how hard it felt, 1 to 10), and a form to add a session
 * Strava does not have (a pool swim without a watch). The load of each session says which method it came from.
 */
export function SessionsRpe({ activities, profile, days }: { activities: Activity[]; profile: Profile; days: string[] }) {
  const { t } = useI18n();
  const router = useRouter();
  const list = activities.filter((a) => days.includes(a.date.slice(0, 10))).sort((a, b) => (a.date < b.date ? -1 : 1));
  const [adding, setAdding] = useState(false);
  const [form, setForm] = useState({ day: days[days.length - 1], time: "07:00", sport: "swim", minutes: "", km: "", rpe: "" as string, name: "" });
  const [error, setError] = useState<string | null>(null);

  const add = async () => {
    setError(null);
    const res = await fetch("/api/rpe", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        manual: { startedAt: `${form.day}T${form.time}`, sport: form.sport, elapsedMin: Number(form.minutes), km: form.km ? Number(form.km.replace(",", ".")) : 0, rpe: form.rpe ? Number(form.rpe) : null, name: form.name },
      }),
    });
    const j = (await res.json().catch(() => ({}))) as { error?: string };
    if (!res.ok) return setError(j.error ?? String(res.status));
    setAdding(false);
    router.refresh();
  };
  const remove = async (id: number) => {
    if (!window.confirm(t("Remove this session?"))) return;
    await fetch("/api/rpe", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ deleteManual: -id }) });
    router.refresh();
  };

  return (
    <Panel title={t("How hard did it feel?")} subtitle={t("Session RPE, 1 = very easy, 10 = all out. It gives a load to sessions without power, pace or heart rate (swims, gym).")}>
      {list.length === 0 && <p className="text-sm text-muted">{t("No sessions yesterday or today yet.")}</p>}
      <ul className="space-y-4">
        {list.map((a) => {
          const load = activityLoad(a, profile);
          return (
            <li key={a.id}>
              <div className="mb-1.5 flex flex-wrap items-baseline justify-between gap-2 text-sm">
                <span>
                  <span className="label mr-2">{t(SPORT_LABEL[a.sport as keyof typeof SPORT_LABEL] ?? a.sport)}</span>
                  {a.name} · {hm(a.elapsedTime)}
                  {a.distance > 0 ? ` · ${(a.distance / 1000).toFixed(1)} km` : ""}
                  {a.manual && <span className="label ml-2">{t("manual")}</span>}
                </span>
                <span className="label normal-case">
                  {Math.round(load.tss)} {t("points")} · {t(METHOD_LABEL[load.method])}
                  {load.method !== "rpe" && load.rpeTss !== undefined ? ` · ${t("RPE says {n}", { n: Math.round(load.rpeTss) })}` : ""}
                </span>
              </div>
              <RpePicker activityId={a.id} value={a.rpe} editable />
              {a.manual && (
                <button onClick={() => void remove(a.id)} className="label mt-1 hover:text-fg">
                  ✕ {t("Remove this session")}
                </button>
              )}
            </li>
          );
        })}
      </ul>

      {!adding ? (
        <button onClick={() => setAdding(true)} className="label mt-4 rounded-full border border-line px-4 py-2.5 hover:text-fg">
          + {t("Add a session Strava does not have")}
        </button>
      ) : (
        <div className="mt-4 grid grid-cols-2 gap-3 rounded-2xl border border-line p-4 sm:grid-cols-3">
          <label className="block">
            <span className="label mb-1 block">{t("Day")}</span>
            <select value={form.day} onChange={(e) => setForm({ ...form, day: e.target.value })} className={INPUT}>
              {days.map((d) => (
                <option key={d} value={d}>{d}</option>
              ))}
            </select>
          </label>
          <label className="block">
            <span className="label mb-1 block">{t("Start")}</span>
            <input type="time" value={form.time} onChange={(e) => setForm({ ...form, time: e.target.value })} className={INPUT} />
          </label>
          <label className="block">
            <span className="label mb-1 block">{t("Sport")}</span>
            <select value={form.sport} onChange={(e) => setForm({ ...form, sport: e.target.value })} className={INPUT}>
              {(["swim", "run", "ride", "strength", "other"] as const).map((s) => (
                <option key={s} value={s}>{t(SPORT_LABEL[s])}</option>
              ))}
            </select>
          </label>
          <label className="block">
            <span className="label mb-1 block">{t("Total time (min)")}</span>
            <input inputMode="numeric" value={form.minutes} onChange={(e) => setForm({ ...form, minutes: e.target.value })} className={INPUT} />
          </label>
          <label className="block">
            <span className="label mb-1 block">{t("Distance (km)")}</span>
            <input inputMode="decimal" value={form.km} onChange={(e) => setForm({ ...form, km: e.target.value })} className={INPUT} />
          </label>
          <label className="block">
            <span className="label mb-1 block">RPE</span>
            <select value={form.rpe} onChange={(e) => setForm({ ...form, rpe: e.target.value })} className={INPUT}>
              <option value="">—</option>
              {Array.from({ length: 10 }, (_, i) => i + 1).map((n) => (
                <option key={n} value={n}>{n}</option>
              ))}
            </select>
          </label>
          <label className="col-span-2 block sm:col-span-3">
            <span className="label mb-1 block">{t("Name")}</span>
            <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder={t("Pool swim")} className={INPUT} />
          </label>
          <div className="col-span-2 flex gap-2 sm:col-span-3">
            <button onClick={() => void add()} disabled={!Number(form.minutes)} className="label rounded-full border border-brand px-4 py-2 text-brand hover:bg-brand hover:text-bg disabled:opacity-50">
              {t("Save")}
            </button>
            <button onClick={() => setAdding(false)} className="label rounded-full border border-line px-4 py-2 hover:text-fg">
              {t("Cancel")}
            </button>
          </div>
          {error && <p className="col-span-2 text-sm sm:col-span-3" style={{ color: "var(--goal)" }}>{error}</p>}
        </div>
      )}
    </Panel>
  );
}

const INPUT = "w-full rounded-xl border border-line bg-elev px-3 py-2.5 text-base text-fg";
