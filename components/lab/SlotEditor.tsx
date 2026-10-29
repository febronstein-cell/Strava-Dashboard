"use client";

import { useState } from "react";
import { useI18n } from "@/lib/i18n";
import { ErrorNote } from "../ErrorNote";
import { HAS_DISTANCE, SPORT_LABEL, fmtMinutes, parseMinutes } from "@/lib/lab/plan";
import type { PlanSlot, PlanSport, PlanStructure, PlanTarget, TargetType } from "@/lib/lab/types";

const SPORT_COLOR: Record<PlanSport, string> = {
  run: "var(--run)",
  ride: "var(--ride)",
  swim: "var(--swim)",
  strength: "var(--goal)",
  other: "var(--muted)",
};
const TARGET_LABEL: Record<TargetType | "none", string> = {
  none: "No target",
  "hr-cap": "HR cap",
  "hr-range": "HR range",
  "pace-range": "Pace range",
  "power-range": "Power range",
};

/** "3:40" -> 220 (seconds); "220" -> 220. */
export function parseClock(v: string): number | undefined {
  const s = v.trim();
  if (!s) return undefined;
  const m = s.match(/^(\d{1,3}):(\d{2})$/);
  if (m) return Number(m[1]) * 60 + Number(m[2]);
  const n = Number(s.replace(",", "."));
  return Number.isFinite(n) && n > 0 ? n : undefined;
}
export const clock = (s?: number) => (s == null ? "" : `${Math.floor(s / 60)}:${String(Math.round(s % 60)).padStart(2, "0")}`);

/** How a target reads, e.g. "3:40–3:45 /km", "HR ≤ 150", "280–300 W". */
export function targetText(t: PlanTarget): string {
  const f = (v?: number) => (v == null ? "?" : t.type === "pace-range" ? clock(v) : String(Math.round(v)));
  if (t.type === "hr-cap") return `HR ≤ ${f(t.max ?? t.min)}`;
  const unit = t.type === "pace-range" ? " /km" : t.type === "power-range" ? " W" : " bpm";
  return `${t.type === "hr-range" ? "HR " : ""}${f(t.min)}–${f(t.max)}${unit}`;
}
export function structureText(s: PlanStructure): string {
  const rep = s.repSeconds ? `${clock(s.repSeconds)}` : s.repMeters ? `${s.repMeters >= 1000 ? `${s.repMeters / 1000}k` : `${s.repMeters} m`}` : "";
  return `${s.reps ?? "?"}×${rep}${s.recoverySeconds ? ` r${clock(s.recoverySeconds)}` : ""}`;
}

/**
 * One planned session: sport, text, time and (for run, bike and swim) distance, plus optional details: key session,
 * intensity target and interval structure, which "Parse from text" can suggest from what is written.
 */
