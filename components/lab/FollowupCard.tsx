"use client";

import { useState } from "react";
import { useI18n } from "@/lib/i18n";
import { CONTEXT_CONFIG, RED_FLAGS, type RedFlag } from "@/lib/context-config";
import { eventLabel } from "@/lib/context-signal";
import { contextChanged, type EventView } from "@/lib/use-context-data";
import { ErrorNote } from "../ErrorNote";
import { MedicalNote } from "../ContextReasons";

const FLAG_TEXT: Record<RedFlag, string> = {
  fever: "Fever",
  blood: "Blood",
  repeated_vomiting: "Repeated vomiting",
  fainting: "Fainting or near fainting",
  severe_pain: "Severe or constant pain",
  cannot_keep_fluids: "Cannot keep fluids down",
};

/**
 * The daily question for an open event: "How is your stomach today?", on a 1 to 10 scale (10 = back to normal), worse,
 * same or better than yesterday, and a short red-flag checklist. One answer per day, saved with its date so recovery
 * can be charted. The scale is set in lib/context-config.ts.
 */
export function FollowupCard({ event, day, compact = false }: { event: EventView; day: string; compact?: boolean }) {
  const { t, fmt } = useI18n();
  const max = CONTEXT_CONFIG.scaleMax;
  const today = event.followups.find((f) => f.date === day);
  const [score, setScore] = useState<number | null>(today?.score ?? null);
  const [trend, setTrend] = useState<"worse" | "same" | "better">(today?.trend ?? "same");
  const [flags, setFlags] = useState<RedFlag[]>(today?.redFlags ?? []);
  const [note, setNote] = useState(today?.note ?? "");
  const [checking, setChecking] = useState(false);
  const [state, setState] = useState<"idle" | "saving" | "saved">("idle");
  const [error, setError] = useState<string | null>(null);

  const area = t(eventLabel(event));
  const save = async () => {
    if (score === null) return;
    setState("saving");
    setError(null);
    const res = await fetch("/api/context/followup", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ eventId: event.id, date: day, score, trend, redFlags: flags, note }) });
    const j = (await res.json().catch(() => ({}))) as { error?: string; closed?: boolean };
    if (!res.ok) {
      setState("idle");
      return setError(j.error ?? String(res.status));
    }
    setState("saved");
    contextChanged();
  };

  return (
    <div className={`fade-up rounded-2xl border border-line ${compact ? "p-3" : "p-4"}`}>
      <p className="label">
        {t("Follow-up")} · {t("day {n}", { n: event.openDays })} · {fmt.dateLabel(`${event.startDate}T00:00:00`, { day: "2-digit", month: "short" })}
      </p>
      <h4 className="num mt-1 text-xl uppercase">{t("How is your {area} today?", { area })}</h4>
      {event.causeStated && <p className="mt-1 text-sm text-muted">{t("You wrote")}: “{event.causeStated}”</p>}

      <div className="mt-3">
        <div className="flex items-center justify-between">
          <span className="label">1 = {t("very bad")}</span>
          <span className="label">{max} = {t("back to normal")}</span>
        </div>
        <div className="mt-1.5 grid grid-cols-5 gap-1.5 sm:grid-cols-10" role="group" aria-label={t("Recovery score")}>
          {Array.from({ length: max }, (_, i) => i + 1).map((n) => (
            <button
              key={n}
              onClick={() => {
                setScore(n);
                setState("idle");
              }}
              aria-pressed={score === n}
              className={`num rounded-xl border py-2.5 text-xl transition-colors ${score === n ? "border-fg bg-fg text-bg" : "border-line hover:border-fg"}`}
            >
              {n}
            </button>
          ))}
        </div>
      </div>

      <div className="mt-3 grid grid-cols-3 gap-1.5" role="group" aria-label={t("Compared with yesterday")}>
        {(["worse", "same", "better"] as const).map((x) => (
          <button
            key={x}
            onClick={() => {
              setTrend(x);
              setState("idle");
            }}
            aria-pressed={trend === x}
            className={`label rounded-full border px-2 py-2.5 transition-colors ${trend === x ? "border-fg bg-fg text-bg" : "border-line hover:text-fg"}`}
          >
            {t(x === "worse" ? "Worse" : x === "same" ? "Same" : "Better")}
          </button>
        ))}
      </div>
      <p className="label mt-1">{t("Compared with yesterday")}</p>

      <button onClick={() => setChecking((c) => !c)} aria-expanded={checking} className="label mt-3 underline-offset-2 hover:text-fg hover:underline">
        {checking || flags.length ? t("Hide the red-flag checklist") : t("Any red flags?")}
      </button>
      {(checking || flags.length > 0) && (
        <fieldset className="mt-2 grid gap-1.5 sm:grid-cols-2">
          <legend className="sr-only">{t("Red flags")}</legend>
          {RED_FLAGS.map((f) => (
            <label key={f} className="flex items-center gap-2 rounded-xl border border-line px-3 py-2.5 text-sm">
              <input
                type="checkbox"
                checked={flags.includes(f)}
                onChange={(e) => {
                  setFlags((cur) => (e.target.checked ? [...cur, f] : cur.filter((x) => x !== f)));
                  setState("idle");
                }}
                className="h-5 w-5"
              />
              {t(FLAG_TEXT[f])}
            </label>
          ))}
        </fieldset>
      )}
      {flags.length > 0 && <div className="mt-3"><MedicalNote /></div>}

      <input value={note} onChange={(e) => { setNote(e.target.value); setState("idle"); }} maxLength={400} placeholder={t("A short note (optional)")} className="mt-3 w-full rounded-xl border border-line bg-elev px-3 py-2.5 text-sm text-fg" />

      <div className="mt-3 flex items-center gap-3">
        <button onClick={() => void save()} disabled={score === null || state === "saving"} className="label rounded-full border border-brand px-5 py-2.5 text-brand transition-colors hover:bg-brand hover:text-bg disabled:opacity-50">
          {state === "saving" ? t("Saving…") : today ? t("Update the answer") : t("Save the answer")}
        </button>
        {state === "saved" && <span className="fade-up label text-brand">✓ {t("Saved")}</span>}
      </div>
      <ErrorNote error={error} className="mt-2" />
      <p className="label mt-3 normal-case">{t("These answers adjust training, they are not medical advice.")}</p>
    </div>
  );
}
