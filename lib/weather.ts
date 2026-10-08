/** Temperature bands and weather conditions (isomorphic). */

export const TEMP_BANDS = [
  { id: "muito-frio", label: "Very cold", range: "< 10°", max: 10 },
  { id: "frio", label: "Cold", range: "10–15°", max: 15 },
  { id: "fresco", label: "Cool", range: "15–20°", max: 20 },
  { id: "agradavel", label: "Mild", range: "20–25°", max: 25 },
  { id: "quente", label: "Warm", range: "25–30°", max: 30 },
  { id: "muito-quente", label: "Hot", range: "30–35°", max: 35 },
  { id: "extremo", label: "Very hot", range: "> 35°", max: Infinity },
] as const;

export const CONDITIONS = [
  { id: "limpo", label: "Clear sky" },
  { id: "nublado", label: "Cloudy" },
  { id: "neblina", label: "Fog" },
  { id: "garoa", label: "Drizzle" },
  { id: "chuva", label: "Rain" },
  { id: "trovoada", label: "Thunderstorm" },
  { id: "neve", label: "Snow" },
] as const;

export const bandOf = (tempC: number): number => TEMP_BANDS.findIndex((b) => tempC < b.max);

/** Código WMO (Open-Meteo) -> id da condição. */
export function conditionOf(code: number): (typeof CONDITIONS)[number]["id"] {
  if (code <= 1) return "limpo";
  if (code <= 3) return "nublado";
  if (code === 45 || code === 48) return "neblina";
  if (code >= 51 && code <= 57) return "garoa";
  if (code >= 61 && code <= 67) return "chuva";
  if (code >= 80 && code <= 82) return "chuva";
  if (code >= 71 && code <= 77) return "neve";
  if (code === 85 || code === 86) return "neve";
  if (code >= 95) return "trovoada";
  return "nublado";
}
