"use client";

import { useSyncExternalStore } from "react";
import { useI18n } from "@/lib/i18n";

const subscribe = (cb: () => void) => {
  const obs = new MutationObserver(cb);
  obs.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
  return () => obs.disconnect();
};
const getTheme = () => document.documentElement.dataset.theme ?? "dark";

export function ThemeToggle() {
  const { t } = useI18n();
  const theme = useSyncExternalStore(subscribe, getTheme, () => "dark");

  const toggle = () => {
    const next = theme === "dark" ? "light" : "dark";
    document.documentElement.dataset.theme = next;
    try {
      localStorage.setItem("theme", next);
    } catch {}
  };

  return (
    <button
      onClick={toggle}
      aria-label={theme === "dark" ? t("Switch to light mode") : t("Switch to dark mode")}
      className="label inline-flex h-9 items-center gap-2 rounded-full border border-line px-3 transition-colors hover:text-fg sm:px-4"
    >
      <span className="inline-block size-2.5 rounded-full bg-accent" />
      <span className="hidden sm:inline">{theme === "dark" ? t("Dark") : t("Light")}</span>
    </button>
  );
}
