import { Fragment } from "react";
import { siteConfig } from "@/site.config";
import { buildContext } from "@/lib/dashboard";
import { getStravaData } from "@/lib/strava/get-data";
import { sectionRegistry } from "@/components/sections/registry";

export default async function Page() {
  const data = await getStravaData(); // cacheado: revalida a cada 1h
  const ctx = buildContext(data);

  return (
    <>
      <main className="flex-1">
        {siteConfig.sections
          .filter((s) => s.enabled)
          .map((s) => (
            <Fragment key={s.id}>{sectionRegistry[s.id](ctx)}</Fragment>
          ))}
      </main>

      <footer className="mx-auto w-full max-w-6xl px-5 py-12 sm:px-8">
        <div className="label flex flex-wrap items-center justify-between gap-4 border-t border-line pt-6">
          <span>
            Atualizado em{" "}
            {new Intl.DateTimeFormat(siteConfig.locale, { dateStyle: "medium", timeStyle: "short", timeZone: "America/Sao_Paulo" }).format(
              new Date(data.fetchedAt),
            )}
          </span>
          <a
            href={siteConfig.stravaProfileUrl || "https://www.strava.com"}
            target="_blank"
            rel="noreferrer"
            className="transition-colors hover:text-fg"
          >
            Powered by Strava
          </a>
        </div>
      </footer>
    </>
  );
}
