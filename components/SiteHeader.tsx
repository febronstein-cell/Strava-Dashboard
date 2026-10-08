"use client";

import { siteConfig, type SectionId } from "@/site.config";
import type { DashboardContext } from "@/lib/dashboard";
import type { Period } from "@/lib/stats";
import { useNow } from "@/lib/use-now";
import { ThemeToggle } from "./ThemeToggle";

function syncLabel(ms: number): string {
  const min = Math.max(0, Math.round(ms / 60_000));
  if (min < 1) return "agora";
  if (min < 60) return `há ${min} min`;
  const h = Math.floor(min / 60);
  if (h < 24) return `há ${h} h`;
  return `há ${Math.floor(h / 24)} d`;
}

export function SiteHeader({
  ctx,
  period,
  onPeriod,
  sections,
}: {
  ctx: DashboardContext;
  period: Period;
  onPeriod: (p: Period) => void;
  sections: SectionId[];
}) {
  const synced = new Date(ctx.overview.fetchedAt).getTime();
  const now = useNow(synced);
  const [first, ...rest] = ctx.overview.athlete.name.split(" ");
  const brand = siteConfig.shortName || (rest.length ? `${first} ${rest.at(-1)![0]}.` : first);
  const links = sections.filter((id) => siteConfig.nav[id]);
  const pills: { value: Period; label: string }[] = [
    { value: "all", label: "Todos" },
    ...[...ctx.years].reverse().map((y) => ({ value: y as Period, label: String(y) })),
  ];

  return (
    <div className="sticky top-0 z-40 border-b border-line bg-bg/80 backdrop-blur-xl">
      <div className="mx-auto flex w-full max-w-6xl items-center justify-between gap-4 px-5 py-3 sm:px-8">
        <a href="#topo" className="num shrink-0 whitespace-nowrap text-2xl uppercase tracking-wide text-brand">
          {brand}
        </a>

        <nav aria-label="Seções" className="hidden items-center gap-6 lg:flex">
          {links.map((id) => (
            <a key={id} href={`#${id}`} className="label transition-colors hover:text-fg">
              {siteConfig.nav[id]}
            </a>
          ))}
        </nav>

        <div className="flex items-center gap-3">
          <span className="label hidden items-center gap-2 whitespace-nowrap sm:inline-flex" title={`Última sincronização: ${new Date(synced).toLocaleString(siteConfig.locale)}`}>
            <span className="relative flex size-2">
              <span className="absolute inline-flex size-full animate-ping rounded-full bg-brand opacity-60" />
              <span className="relative inline-flex size-2 rounded-full bg-brand" />
            </span>
            {ctx.isDemo ? "Demonstração" : `Sync ${syncLabel(now - synced)}`}
          </span>
          <ThemeToggle />
        </div>
      </div>

      {/* Seletor de período + menu rolável no celular */}
      <div className="mx-auto flex w-full max-w-6xl items-center gap-3 px-5 pb-3 sm:px-8">
        <span className="label hidden shrink-0 sm:block">Período</span>
        <div role="tablist" aria-label="Período" className="flex gap-1.5 overflow-x-auto pb-0.5 [scrollbar-width:none]">
          {pills.map((p) => (
            <button
              key={String(p.value)}
              role="tab"
              aria-selected={period === p.value}
              onClick={() => onPeriod(p.value)}
              className={`label shrink-0 rounded-full border px-3.5 py-1.5 transition-colors ${
                period === p.value ? "border-fg bg-fg text-bg" : "border-line hover:text-fg"
              }`}
            >
              {p.label}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
