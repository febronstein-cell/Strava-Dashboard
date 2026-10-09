import { pt } from "./pt";

export type Lang = "en" | "pt";

/**
 * English is the source language: `translate("en", "Elapsed time")` returns the same text and
 * `translate("pt", ...)` the dictionary entry (falling back to English if one is missing).
 * Plurals: "one|other" picks by `vars.n`. Variables: "{name}". Works on the server and in the browser.
 */
export function translate(lang: Lang, key: string, vars?: Record<string, string | number>): string {
  let s = lang === "pt" ? (pt[key] ?? key) : key;
  if (vars) {
    if (s.includes("|") && typeof vars.n === "number") {
      const [one, other] = s.split("|");
      s = vars.n === 1 ? one : other;
    }
    s = s.replace(/\{(\w+)\}/g, (_, k: string) => String(vars[k] ?? ""));
  }
  return s;
}
