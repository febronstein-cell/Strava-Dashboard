import type { SportKey } from "@/site.config";
import { siteConfig } from "@/site.config";

const nf = (digits: number) =>
  new Intl.NumberFormat(siteConfig.locale, { minimumFractionDigits: digits, maximumFractionDigits: digits });

export const km = (meters: number, digits = 1) => nf(digits).format(meters / 1000);
export const int = (n: number) => nf(0).format(Math.round(n));
export const meters = (m: number) => nf(0).format(Math.round(m));

/** 5025s -> "1h 23m"; 2700s -> "45m" */
export function duration(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.round((seconds % 3600) / 60);
  if (h === 0) return `${m}m`;
  return `${h}h ${String(m).padStart(2, "0")}m`;
}

export const hours = (seconds: number, digits = 0) => nf(digits).format(seconds / 3600);

/** Segundos por unidade -> "5:12" */
export function clock(totalSeconds: number): string {
  const s = Math.round(totalSeconds);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

/** Velocidade média (m/s) formatada no padrão de cada modalidade. */
export function pace(sport: SportKey, metersPerSecond: number): { value: string; unit: string } {
  if (sport === "strength" || !metersPerSecond || !isFinite(metersPerSecond)) return { value: "—", unit: "" };
  if (sport === "ride") {
    return { value: nf(1).format(metersPerSecond * 3.6), unit: "km/h" };
  }
  if (sport === "swim") {
    return { value: clock(100 / metersPerSecond), unit: "/100m" };
  }
  return { value: clock(1000 / metersPerSecond), unit: "/km" };
}

export function dateLabel(iso: string, opts: Intl.DateTimeFormatOptions = { day: "2-digit", month: "short" }) {
  // `iso` é horário local sem fuso: tratamos como UTC só para formatar sem deslocar o dia.
  return new Intl.DateTimeFormat(siteConfig.locale, { ...opts, timeZone: "UTC" })
    .format(new Date(iso + "Z"))
    .replace(".", "");
}

/** "08:15" a partir do horário local ISO. */
export const timeOfDay = (iso: string) => iso.slice(11, 16);

/** Horas decimais -> "1.234h" */
export const hoursInt = (seconds: number) => nf(0).format(Math.round(seconds / 3600));
