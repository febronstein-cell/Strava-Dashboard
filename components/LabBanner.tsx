"use client";

import Link from "next/link";
import { useI18n } from "@/lib/i18n";

/** Slim strip at the top of the page, phones only: a quiet pointer to the Lab. */
export function LabBanner() {
  const { t } = useI18n();
  return (
    <div className="px-4 pt-3 sm:hidden">
      <Link
        href="/lab"
        className="flex items-center justify-between gap-3 rounded-2xl border border-brand/50 bg-elev px-4 py-2.5 transition-colors active:bg-soft"
      >
        <span className="flex min-w-0 items-center gap-2.5">
          <span className="relative flex size-2 shrink-0">
            <span className="absolute inline-flex size-full animate-ping rounded-full bg-brand opacity-60" />
            <span className="relative inline-flex size-2 rounded-full bg-brand" />
          </span>
          <span className="num shrink-0 text-xl uppercase leading-none">{t("The Lab")}</span>
          <span className="label truncate text-[0.58rem] text-muted">{t("Thresholds, load and race builds")}</span>
        </span>
        <span className="num shrink-0 text-2xl leading-none text-brand">→</span>
      </Link>
    </div>
  );
}
