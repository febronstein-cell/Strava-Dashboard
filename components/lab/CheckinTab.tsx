"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useI18n } from "@/lib/i18n";
import { ACTION, baselines, PAIN_SPOTS, readiness, type Checkin, type Pain, type PainSpot, type Reason, type Signal } from "@/lib/checkin";
import { usePlanSession } from "@/lib/use-plan-session";
import { SIGNAL_COLOR, useReasonText } from "../TodayCard";
import { Hint, Panel } from "./LabBits";
import { SessionsRpe } from "./SessionsRpe";
import type { Profile } from "@/lib/lab/profile";
import type { Activity } from "@/lib/strava/types";

interface Stored extends Checkin {
  signal?: Signal;
  reasons: Reason[];
}

const DAY = 86_400_000;
const brt = (offset = 0) => new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(new Date(Date.now() + offset * DAY));
const addDays = (key: string, n: number) => new Date(Date.parse(key + "T00:00:00Z") + n * DAY).toISOString().slice(0, 10);

type Form = {
  wakeTime: string;
  sleepHours: string;
  sleepScore: string;
  restingHR: string;
  hrv: string;
  hrvStatus: string;
  trainingReadiness: string;
  legs: number | null;
  energy: number | null;
  pain: Pain[];
  notes: string;
};
const s = (v: number | string | undefined | null) => (v == null ? "" : String(v));
const toForm = (c: Checkin | null): Form => ({
  wakeTime: s(c?.wakeTime),
  sleepHours: c?.sleepHours != null ? `${Math.floor(c.sleepHours)}:${String(Math.round((c.sleepHours % 1) * 60)).padStart(2, "0")}` : "",
  sleepScore: s(c?.sleepScore),
  restingHR: s(c?.restingHR),
  hrv: s(c?.hrv),
  hrvStatus: s(c?.hrvStatus),
  trainingReadiness: s(c?.trainingReadiness),
  legs: c?.legs ?? null,
  energy: c?.energy ?? null,
  pain: c?.pain ?? [],
  notes: s(c?.notes),
});
/** "7:30", "7h30", "7.5" -> hours */
function hours(v: string): number | null | undefined {
  const t = v.trim().replace(",", ".");
  if (!t) return null;
  const m = t.match(/^(\d{1,2})\s*[:h]\s*(\d{1,2})$/);
  if (m) return Number(m[1]) + Number(m[2]) / 60;
  const n = Number(t);
  return Number.isFinite(n) ? n : undefined;
}
const numOrNull = (v: string) => (v.trim() === "" ? null : Number(v.replace(",", ".")));

/**
 * The 20-second morning check-in. Values imported from the watch are filled in with a badge of their source;
 * only the fields you touch are saved as typed by hand (and typed values always win over imports).
 */
