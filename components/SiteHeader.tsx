"use client";

import { siteConfig, type SectionId } from "@/site.config";
import type { DashboardContext } from "@/lib/dashboard";
import { useI18n } from "@/lib/i18n";
import type { Period } from "@/lib/stats";
import { useNow } from "@/lib/use-now";
import { ThemeToggle } from "./ThemeToggle";

type Kind = "all" | "12w" | "custom" | number;
const kindOf = (p: Period): Kind => (typeof p === "number" ? p : typeof p === "string" ? p : "custom");

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
  const { t, lang, locale, setLang } = useI18n();
  const synced = new Date(ctx.overview.fetchedAt).getTime();
  const now = useNow(synced);
  const [first, ...rest] = ctx.overview.athlete.name.split(" ");
  const brand = siteConfig.shortName || (rest.length ? `${first} ${rest.at(-1)![0]}.` : first);
  const links = sections.filter((id) => siteConfig.nav[id]);
  const active = kindOf(period);

  const syncLabel = (ms: number): string => {
    const min = Math.max(0, Math.round(ms / 60_000));
    if (min < 1) return t("just now");
    if (min < 60) return t("{n} min ago", { n: min });
    const h = Math.floor(min / 60);
    if (h < 24) return t("{n} h ago", { n: h });
    return t("{n} d ago", { n: Math.floor(h / 24) });
  };

  const pills: { value: Kind; label: string }[] = [
    { value: "all", label: t("All time") },
    ...[...ctx.years].reverse().map((y) => ({ value: y as Kind, label: String(y) })),
    { value: "12w", label: t("Last 12 weeks") },
    { value: "custom", label: t("Custom") },
  ];

  const todayKey = ctx.today.toISOString().slice(0, 10);

  const pick = (k: Kind) => {
    if (k === "custom") {
      // starts with the last 30 days; the dates can be edited below
      const from = new Date(ctx.today.getTime() - 29 * 86_400_000).toISOString().slice(0, 10);
      onPeriod(typeof period === "object" ? period : { from, to: todayKey });
    } else onPeriod(k);
  };

  const custom = typeof period === "object" ? period : null;

  return (
    <div className="sticky top-0 z-40 border-b border-line bg-bg/80 backdrop-blur-xl">
      <div className="mx-auto flex w-full max-w-6xl items-center justify-between gap-4 px-5 py-3 sm:px-8">
        <a href="#topo" className="num shrink-0 whitespace-nowrap text-2xl uppercase tracking-wide text-brand">
          {brand}
        </a>

        <nav aria-label={t("Sections")} className="hidden items-center gap-5 xl:flex">
          {links.map((id) => (
            <a key={id} href={`#${id}`} className="label whitespace-nowrap transition-colors hover:text-fg">
              {t(siteConfig.nav[id]!)}
            </a>
          ))}
        </nav>

        <div className="flex items-center gap-2 sm:gap-3">
          <span
            className="label hidden items-center gap-2 whitespace-nowrap md:inline-flex"
            title={t("Last sync: {when}", { when: new Date(synced).toLocaleString(locale) })}
          >
            <span className="relative flex size-2">
              <span className="absolute inline-flex size-full animate-ping rounded-full bg-brand opacity-60" />
              <span className="relative inline-flex size-2 rounded-full bg-brand" />
            </span>
            {ctx.isDemo ? t("Demo") : t("Sync {when}", { when: syncLabel(now - synced) })}
          </span>

          <div role="group" aria-label={t("Language")} className="label flex rounded-full border border-line p-0.5">
            {(["en", "pt"] as const).map((l) => (
              <button
                key={l}
                onClick={() => setLang(l)}
                aria-pressed={lang === l}
                className={`rounded-full px-2.5 py-1.5 transition-colors ${lang === l ? "bg-fg text-bg" : "hover:text-fg"}`}
              >
                {l.toUpperCase()}
              </button>
            ))}
          </div>
          <ThemeToggle />
        </div>
      </div>

      {/* period selector */}
      <div className="mx-auto flex w-full max-w-6xl items-center gap-3 px-5 pb-3 sm:px-8">
        <span className="label hidden shrink-0 sm:block">{t("Period")}</span>
        <div role="tablist" aria-label={t("Period")} className="flex gap-1.5 overflow-x-auto pb-0.5 [scrollbar-width:none]">
          {pills.map((p) => (
            <button
              key={String(p.value)}
              role="tab"
              aria-selected={active === p.value}
              onClick={() => pick(p.value)}
              className={`label shrink-0 rounded-full border px-3.5 py-1.5 transition-colors ${
                active === p.value ? "border-fg bg-fg text-bg" : "border-line hover:text-fg"
              }`}
            >
              {p.label}
            </button>
          ))}
        </div>
      </div>

      {custom && (
        <div className="mx-auto flex w-full max-w-6xl flex-wrap items-center gap-3 px-5 pb-3 sm:px-8">
          <label className="label flex items-center gap-2">
            {t("From")}
            <input
              type="date"
              value={custom.from}
              max={custom.to}
              min={`${ctx.firstYear}-01-01`}
              onChange={(e) => e.target.value && onPeriod({ from: e.target.value, to: custom.to })}
              className="rounded-full border border-line bg-elev px-3 py-1.5 text-fg"
            />
          </label>
          <label className="label flex items-center gap-2">
            {t("To")}
            <input
              type="date"
              value={custom.to}
              min={custom.from}
              max={todayKey}
              onChange={(e) => e.target.value && onPeriod({ from: custom.from, to: e.target.value })}
              className="rounded-full border border-line bg-elev px-3 py-1.5 text-fg"
            />
          </label>
        </div>
      )}
    </div>
  );
}
