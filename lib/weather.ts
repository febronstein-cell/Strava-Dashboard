/** Faixas de temperatura e condições do tempo (isomórfico). */

export const TEMP_BANDS = [
  { id: "muito-frio", label: "Muito frio", range: "< 10°", max: 10 },
  { id: "frio", label: "Frio", range: "10–15°", max: 15 },
  { id: "fresco", label: "Fresco", range: "15–20°", max: 20 },
  { id: "agradavel", label: "Agradável", range: "20–25°", max: 25 },
  { id: "quente", label: "Quente", range: "25–30°", max: 30 },
  { id: "muito-quente", label: "Muito quente", range: "30–35°", max: 35 },
  { id: "extremo", label: "Calor extremo", range: "> 35°", max: Infinity },
] as const;

export const CONDITIONS = [
  { id: "limpo", label: "Céu limpo" },
  { id: "nublado", label: "Nublado" },
  { id: "neblina", label: "Neblina" },
  { id: "garoa", label: "Garoa" },
  { id: "chuva", label: "Chuva" },
  { id: "trovoada", label: "Trovoada" },
  { id: "neve", label: "Neve" },
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
