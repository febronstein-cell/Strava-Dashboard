import { getWeatherSummary } from "@/lib/strava/weather-summary";

export const maxDuration = 60;

/** Temperatura e condições do tempo nos seus treinos. Carregado só quando os gráficos aparecem. */
export async function GET() {
  return Response.json(await getWeatherSummary());
}
