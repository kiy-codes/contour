import type { LngLat } from "../providers/types";

const EARTH_RADIUS_M = 6371000;

function toRad(deg: number): number {
  return (deg * Math.PI) / 180;
}

/** Great-circle distance between two points, in meters. */
export function haversineDistance(a: LngLat, b: LngLat): number {
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_RADIUS_M * Math.asin(Math.sqrt(h));
}

/** Total length of a polyline, in meters. */
export function pathLength(points: LngLat[]): number {
  let total = 0;
  for (let i = 1; i < points.length; i++) {
    total += haversineDistance(points[i - 1], points[i]);
  }
  return total;
}

/** Bounding box of a set of points as [west, south, east, north], or null
 * for an empty list — used to frame a route/track in view (e.g. after
 * importing a GPX file, or "return to route"). */
export function boundsOf(points: LngLat[]): [number, number, number, number] | null {
  if (points.length === 0) return null;
  let west = points[0].lng;
  let east = points[0].lng;
  let south = points[0].lat;
  let north = points[0].lat;
  for (const p of points) {
    if (p.lng < west) west = p.lng;
    if (p.lng > east) east = p.lng;
    if (p.lat < south) south = p.lat;
    if (p.lat > north) north = p.lat;
  }
  return [west, south, east, north];
}

/** Evenly-spaced points along a polyline (linear interpolation between
 * vertices), used to build an elevation profile for routes that don't
 * already carry dense geometry (manual/straight-line mode). */
export function resampleLine(points: LngLat[], sampleCount: number): LngLat[] {
  if (points.length < 2 || sampleCount < 2) return points;

  const segLengths = points.slice(1).map((p, i) => haversineDistance(points[i], p));
  const total = segLengths.reduce((a, b) => a + b, 0);
  if (total === 0) return [points[0]];

  const samples: LngLat[] = [];
  for (let i = 0; i < sampleCount; i++) {
    const targetDist = (i / (sampleCount - 1)) * total;
    let covered = 0;
    let segIndex = 0;
    while (segIndex < segLengths.length - 1 && covered + segLengths[segIndex] < targetDist) {
      covered += segLengths[segIndex];
      segIndex++;
    }
    const segLen = segLengths[segIndex] || 1;
    const t = Math.max(0, Math.min(1, (targetDist - covered) / segLen));
    const a = points[segIndex];
    const b = points[segIndex + 1];
    samples.push({ lng: a.lng + (b.lng - a.lng) * t, lat: a.lat + (b.lat - a.lat) * t });
  }
  return samples;
}
