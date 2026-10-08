import type { ReactNode } from "react";

/** Moldura padrão dos gráficos: título, legenda curta e insight em destaque. */
export function ChartCard({
  title,
  subtitle,
  insight,
  hint,
  children,
}: {
  title: string;
  subtitle?: string;
  insight?: string;
  hint?: string;
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
      </div>
      {children}
    </div>
  );
}
