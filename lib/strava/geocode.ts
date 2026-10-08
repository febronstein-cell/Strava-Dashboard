import { cacheLife } from "next/cache";

export interface GeoName {
  name: string;
  country?: string;
  countryCode?: string;
}

/**
 * Nome da cidade para uma coordenada (Nominatim / OpenStreetMap).
 * Resultado fica em cache por muito tempo: um lugar não muda de nome.
 * Lança erro se falhar, para a falha NÃO ficar guardada em cache.
 */
export async function reverseGeocode(lat: number, lng: number): Promise<GeoName> {
  "use cache: remote";
  cacheLife("max");

  const url = `https://nominatim.openstreetmap.org/reverse?format=jsonv2&zoom=10&accept-language=pt-BR&lat=${lat}&lon=${lng}`;
  const res = await fetch(url, {
    headers: { "User-Agent": "strava-dashboard-personal-site/1.0 (personal project)" },
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`Nominatim ${res.status}`);
  const j = (await res.json()) as {
    name?: string;
    address?: Record<string, string>;
  };
  const a = j.address ?? {};
  const name = a.city || a.town || a.village || a.municipality || a.county || a.state || j.name || "Local";
  return { name, country: a.country, countryCode: a.country_code?.toUpperCase() };
}