export function SlotEditor({
  slot,
  label,
  editable,
  idKey,
  onChange,
  onRemove,
}: {
  slot: PlanSlot;
  /** e.g. "Run", "Run · AM", "Run · PM" */
  label: string;
  editable: boolean;
  idKey: string;
  onChange: (patch: Partial<PlanSlot>) => void;
  onRemove?: () => void;
}) {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  const [parsing, setParsing] = useState<"idle" | "busy" | `error:${string}`>("idle");
  const [suggestion, setSuggestion] = useState<Partial<PlanSlot> | null>(null);
  const km = HAS_DISTANCE[slot.sport];
  const hasDetails = !!(slot.key || slot.target || slot.structure);

  const parse = async () => {
    setParsing("busy");
    const res = await fetch("/api/plan/parse", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ text: slot.description, sport: slot.sport }) });
    const j = (await res.json().catch(() => ({}))) as Partial<PlanSlot> & { error?: string };
    if (!res.ok) return setParsing(`error:${j.error ?? res.status}`);
    setParsing("idle");
    setSuggestion({ key: j.key, target: j.target, structure: j.structure, ...(j.minutes && !slot.minutes ? { minutes: j.minutes } : {}), ...(j.km && !slot.km && km ? { km: j.km } : {}) });
  };

  const setTarget = (patch: Partial<PlanTarget>) => {
    const next = { type: slot.target?.type ?? "hr-cap", ...slot.target, ...patch } as PlanTarget;
    onChange({ target: next.min == null && next.max == null && !patch.type ? undefined : next });
  };
  const setStructure = (patch: Partial<PlanStructure>) => {
    const next = { ...slot.structure, ...patch };
    onChange({ structure: Object.values(next).some((v) => v != null) ? next : undefined });
  };

  return (
    <div className="space-y-1.5">
      <div className="grid grid-cols-[1fr_5rem_5rem] items-start gap-x-2 gap-y-1.5 sm:grid-cols-[6.5rem_1fr_5rem_5rem]">
        <span className="label col-span-3 flex items-center gap-2 sm:col-span-1 sm:block sm:pt-2.5" style={{ color: SPORT_COLOR[slot.sport] }}>
          {label}
          {slot.key && <span className="ml-1 rounded-full border border-current px-1.5 text-[10px]">{t("key")}</span>}
        </span>
        <textarea
          value={slot.description}
          onChange={(e) => onChange({ description: e.target.value })}
          readOnly={!editable}
          rows={1}
          placeholder={t("Workout (optional)")}
          className="col-span-3 max-h-48 min-h-10 w-full resize-y rounded-xl border border-line bg-elev px-3 py-2 text-sm text-fg [field-sizing:content] read-only:opacity-80 sm:col-span-1"
        />
        <input
          key={`${idKey}-t-${slot.minutes}`}
          defaultValue={fmtMinutes(slot.minutes)}
          onBlur={(e) => onChange({ minutes: parseMinutes(e.target.value) })}
          readOnly={!editable}
          inputMode="text"
          placeholder={t("Time")}
          aria-label={`${label} · ${t("Time")}`}
          className="col-start-2 w-full rounded-xl border border-line bg-elev px-3 py-2 text-sm normal-case text-fg sm:col-start-auto"
        />
        {km && (
          <input
            key={`${idKey}-km-${slot.km}`}
            defaultValue={slot.km ?? ""}
            onBlur={(e) => {
              const v = parseFloat(e.target.value.replace(",", "."));
              onChange({ km: Number.isFinite(v) ? v : null });
            }}
            readOnly={!editable}
            inputMode="decimal"
            placeholder="km"
            aria-label={`${label} · ${t("Distance")}`}
            className="w-full rounded-xl border border-line bg-elev px-3 py-2 text-sm normal-case text-fg"
          />
        )}
      </div>

      {/* the name of the workout, under the description */}
      <div className="sm:pl-[7.1rem]">
        <input
          value={slot.name ?? ""}
          onChange={(e) => onChange({ name: e.target.value || undefined })}
          readOnly={!editable}
          maxLength={80}
          placeholder={t("Workout name (e.g. VO2max Effort 5x4')")}
          aria-label={`${label} · ${t("Workout name")}`}
          className="w-full rounded-xl border border-line bg-elev px-3 py-2 text-sm font-medium text-fg placeholder:font-normal read-only:opacity-80"
        />
      </div>

      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 sm:pl-[7.1rem]">
        {(slot.target || slot.structure) && (
          <span className="label normal-case text-muted">
            {[slot.structure && structureText(slot.structure), slot.target && targetText(slot.target)].filter(Boolean).join(" · ")}
          </span>
        )}
        {editable && (
          <button onClick={() => setOpen((o) => !o)} className="label underline-offset-2 hover:text-fg hover:underline">
            {open ? t("Hide details") : hasDetails ? t("Edit details") : t("Details")}
          </button>
        )}
        {editable && onRemove && (
          <button onClick={onRemove} className="label hover:text-fg">
            ✕ {t("Remove this session")}
          </button>
        )}
      </div>

      {open && editable && (
        <div className="grid gap-3 rounded-xl border border-line p-3 sm:ml-[7.1rem] sm:grid-cols-2">
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={!!slot.key} onChange={(e) => onChange({ key: e.target.checked || undefined })} className="h-5 w-5" />
            {t("Key session")}
          </label>
          <div className="flex items-center gap-2">
            <button
              onClick={() => void parse()}
              disabled={!slot.description.trim() || parsing === "busy"}
              className="label rounded-full border border-brand px-3 py-2 text-brand hover:bg-brand hover:text-bg disabled:opacity-50"
            >
              {parsing === "busy" ? t("Reading…") : t("Parse from text")}
            </button>
            {parsing.startsWith("error:") && <ErrorNote error={parsing.slice(6)} />}
          </div>

          {suggestion && (
            <div className="rounded-xl border border-brand p-3 text-sm sm:col-span-2">
              <p className="label text-brand">{t("Suggested from your text")}</p>
              <p className="mt-1">
                {[
                  suggestion.key ? t("Key session") : t("Not a key session"),
                  suggestion.structure && structureText(suggestion.structure),
                  suggestion.target && targetText(suggestion.target),
                  suggestion.minutes && `${fmtMinutes(suggestion.minutes)} h`,
                  suggestion.km && `${suggestion.km} km`,
                ]
                  .filter(Boolean)
                  .join(" · ")}
              </p>
              <div className="mt-2 flex gap-2">
                <button
                  onClick={() => {
                    onChange({ key: suggestion.key || undefined, target: suggestion.target, structure: suggestion.structure, ...(suggestion.minutes ? { minutes: suggestion.minutes } : {}), ...(suggestion.km ? { km: suggestion.km } : {}) });
                    setSuggestion(null);
                  }}
                  className="label rounded-full border border-brand px-3 py-1.5 text-brand hover:bg-brand hover:text-bg"
                >
                  {t("Use this")}
                </button>
                <button onClick={() => setSuggestion(null)} className="label rounded-full border border-line px-3 py-1.5 hover:text-fg">
                  {t("Discard")}
                </button>
              </div>
            </div>
          )}

          <label className="block">
            <span className="label mb-1 block">{t("Target")}</span>
            <select
              value={slot.target?.type ?? "none"}
              onChange={(e) => (e.target.value === "none" ? onChange({ target: undefined }) : onChange({ target: { type: e.target.value as TargetType, min: slot.target?.min, max: slot.target?.max } }))}
              className={INPUT}
            >
              {(Object.keys(TARGET_LABEL) as (TargetType | "none")[]).map((k) => (
                <option key={k} value={k}>
                  {t(TARGET_LABEL[k])}
                </option>
              ))}
            </select>
          </label>
          {slot.target && (
            <div className="grid grid-cols-2 gap-2">
              {slot.target.type !== "hr-cap" && (
                <Box
                  label={slot.target.type === "pace-range" ? t("Fastest (m:ss/km)") : t("Min")}
                  value={slot.target.type === "pace-range" ? clock(slot.target.min) : s(slot.target.min)}
                  onCommit={(v) => setTarget({ min: parseClock(v) })}
                />
              )}
              <Box
                label={slot.target.type === "hr-cap" ? t("Cap (bpm)") : slot.target.type === "pace-range" ? t("Slowest (m:ss/km)") : t("Max")}
                value={slot.target.type === "pace-range" ? clock(slot.target.max) : s(slot.target.max)}
                onCommit={(v) => setTarget({ max: parseClock(v) })}
              />
            </div>
          )}

          <div className="grid grid-cols-2 gap-2 sm:col-span-2 sm:grid-cols-4">
            <Box label={t("Reps")} value={s(slot.structure?.reps)} onCommit={(v) => setStructure({ reps: num(v) })} />
            <Box label={t("Rep time (m:ss)")} value={clock(slot.structure?.repSeconds)} onCommit={(v) => setStructure({ repSeconds: parseClock(v) })} />
            <Box label={t("Rep distance (m)")} value={s(slot.structure?.repMeters)} onCommit={(v) => setStructure({ repMeters: num(v) })} />
            <Box label={t("Recovery (m:ss)")} value={clock(slot.structure?.recoverySeconds)} onCommit={(v) => setStructure({ recoverySeconds: parseClock(v) })} />
          </div>
        </div>
      )}
    </div>
  );
}

const INPUT = "w-full rounded-xl border border-line bg-elev px-3 py-2.5 text-sm text-fg";
const s = (v?: number) => (v == null ? "" : String(v));
const num = (v: string) => {
  const n = Number(v.replace(",", "."));
  return v.trim() && Number.isFinite(n) && n > 0 ? n : undefined;
};

function Box({ label, value, onCommit }: { label: string; value: string; onCommit: (v: string) => void }) {
  return (
    <label className="block">
      <span className="label mb-1 block">{label}</span>
      <input key={value} defaultValue={value} onBlur={(e) => e.target.value !== value && onCommit(e.target.value)} inputMode="text" className={INPUT} />
    </label>
  );
}

export { SPORT_COLOR, SPORT_LABEL };
