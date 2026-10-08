"use client";

import { useSyncExternalStore } from "react";
import { useI18n } from "@/lib/i18n";

type Theme = "dark" | "light" | "ocean";
const THEMES: Theme[] = ["dark", "light", "ocean"];
/** Swatch colors shown on the button. */
const SWATCH: Record<Theme, string> = { dark: "#0b0b0c", light: "#f4f1ea", ocean: "#0b3a5b" };

const subscribe = (cb: () => void) => {
  const obs = new MutationObserver(cb);
  obs.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
  return () => obs.disconnect();
};
const getTheme = (): Theme => {
  const v = document.documentElement.dataset.theme;
  return v === "light" || v === "ocean" ? v : "dark";
};

/** Cycles through the three themes: dark, light and ocean (deep blue). */
export function ThemeToggle() {
  const { t } = useI18n();
  const theme = useSyncExternalStore(subscribe, getTheme, () => "dark" as Theme);
  const label = { dark: t("Dark"), light: t("Light"), ocean: t("Ocean") }[theme];

  const next = () => {
    const n = THEMES[(THEMES.indexOf(theme) + 1) % THEMES.length];
    document.documentElement.dataset.theme = n;
    try {
      localStorage.setItem("theme", n);
    } catch {}
  };

  return (
    <button
      onClick={next}
      aria-label={t("Change theme (now: {theme})", { theme: label })}
      title={t("Change theme (now: {theme})", { theme: label })}
      className="label inline-flex h-9 items-center gap-2 rounded-full border border-line px-3 transition-colors hover:text-fg sm:px-4"
    >
      <span className="flex -space-x-1">
        {THEMES.map((th) => (
          <span
            key={th}
            className={`inline-block size-3.5 rounded-full border ${th === theme ? "border-fg" : "border-line opacity-60"}`}
            style={{ background: SWATCH[th] }}
          />
        ))}
      </span>
      <span className="hidden sm:inline">{label}</span>
    </button>
  );
}
