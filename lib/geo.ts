/** Utilidades geográficas (isomórficas: rodam no servidor e no navegador). */

export type LatLng = [number, number];

export function decodePolyline(str: string): LatLng[] {
  let index = 0;
  let lat = 0;
  let lng = 0;
  const out: LatLng[] = [];
  while (index < str.length) {
    let b: number;
    let shift = 0;
    let result = 0;
    do {
      b = str.charCodeAt(index++) - 63;
      result |= (b & 0x1f) << shift;
      shift += 5;
    } while (b >= 0x20);
    lat += result & 1 ? ~(result >> 1) : result >> 1;
    shift = 0;
    result = 0;
    do {
      b = str.charCodeAt(index++) - 63;
      result |= (b & 0x1f) << shift;
      shift += 5;
    } while (b >= 0x20);
    lng += result & 1 ? ~(result >> 1) : result >> 1;
    out.push([lat / 1e5, lng / 1e5]);
  }
  return out;
}

function encodeNumber(num: number): string {
  let v = num < 0 ? ~(num << 1) : num << 1;
  let s = "";
  while (v >= 0x20) {
    s += String.fromCharCode((0x20 | (v & 0x1f)) + 63);
    v >>= 5;
  }
  return s + String.fromCharCode(v + 63);
}

export function encodePolyline(points: LatLng[]): string {
  let prevLat = 0;
  let prevLng = 0;
  let out = "";
  for (const [la, ln] of points) {
    const lat = Math.round(la * 1e5);
    const lng = Math.round(ln * 1e5);
    out += encodeNumber(lat - prevLat) + encodeNumber(lng - prevLng);
    prevLat = lat;
    prevLng = lng;
  }
  return out;
}

export function haversineKm(a: LatLng, b: LatLng): number {
  const R = 6371;
  const rad = (d: number) => (d * Math.PI) / 180;
  const dLat = rad(b[0] - a[0]);
  const dLng = rad(b[1] - a[1]);
  const h =
    Math.sin(dLat / 2) ** 2 + Math.cos(rad(a[0])) * Math.cos(rad(b[0])) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

/** Reduz a quantidade de pontos (passo fixo), mantendo o último. */
export function decimate(points: LatLng[], max: number): LatLng[] {
  if (points.length <= max) return points;
  const step = (points.length - 1) / (max - 1);
  const out: LatLng[] = [];
  for (let i = 0; i < max; i++) out.push(points[Math.round(i * step)]);
  return out;
}

/** Corta o começo e o fim do trajeto que ficam dentro do raio de `home`. */
export function trimAroundHome(points: LatLng[], home: LatLng, radiusKm: number): LatLng[] {
  let start = 0;
  let end = points.length;
  while (start < end && haversineKm(points[start], home) < radiusKm) start++;
  while (end > start && haversineKm(points[end - 1], home) < radiusKm) end--;
  return points.slice(start, end);
}

export interface Place {
  lat: number;
  lng: number;
  count: number;
  firstDate: string;
  lastDate: string;
  name?: string;
  country?: string;
  countryCode?: string;
}

/** Agrupa pontos de partida em células de ~`cell` graus (≈ 0,1° ≈ 11 km). */
export function clusterPlaces(
  items: { lat: number; lng: number; date: string }[],
  cell = 0.1,
): Place[] {
  const groups = new Map<string, { sumLat: number; sumLng: number; count: number; first: string; last: string }>();
  for (const it of items) {
    const key = `${Math.round(it.lat / cell)}:${Math.round(it.lng / cell)}`;
    const g = groups.get(key) ?? { sumLat: 0, sumLng: 0, count: 0, first: it.date, last: it.date };
    g.sumLat += it.lat;
    g.sumLng += it.lng;
    g.count++;
    if (it.date < g.first) g.first = it.date;
    if (it.date > g.last) g.last = it.date;
    groups.set(key, g);
  }
  return [...groups.values()]
    .map((g) => ({
      lat: g.sumLat / g.count,
      lng: g.sumLng / g.count,
      count: g.count,
      firstDate: g.first.slice(0, 10),
      lastDate: g.last.slice(0, 10),
    }))
    .sort((a, b) => b.count - a.count);
}
