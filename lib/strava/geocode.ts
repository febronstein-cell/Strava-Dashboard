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

  const url = `https://nominatim.openstreetmap.org/reverse?format=jsonv2&zoom=10&accept-language=en&lat=${lat}&lon=${lng}`;
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
  // administrative districts ("Improvement District No. 9") are not place names: fall back to the state
  const county = a.county && !/improvement district|municipal district|regional municipality|specialized municipality/i.test(a.county) ? a.county : undefined;
  const name = a.city || a.town || a.village || a.municipality || county || a.state || j.name || "Local";
  return { name, country: a.country, countryCode: a.country_code?.toUpperCase() };
}
