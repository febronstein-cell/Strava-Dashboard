import "server-only";
import { siteConfig } from "@/site.config";
import { decimate, decodePolyline, encodePolyline, trimAroundHome, type LatLng } from "@/lib/geo";

/** Max points per route sent to the map. */
const MAX_POINTS = 60;

/**
 * Turns Strava's route polyline into the light version used on the map:
 * hides the stretch around home (if configured) and keeps at most 60 points.
 * Returns null when there is nothing left to draw.
 */
export function simplifyRoute(polyline: string): { line: string; lat: number; lng: number } | null {
  let points: LatLng[] = decodePolyline(polyline);
  const { home, radiusKm } = siteConfig.geo.privacy;
  if (home) points = trimAroundHome(points, [home.lat, home.lng], radiusKm);
  if (points.length < 2) return null;
  const [lat, lng] = points[0];
  return {
    line: encodePolyline(decimate(points, MAX_POINTS)),
    lat: Math.round(lat * 1e4) / 1e4,
    lng: Math.round(lng * 1e4) / 1e4,
  };
}
