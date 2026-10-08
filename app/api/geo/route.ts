import { getGeoSummary } from "@/lib/strava/geo-summary";

export const maxDuration = 60;

/** Trajetos + lugares para o mapa. Carregado só quando a seção Geografia aparece. */
export async function GET() {
  return Response.json(await getGeoSummary());
}
