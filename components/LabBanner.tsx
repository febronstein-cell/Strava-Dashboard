"use client";

import Link from "next/link";
import { useI18n } from "@/lib/i18n";

/** Card at the top of the page, phones only: the first thing a visitor sees points to the Lab. */
export function LabBanner() {
  const { t } = useI18n();
  return (
    <div className="px-4 pt-4 sm:hidden">
      <Link
        href="/lab"
        className="group relative block overflow-hidden rounded-3xl border border-brand/60 bg-elev p-5 transition-colors active:bg-soft"
      >
        <div aria-hidden className="pointer-events-none absolute -right-12 -top-12 size-44 rounded-full opacity-30 blur-3xl" style={{ background: "var(--brand)" }} />
        <div className="relative flex items-center justify-between gap-4">
          <div className="min-w-0">
            <p className="label flex items-center gap-2 text-brand">
              <span className="relative flex size-2">
                <span className="absolute inline-flex size-full animate-ping rounded-full bg-brand opacity-60" />
                <span className="relative inline-flex size-2 rounded-full bg-brand" />
              </span>
              {t("New")}
            </p>
            <p className="num mt-1.5 text-4xl uppercase leading-none">{t("The Lab")}</p>
            <p className="mt-2 text-sm text-muted">{t("Thresholds, fitness and fatigue, race builds and a reading of every workout.")}</p>
          </div>
          <span className="num shrink-0 text-5xl leading-none text-brand transition-transform group-active:translate-x-1">→</span>
        </div>
      </Link>
    </div>
  );
}
