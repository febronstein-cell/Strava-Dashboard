import type { ReactNode } from "react";

/** Standard frame of the charts: title, short caption, highlighted insight and an optional controls row. */
export function ChartCard({
  title,
  subtitle,
  insight,
  hint,
  controls,
  children,
}: {
  title: string;
  subtitle?: string;
  insight?: string;
  hint?: string;
  /** filters shown under the header (sport chips, "hide small values"...) */
  controls?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="card h-full p-5 sm:p-7">
      <div className="mb-5">
        <div className="flex flex-wrap items-baseline justify-between gap-x-4">
          <h3 className="num text-2xl uppercase sm:text-3xl">{title}</h3>
          <p className="label">
            {hint && <span className="mr-3">{hint}</span>}
            {insight && <span className="text-brand">{insight}</span>}
          </p>
        </div>
        {subtitle && <p className="mt-1.5 text-sm text-muted">{subtitle}</p>}
        {controls && <div className="mt-3 flex flex-wrap items-center gap-2">{controls}</div>}
      </div>
      {children}
    </div>
  );
}
