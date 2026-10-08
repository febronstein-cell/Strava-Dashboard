import type { SportKey } from "@/site.config";

/** Seconds per unit -> "5:12". Language-neutral. */
export function clock(totalSeconds: number): string {
  const s = Math.round(totalSeconds);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

/** 5025s -> "1h 23m"; 2700s -> "45m". Language-neutral. */
export function duration(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.round((seconds % 3600) / 60);
  if (h === 0) return `${m}m`;
  return `${h}h ${String(m).padStart(2, "0")}m`;
}

/** "08:15" from a local ISO time. */
export const timeOfDay = (iso: string) => iso.slice(11, 16);

/** Formatters bound to a locale (numbers and dates follow the chosen language). */
export function makeFormat(locale: string) {
  const cache = new Map<number, Intl.NumberFormat>();
  const nf = (d: number) => {
    let f = cache.get(d);
    if (!f) {
      f = new Intl.NumberFormat(locale, { minimumFractionDigits: d, maximumFractionDigits: d });
      cache.set(d, f);
    }
    return f;
  };
  /** Up to `d` decimals, no trailing zeros. */
  const num = (v: number, d = 0) => new Intl.NumberFormat(locale, { maximumFractionDigits: d }).format(v);

  const km = (meters: number, digits = 1) => nf(digits).format(meters / 1000);
  const int = (n: number) => nf(0).format(Math.round(n));
  const meters = (m: number) => nf(0).format(Math.round(m));
  const hours = (seconds: number, digits = 0) => nf(digits).format(seconds / 3600);

  /** Average speed (m/s) in each sport's usual unit. */
  function pace(sport: SportKey, metersPerSecond: number): { value: string; unit: string } {
    if (sport === "strength" || sport === "other" || !metersPerSecond || !isFinite(metersPerSecond)) {
      return { value: "—", unit: "" };
    }
    if (sport === "ride") return { value: nf(1).format(metersPerSecond * 3.6), unit: "km/h" };
    if (sport === "swim") return { value: clock(100 / metersPerSecond), unit: "/100m" };
    return { value: clock(1000 / metersPerSecond), unit: "/km" };
  }

  /** `iso` is local time without a zone: format it as UTC so the day never shifts. */
  function dateLabel(iso: string, opts: Intl.DateTimeFormatOptions = { day: "2-digit", month: "short" }) {
    return new Intl.DateTimeFormat(locale, { ...opts, timeZone: "UTC" })
      .format(new Date(iso + "Z"))
      .replace(".", "");
  }

  return { nf, num, km, int, meters, hours, pace, dateLabel, clock, duration, timeOfDay };
}

export type Fmt = ReturnType<typeof makeFormat>;
