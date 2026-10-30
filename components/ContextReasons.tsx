"use client";

import { useI18n } from "@/lib/i18n";
import { reasonLine, type CtxReason } from "@/lib/context-signal";

/** The message shown when a red flag is checked. Training advice, not medical advice. */
export function MedicalNote() {
  const { t } = useI18n();
  return (
    <div role="alert" className="fade-up rounded-xl border border-[#ff4d4d] bg-[#ff4d4d]/10 p-3 text-sm">
      <p className="font-medium" style={{ color: "#ff4d4d" }}>{t("Consider medical care")}</p>
      <p className="mt-1">{t("A red flag was checked. Training adjustments are not enough for this: talk to a doctor, and if it is severe or getting worse, seek care now.")}</p>
    </div>
  );
}

/**
 * The lines that explain what the Context Log did to the signal: one line per reason ("Yellow because stomach
 * recovery is 6/10 after the Oct 30 event."), the notes (cap the intensity, consider a doctor) and the medical note.
 */
export function ContextReasons({ reasons, medical, className = "" }: { reasons: CtxReason[]; medical: boolean; className?: string }) {
  const { t, fmt } = useI18n();
  if (!reasons.length && !medical) return null;
  const dateLabel = (iso: string) => fmt.dateLabel(`${iso}T00:00:00`, { day: "2-digit", month: "short" });
  return (
    <div className={`space-y-2 ${className}`}>
      <ul className="space-y-1 text-sm">
        {reasons.map((r, i) => (
          <li key={i} className="flex gap-2">
            <span style={{ color: r.level === "red" ? "#ff4d4d" : r.level === "yellow" ? "#ffb020" : "var(--muted)" }}>{r.level === "note" ? "○" : "●"}</span>
            <span className={r.level === "note" ? "text-muted" : ""}>
              {r.level === "note" ? t(r.text, { ...(r.vars ?? {}), area: t(String(r.vars?.area ?? "")) }) : reasonLine(t, r.level, r, dateLabel)}
            </span>
          </li>
        ))}
      </ul>
      {medical && <MedicalNote />}
    </div>
  );
}
