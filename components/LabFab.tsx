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
      className="fixed bottom-3 right-3 z-40 inline-flex items-center gap-2 rounded-full bg-brand px-4 py-2.5 text-bg shadow-[0_6px_20px_rgba(0,0,0,0.4)] transition-transform active:scale-95 sm:hidden"
      style={{ marginBottom: "env(safe-area-inset-bottom)" }}
    >
      <span className="relative flex size-2">
        <span className="absolute inline-flex size-full animate-ping rounded-full bg-bg opacity-60" />
        <span className="relative inline-flex size-2 rounded-full bg-bg" />
      </span>
      <span className="num text-lg uppercase leading-none tracking-wide">{t("Lab")}</span>
    </Link>
  );
}
