"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useSyncExternalStore, type ReactNode } from "react";
import { siteConfig } from "@/site.config";
import { makeFormat, type Fmt } from "@/lib/format";
import { translate, type Lang } from "./translate";

const LOCALES: Record<Lang, string> = { en: "en-US", pt: "pt-BR" };
const STORAGE_KEY = "lang";
const EVENT = "lang-change";

export { translate };
export type { Lang };

type Ctx = {
  lang: Lang;
  locale: string;
  setLang: (l: Lang) => void;
  t: (key: string, vars?: Record<string, string | number>) => string;
  fmt: Fmt;
};
const I18nContext = createContext<Ctx | null>(null);

const subscribe = (cb: () => void) => {
  window.addEventListener(EVENT, cb);
  window.addEventListener("storage", cb);
  return () => {
    window.removeEventListener(EVENT, cb);
    window.removeEventListener("storage", cb);
  };
};
const readLang = (): Lang => {
  try {
    const v = localStorage.getItem(STORAGE_KEY);
    if (v === "en" || v === "pt") return v;
  } catch {}
  return siteConfig.defaultLang;
};

export function LanguageProvider({ children }: { children: ReactNode }) {
  // server and first client render use the default language; then the saved choice applies
  const lang = useSyncExternalStore(subscribe, readLang, () => siteConfig.defaultLang);
  const locale = LOCALES[lang];

  const setLang = useCallback((l: Lang) => {
    try {
      localStorage.setItem(STORAGE_KEY, l);
    } catch {}
    window.dispatchEvent(new Event(EVENT));
  }, []);

  useEffect(() => {
    document.documentElement.lang = locale;
  }, [locale]);

  const value = useMemo<Ctx>(
    () => ({
      lang,
      locale,
      setLang,
      t: (key, vars) => translate(lang, key, vars),
      fmt: makeFormat(locale),
    }),
    [lang, locale, setLang],
  );
  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n(): Ctx {
  const ctx = useContext(I18nContext);
  if (!ctx) throw new Error("useI18n must be used inside <LanguageProvider>");
  return ctx;
}
