"use client";

import { useI18n } from "@/lib/i18n";

/** Share below which a category counts as "small" and can be hidden. */
export const SMALL_SHARE = 0.05;

/** Keeps only the items worth at least `share` of the total (used by the "hide small" filter). */
export function dropSmall<T>(items: T[], value: (item: T) => number, share = SMALL_SHARE): T[] {
  const total = items.reduce((s, i) => s + value(i), 0);
  if (total <= 0) return items;
  return items.filter((i) => value(i) / total >= share);
}

/** Switch used on mini charts: hides categories that are a tiny part of the whole. */
export function SmallToggle({
  on,
  onChange,
  label,
  share = SMALL_SHARE,
  hint,
}: {
  on: boolean;
  onChange: (v: boolean) => void;
  label?: string;
  /** what counts as small (fraction of the total) */
  share?: number;
  /** tooltip text (defaults to the percentage rule) */
  hint?: string;
}) {
  const { t } = useI18n();
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      onClick={() => onChange(!on)}
      className={`label inline-flex items-center gap-2 rounded-full border px-3 py-1.5 transition-colors ${
        on ? "border-fg bg-fg text-bg" : "border-line hover:text-fg"
      }`}
      title={hint ?? t("Hide categories under {x}% of the total", { x: Math.round(share * 100) })}
    >
      <span className={`inline-block h-2 w-3.5 rounded-full ${on ? "bg-bg" : "bg-line"}`} />
      {label ?? t("Hide small values")}
    </button>
  );
}
