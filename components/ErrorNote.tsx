"use client";

import { useI18n } from "@/lib/i18n";
import { friendlyError } from "@/lib/friendly-error";

/** A readable error: what happened in plain words (EN/PT), the raw message in the tooltip for debugging. */
export function ErrorNote({ error, className = "" }: { error: unknown; className?: string }) {
  const { t } = useI18n();
  if (error == null || error === "") return null;
  return (
    <p role="alert" title={String(error)} className={`fade-up flex items-start gap-2 rounded-xl border border-[var(--goal)]/40 bg-[var(--goal)]/10 px-3 py-2 text-sm ${className}`}>
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--goal)" strokeWidth="2" strokeLinecap="round" className="mt-0.5 shrink-0" aria-hidden>
        <circle cx="12" cy="12" r="9" />
        <path d="M12 7.5v5.5M12 16.5h.01" />
      </svg>
      <span>{friendlyError(t, error)}</span>
    </p>
  );
}
