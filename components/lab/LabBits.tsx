"use client";

import type { ReactNode } from "react";
import { useI18n } from "@/lib/i18n";
import type { Metric } from "@/lib/lab/profile";

/** Shows where a number comes from, so an estimate is never mistaken for a test. */
export function SourceBadge({ m }: { m: Metric }) {
  const { t, fmt } = useI18n();
  const label =
    m.source === "test"
      ? m.date
        ? t("Tested {date}", { date: fmt.dateLabel(`${m.date}T00:00:00`, { day: "2-digit", month: "short", year: "numeric" }) })
        : t("Tested")
      : m.source === "estimated"
        ? t("Estimated")
        : t("From your zones");
  const cls = m.source === "test" ? "border-brand text-brand" : "border-line text-muted";
  return (
    <span title={m.how ? t(m.how) : undefined} className={`label inline-block rounded-full border px-2.5 py-1 text-[0.6rem] ${cls}`}>
      {label}
    </span>
  );
}

export function Stat({
  label,
  value,
  unit,
  sub,
  badge,
  accent,
}: {
  label: string;
  value: ReactNode;
  unit?: string;
  sub?: ReactNode;
  badge?: ReactNode;
  accent?: string;
}) {
  return (
    <div className="card p-4 sm:p-5">
      <div className="flex items-start justify-between gap-2">
        <p className="label">{label}</p>
        {badge}
      </div>
      <p className="num mt-3 text-4xl" style={accent ? { color: accent } : undefined}>
        {value}
        {unit && <span className="ml-1.5 text-lg text-muted">{unit}</span>}
      </p>
      {sub && <p className="mt-1.5 text-sm text-muted">{sub}</p>}
    </div>
  );
}

export function Panel({
  title,
  subtitle,
  aside,
  children,
}: {
  title: string;
  subtitle?: string;
  aside?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="card p-5 sm:p-7">
      <div className="mb-5 flex flex-wrap items-baseline justify-between gap-x-4 gap-y-2">
        <div>
          <h3 className="num text-2xl uppercase sm:text-3xl">{title}</h3>
          {subtitle && <p className="mt-1.5 max-w-2xl text-sm text-muted">{subtitle}</p>}
        </div>
        {aside}
      </div>
      {children}
    </div>
  );
}

export function Hint({ children }: { children: ReactNode }) {
  return <p className="rounded-xl border border-dashed border-line px-4 py-3 text-sm text-muted">{children}</p>;
}

export function Pills<T extends string | number>({
  value,
  options,
  onChange,
}: {
  value: T;
  options: { value: T; label: string }[];
  onChange: (v: T) => void;
}) {
  return (
    <div role="tablist" className="flex flex-wrap gap-1.5">
      {options.map((o) => (
        <button
          key={String(o.value)}
          role="tab"
          aria-selected={value === o.value}
          onClick={() => onChange(o.value)}
          className={`label rounded-full border px-3.5 py-1.5 transition-colors ${
            value === o.value ? "border-fg bg-fg text-bg" : "border-line hover:text-fg"
          }`}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}
