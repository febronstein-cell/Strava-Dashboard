"use client";

import { siteConfig } from "@/site.config";
import { useI18n } from "@/lib/i18n";

export function SiteFooter({ fetchedAt, athleteId }: { fetchedAt: string; athleteId?: number }) {
  const { t, locale } = useI18n();
  const profileUrl =
    siteConfig.stravaProfileUrl || (athleteId ? `https://www.strava.com/athletes/${athleteId}` : "https://www.strava.com");
  const c = siteConfig.credits;
  const cols = [
    { title: t("Built with"), items: c.builtWith },
    { title: t("Maps"), items: c.maps },
    { title: t("Data"), items: c.data },
    { title: t("Fonts"), items: c.fonts },
  ];
  return (
    <footer className="mx-auto w-full max-w-6xl px-5 pt-10 pb-14 sm:px-8">
      <div className="grid gap-8 border-t border-line pt-8 sm:grid-cols-2 lg:grid-cols-4">
        {cols.map((col) => (
          <div key={col.title}>
            <p className="label">{col.title}</p>
            <ul className="mt-3 space-y-1.5 text-sm text-muted">
              {col.items.map((i) => (
                <li key={i}>{i}</li>
              ))}
            </ul>
          </div>
        ))}
      </div>

      <div className="label mt-12 flex flex-wrap items-center justify-between gap-4 border-t border-line pt-6">
        <span>
          {t("Made by")} <span className="text-fg">{siteConfig.madeBy}</span>
          {siteConfig.handle && <span className="text-brand"> · @{siteConfig.handle}</span>}
        </span>
        <span suppressHydrationWarning>
          {t("Updated")}{" "}
          {new Intl.DateTimeFormat(locale, {
            dateStyle: "medium",
            timeStyle: "short",
            timeZone: "America/Sao_Paulo",
          }).format(new Date(fetchedAt))}
        </span>
        <span>Powered by Strava</span>
      </div>

      <a
        href={profileUrl}
        target="_blank"
        rel="noreferrer"
        className="group mt-12 flex flex-wrap items-center justify-between gap-4 rounded-[var(--radius)] border border-line bg-elev px-6 py-6 transition-colors hover:border-[#fc4c02] sm:px-8"
      >
        <span className="min-w-0">
          <span className="label block">{t("Follow me on Strava")}</span>
          <span className="num mt-2 block text-4xl uppercase sm:text-5xl">{siteConfig.nickname || siteConfig.madeBy}</span>
          {siteConfig.handle && <span className="label mt-2 block">@{siteConfig.handle}</span>}
        </span>
        <span className="num text-3xl text-[#fc4c02] transition-transform group-hover:translate-x-1">{t("View profile")} ↗</span>
      </a>
    </footer>
  );
}
