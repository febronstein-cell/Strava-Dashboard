"use client";

import Link from "next/link";
import { useI18n } from "@/lib/i18n";

/**
 * Floating "Lab" button, phones only: it stays at the bottom of the screen the whole time the dashboard
 * is open, so the Lab is always one tap away (the top bar has no room for the full name on a phone).
 */
export function LabFab() {
  const { t } = useI18n();
  return (
    <Link
      href="/lab"
      aria-label={t("Open the Lab")}
      className="fixed bottom-4 right-4 z-40 inline-flex items-center gap-2.5 rounded-full bg-brand px-5 py-3.5 text-bg shadow-[0_8px_30px_rgba(0,0,0,0.45)] transition-transform active:scale-95 sm:hidden"
      style={{ marginBottom: "env(safe-area-inset-bottom)" }}
    >
      <span className="relative flex size-2.5">
        <span className="absolute inline-flex size-full animate-ping rounded-full bg-bg opacity-60" />
        <span className="relative inline-flex size-2.5 rounded-full bg-bg" />
      </span>
      <span className="num text-xl uppercase leading-none tracking-wide">{t("Lab")}</span>
      <span aria-hidden className="num text-xl leading-none">→</span>
    </Link>
  );
}