export function CheckinTab({ activities, profile }: { activities: Activity[]; profile: Profile }) {
  const { t, fmt } = useI18n();
  const session = usePlanSession();
  const reasonText = useReasonText();
  const [list, setList] = useState<Stored[] | null>(null);
  const [day, setDay] = useState(brt());
  const [form, setForm] = useState<Form>(toForm(null));
  const [dirty, setDirty] = useState<Set<keyof Form>>(new Set());
  const [state, setState] = useState<"idle" | "saving" | "saved" | "importing" | `error:${string}`>("idle");
  const [importLog, setImportLog] = useState<string | null>(null);

  const load = useCallback(async () => {
    const res = await fetch("/api/checkin", { cache: "no-store" });
    if (res.ok) setList((await res.json()) as Stored[]);
  }, []);
  useEffect(() => {
    if (!session.unlocked) return;
    let alive = true;
    fetch("/api/checkin", { cache: "no-store" })
      .then((r) => (r.ok ? (r.json() as Promise<Stored[]>) : null))
      .then((d) => alive && d && setList(d))
      .catch(() => undefined);
    return () => {
      alive = false;
    };
  }, [session.unlocked]);

  const stored = useMemo(() => list?.find((c) => c.day === day) ?? null, [list, day]);
  // the form follows the stored values of the chosen day until something is typed
  const [formDay, setFormDay] = useState<string | null>(null);
  const [formFor, setFormFor] = useState<Stored | null>(null);
  if (list && (formDay !== day || (formFor !== stored && dirty.size === 0))) {
    setFormDay(day);
    setFormFor(stored);
    setForm(toForm(stored));
    setDirty(new Set());
  }

  const edit = <K extends keyof Form>(k: K, v: Form[K]) => {
    setForm((f) => ({ ...f, [k]: v }));
    setDirty((d) => new Set(d).add(k));
    setState("idle");
  };

  // live preview of the signal with what is on the form
  const preview = useMemo(() => {
    if (!list) return null;
    const c: Checkin = {
      day,
      pain: form.pain,
      sources: {},
      sleepHours: hours(form.sleepHours) ?? undefined,
      restingHR: numOrNull(form.restingHR) ?? undefined,
      hrv: numOrNull(form.hrv) ?? undefined,
      legs: form.legs ?? undefined,
      energy: form.energy ?? undefined,
    };
    return readiness(c, list.filter((x) => x.day !== day));
  }, [form, list, day]);
  const base = useMemo(() => (list ? baselines(list, day) : null), [list, day]);

  const save = async () => {
    const body: Record<string, unknown> = { day };
    for (const k of dirty) {
      if (k === "sleepHours") {
        const h = hours(form.sleepHours);
        if (h === undefined) return setState(`error:${t("Sleep: write it like 7:30")}`);
        body.sleepHours = h;
      } else if (k === "legs" || k === "energy" || k === "pain") body[k] = form[k];
      else if (k === "wakeTime" || k === "hrvStatus" || k === "notes") body[k] = form[k] || null;
      else body[k] = numOrNull(form[k] as string);
    }
    setState("saving");
    const res = await fetch("/api/checkin", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    const j = (await res.json().catch(() => ({}))) as { error?: string };
    if (!res.ok) return setState(`error:${j.error ?? res.status}`);
    setDirty(new Set());
    setState("saved");
    window.dispatchEvent(new Event("checkin-saved"));
    await load();
  };

  const importNow = async () => {
    setState("importing");
    const res = await fetch("/api/checkin/import", { method: "POST" });
    const j = (await res.json().catch(() => ({}))) as { error?: string; providers?: { source: string; configured: boolean; ok: boolean; missing: string[]; errors: string[] }[] };
    if (!res.ok) return setState(`error:${j.error ?? res.status}`);
    setImportLog(
      (j.providers ?? [])
        .map((p) => (p.configured ? `${p.source}: ${p.ok ? t("ok") : t("failed")}${p.missing.length ? ` · ${t("not provided")}: ${p.missing.join(", ")}` : ""}${p.errors.length ? ` · ${p.errors.join("; ")}` : ""}` : `${p.source}: ${t("not configured")}`))
        .join("\n"),
    );
    setState("idle");
    await load();
  };

  if (session.state === "checking") return null;
  if (!session.unlocked) return <Hint>{t("The check-in holds personal health data: unlock the planner on this device to see and fill it.")}</Hint>;
  if (!list) return <p className="label">{t("Loading…")}</p>;

  const badge = (field: string) => {
    const src = stored?.sources[field];
    if (!src || dirty.has(field as keyof Form)) return null;
    return <span className="label ml-2 rounded-full border border-line px-2 py-0.5 normal-case">{src === "manual" ? t("typed") : src === "garmin" ? "Garmin" : "intervals.icu"}</span>;
  };
  const sig = preview?.signal ?? null;

  return (
    <div className="lab-enter space-y-6">
      <div className="flex flex-wrap items-center gap-2">
        {[brt(-1), brt()].map((d) => (
          <button
            key={d}
            onClick={() => setDay(d)}
            aria-pressed={day === d}
            className={`label rounded-full border px-4 py-2.5 ${day === d ? "border-fg bg-fg text-bg" : "border-line hover:text-fg"}`}
          >
            {d === brt() ? t("Today") : t("Yesterday")}
          </button>
        ))}
        <button onClick={() => void importNow()} disabled={state === "importing"} className="label ml-auto rounded-full border border-line px-4 py-2.5 hover:text-fg disabled:opacity-50">
          {state === "importing" ? t("Importing…") : t("Import now")}
        </button>
      </div>
      {importLog && <pre className="whitespace-pre-wrap rounded-xl border border-line p-3 text-xs text-muted">{importLog}</pre>}

      <section className="card lab-card p-4 sm:p-6" style={{ borderLeft: `4px solid ${sig ? SIGNAL_COLOR[sig] : "var(--line)"}` }}>
        <p className="label">{t("Signal")}</p>
        <p className="num mt-1 text-3xl uppercase" style={{ color: sig ? SIGNAL_COLOR[sig] : undefined }}>
          {sig ? t(sig === "green" ? "Green" : sig === "yellow" ? "Yellow" : "Red") : "—"}
        </p>
        {sig && <p className="mt-2 font-medium">{t(ACTION[sig])}</p>}
        {preview && preview.reasons.length > 0 && (
          <ul className="mt-2 space-y-1 text-sm text-muted">
            {preview.reasons.map((r, i) => (
              <li key={i}>● {reasonText(r)}</li>
            ))}
          </ul>
        )}
        {base && (!base.restingHR?.ready || !base.lnHrv?.ready) && (
          <p className="label mt-3">{t("Building baseline: {n} of 7 days", { n: Math.min(base.restingHR?.n ?? 0, base.lnHrv?.n ?? 0) })}</p>
        )}
      </section>

      <Panel title={t("How did you wake up?")}>
        <div className="grid gap-4 sm:grid-cols-2">
          <Scale label={t("Legs")} value={form.legs} onPick={(v) => edit("legs", v)} />
          <Scale label={t("Energy")} value={form.energy} onPick={(v) => edit("energy", v)} />
        </div>

        <div className="mt-5">
          <p className="label mb-2">{t("Pain")}</p>
          <div className="flex flex-wrap gap-2">
            {PAIN_SPOTS.map((spot) => {
              const on = form.pain.find((p) => p.location === spot);
              return (
                <button
                  key={spot}
                  onClick={() => edit("pain", on ? form.pain.filter((p) => p.location !== spot) : [...form.pain, { location: spot as PainSpot, score: 3 }])}
                  aria-pressed={!!on}
                  className={`rounded-full border px-4 py-2.5 text-sm ${on ? "border-[var(--goal)] text-fg" : "border-line text-muted"}`}
                >
                  {t(spot)}
                </button>
              );
            })}
          </div>
          {form.pain.map((p) => (
            <div key={p.location} className="mt-3 rounded-xl border border-line p-3">
              <div className="flex items-center justify-between gap-3">
                <span className="font-medium">{t(p.location)}</span>
                <span className="num text-2xl">{p.score}/10</span>
              </div>
              <input
                type="range"
                min={0}
                max={10}
                value={p.score}
                onChange={(e) => edit("pain", form.pain.map((x) => (x.location === p.location ? { ...x, score: Number(e.target.value) } : x)))}
                className="mt-2 w-full accent-[var(--goal)]"
                aria-label={t("Pain score")}
              />
              <label className="mt-2 flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={!!p.stride}
                  onChange={(e) => edit("pain", form.pain.map((x) => (x.location === p.location ? { ...x, stride: e.target.checked || undefined } : x)))}
                  className="h-5 w-5"
                />
                {t("Changes my stride")}
              </label>
            </div>
          ))}
        </div>
      </Panel>

      <Panel title={t("Night")} subtitle={t("Imported from the watch when available. Anything you change here is kept and never replaced by an import.")}>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Num label={t("Wake time")} badge={badge("wakeTime")} value={form.wakeTime} placeholder="6:30" onChange={(v) => edit("wakeTime", v)} mode="text" />
          <Num label={t("Sleep (h:mm)")} badge={badge("sleepHours")} value={form.sleepHours} placeholder="8:00" onChange={(v) => edit("sleepHours", v)} mode="text" />
          <Num label={t("Sleep score")} badge={badge("sleepScore")} value={form.sleepScore} onChange={(v) => edit("sleepScore", v)} />
          <Num label={t("Resting HR")} badge={badge("restingHR")} value={form.restingHR} onChange={(v) => edit("restingHR", v)} />
          <Num label={t("HRV (rMSSD, ms)")} badge={badge("hrv")} value={form.hrv} onChange={(v) => edit("hrv", v)} />
          <label className="block">
            <span className="label mb-1 block">{t("HRV status")}{badge("hrvStatus")}</span>
            <select value={form.hrvStatus} onChange={(e) => edit("hrvStatus", e.target.value)} className={INPUT}>
              <option value="">—</option>
              {["balanced", "unbalanced", "low", "poor"].map((x) => (
                <option key={x} value={x}>{t(x)}</option>
              ))}
            </select>
          </label>
          <Num label={t("Training readiness")} badge={badge("trainingReadiness")} value={form.trainingReadiness} onChange={(v) => edit("trainingReadiness", v)} />
        </div>
        <label className="mt-4 block">
          <span className="label mb-1 block">{t("Notes")}</span>
          <textarea value={form.notes} onChange={(e) => edit("notes", e.target.value)} rows={2} className={INPUT} />
        </label>
      </Panel>

      <div className="sticky bottom-3 z-30 flex items-center gap-3">
        <button
          onClick={() => void save()}
          disabled={dirty.size === 0 || state === "saving"}
          className="num w-full rounded-full bg-brand px-6 py-4 text-xl uppercase text-bg shadow-[0_6px_20px_rgba(0,0,0,0.35)] disabled:opacity-50"
        >
          {state === "saving" ? t("Saving…") : state === "saved" && dirty.size === 0 ? t("Saved") : t("Save")}
        </button>
      </div>
      {state.startsWith("error:") && <p className="text-sm" style={{ color: "var(--goal)" }}>{state.slice(6)}</p>}

      <SessionsRpe activities={activities} profile={profile} days={[brt(-1), brt()]} />

      <CheckinCharts list={list} today={brt()} fmt={fmt} />
    </div>
  );
}

const INPUT = "w-full rounded-xl border border-line bg-elev px-3 py-3 text-base text-fg";

function Num({ label, value, onChange, placeholder, badge, mode = "decimal" }: { label: string; value: string; onChange: (v: string) => void; placeholder?: string; badge?: React.ReactNode; mode?: "decimal" | "text" }) {
  return (
    <label className="block">
      <span className="label mb-1 block">
        {label}
        {badge}
      </span>
      <input value={value} onChange={(e) => onChange(e.target.value)} inputMode={mode} placeholder={placeholder} className={INPUT} />
    </label>
  );
}

function Scale({ label, value, onPick }: { label: string; value: number | null; onPick: (v: number) => void }) {
  return (
    <div>
      <p className="label mb-2">{label}</p>
      <div className="grid grid-cols-5 gap-2">
        {[1, 2, 3, 4, 5].map((v) => (
          <button
            key={v}
            onClick={() => onPick(v)}
            aria-pressed={value === v}
            className={`num rounded-xl border py-3 text-2xl transition-colors ${value === v ? "border-fg bg-fg text-bg" : "border-line hover:border-fg"}`}
          >
            {v}
          </button>
        ))}
      </div>
    </div>
  );
}

/** 28 days: resting HR and HRV with their baseline bands, sleep against 8 h, legs and energy, signal colors. */
function CheckinCharts({ list, today, fmt }: { list: Stored[]; today: string; fmt: { dateLabel: (d: string, o: Intl.DateTimeFormatOptions) => string } }) {
  const { t } = useI18n();
  const days = Array.from({ length: 28 }, (_, i) => addDays(today, i - 27));
  const by = new Map(list.map((c) => [c.day, c]));
  const band = (field: "restingHR" | "lnHrv") =>
    days.map((d) => {
      const b = baselines(list, d)[field];
      if (!b?.ready) return null;
      return field === "lnHrv" ? [Math.exp(b.mean - b.sd), Math.exp(b.mean + b.sd)] : [b.mean - b.sd, b.mean + b.sd];
    });
  if (!days.some((d) => by.has(d))) return <Hint>{t("The 28-day charts appear after the first check-ins.")}</Hint>;

  return (
    <Panel title={t("Last 28 days")}>
      <div className="space-y-6">
        <Line title={t("Resting HR (bpm)")} days={days} values={days.map((d) => by.get(d)?.restingHR ?? null)} band={band("restingHR")} color="var(--run)" />
        <Line title={t("HRV (rMSSD, ms)")} days={days} values={days.map((d) => by.get(d)?.hrv ?? null)} band={band("lnHrv")} color="var(--swim)" />
        <Bars title={t("Sleep (h)")} days={days} values={days.map((d) => by.get(d)?.sleepHours ?? null)} target={8} />
        <Dots title={t("Legs and energy (1 to 5)")} days={days} a={days.map((d) => by.get(d)?.legs ?? null)} b={days.map((d) => by.get(d)?.energy ?? null)} labels={[t("Legs"), t("Energy")]} />
        <div>
          <div className="flex gap-0.5">
            {days.map((d) => {
              const s = by.get(d)?.signal;
              return <span key={d} title={d} className="h-2.5 flex-1 rounded-sm" style={{ background: s ? SIGNAL_COLOR[s] : "var(--line)", opacity: s ? 1 : 0.4 }} />;
            })}
          </div>
          <div className="label mt-1 flex justify-between">
            <span>{fmt.dateLabel(`${days[0]}T00:00:00`, { day: "2-digit", month: "short" })}</span>
            <span>{t("Signal")}</span>
            <span>{fmt.dateLabel(`${today}T00:00:00`, { day: "2-digit", month: "short" })}</span>
          </div>
        </div>
      </div>
    </Panel>
  );
}

const W = 560;
const H = 120;
const PAD = 26;

function scale(values: (number | null)[], extra: number[] = []) {
  const all = [...values.filter((v): v is number => v != null), ...extra];
  const lo = Math.min(...all);
  const hi = Math.max(...all);
  const span = hi - lo || 1;
  return (v: number) => H - 8 - ((v - lo + span * 0.1) / (span * 1.2)) * (H - 16);
}
const xAt = (i: number, n: number) => PAD + (i * (W - PAD - 6)) / (n - 1);

function Line({ title, days, values, band, color }: { title: string; days: string[]; values: (number | null)[]; band: (number[] | null)[]; color: string }) {
  if (!values.some((v) => v != null)) return null;
  const y = scale(values, band.flat().filter((v): v is number => v != null));
  const pts = values.map((v, i) => (v == null ? null : `${xAt(i, days.length)},${y(v)}`)).filter(Boolean);
  const top = band.map((b, i) => (b ? `${xAt(i, days.length)},${y(b[1])}` : null)).filter(Boolean);
  const bottom = band.map((b, i) => (b ? `${xAt(i, days.length)},${y(b[0])}` : null)).filter(Boolean).reverse();
  const last = values.map((v, i) => [v, i] as const).filter(([v]) => v != null).pop();
  return (
    <figure>
      <figcaption className="label mb-1">{title}</figcaption>
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-label={title}>
        {top.length > 1 && <polygon points={[...top, ...bottom].join(" ")} fill={color} opacity={0.15} />}
        <polyline points={pts.join(" ")} fill="none" stroke={color} strokeWidth={2} />
        {values.map((v, i) => (v == null ? null : <circle key={i} cx={xAt(i, days.length)} cy={y(v)} r={2.6} fill={color} />))}
        {last && (
          <text x={W - 4} y={y(last[0] as number) - 6} textAnchor="end" fontSize={11} fill="var(--fg)">
            {Math.round(last[0] as number)}
          </text>
        )}
      </svg>
    </figure>
  );
}

function Bars({ title, days, values, target }: { title: string; days: string[]; values: (number | null)[]; target: number }) {
  if (!values.some((v) => v != null)) return null;
  const max = Math.max(target + 1, ...values.filter((v): v is number => v != null));
  const y = (v: number) => H - 8 - (v / max) * (H - 16);
  const bw = (W - PAD) / days.length - 3;
  return (
    <figure>
      <figcaption className="label mb-1">{title}</figcaption>
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-label={title}>
        {values.map((v, i) =>
          v == null ? null : <rect key={i} x={xAt(i, days.length) - bw / 2} y={y(v)} width={bw} height={H - 8 - y(v)} rx={2} fill={v >= target ? "var(--brand)" : v >= 6.5 ? "#ffb020" : "#ff4d4d"} />,
        )}
        <line x1={PAD - 6} x2={W} y1={y(target)} y2={y(target)} stroke="var(--fg)" strokeDasharray="4 3" opacity={0.6} />
        <text x={2} y={y(target) + 4} fontSize={10} fill="var(--muted)">8 h</text>
      </svg>
    </figure>
  );
}

function Dots({ title, days, a, b, labels }: { title: string; days: string[]; a: (number | null)[]; b: (number | null)[]; labels: [string, string] }) {
  if (!a.some((v) => v != null) && !b.some((v) => v != null)) return null;
  const y = (v: number) => H - 12 - ((v - 1) / 4) * (H - 24);
  return (
    <figure>
      <figcaption className="label mb-1">
        {title} · <span style={{ color: "var(--ride)" }}>● {labels[0]}</span> <span style={{ color: "var(--swim)" }}>● {labels[1]}</span>
      </figcaption>
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-label={title}>
        {[1, 3, 5].map((v) => (
          <g key={v}>
            <line x1={PAD - 6} x2={W} y1={y(v)} y2={y(v)} stroke="var(--line)" />
            <text x={2} y={y(v) + 4} fontSize={10} fill="var(--muted)">{v}</text>
          </g>
        ))}
        {a.map((v, i) => (v == null ? null : <circle key={`a${i}`} cx={xAt(i, days.length) - 2} cy={y(v)} r={4} fill="var(--ride)" />))}
        {b.map((v, i) => (v == null ? null : <circle key={`b${i}`} cx={xAt(i, days.length) + 2} cy={y(v)} r={4} fill="var(--swim)" />))}
      </svg>
    </figure>
  );
}
