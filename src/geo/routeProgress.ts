// Live position-on-route math for navigation mode: projects the current GPS
// fix onto a planned route's polyline and derives distance/elevation
// remaining, distance already traveled, and off-route distance.
//
// Deliberately a separate implementation from nearestPointOnLine.ts rather
// than a shared one — that function serves a different call site (snap a
// dragged waypoint onto the nearest of many candidate OSM trail lines) and
// only needs the nearest point + distance. This needs the nearest point
// PLUS which segment it fell on and how far along that segment (the
// interpolation fraction), to turn a nearest-point projection into an
// arc-length-along-route figure. Same core per-segment projection idea,
// different, purpose-built return shape.
import type { LngLat, LngLatElevation } from "../providers/types";
import { haversineDistance } from "./distance";

export interface RouteProgress {
  projectedPoint: LngLat;
  segmentIndex: number;
  distanceTraveledMeters: number;
  distanceRemainingMeters: number;
  ascentRemainingMeters: number;
  descentRemainingMeters: number;
  offRouteDistanceMeters: number;
  isOffRoute: boolean;
}

/** Precomputed once per route (memoize on the route's points — recompute
 * only when the route itself changes, not on every GPS fix) so each live
 * position update is a cheap O(n) scan rather than re-summing the whole
 * route every time. */
export interface RouteProgressGeometry {
  points: LngLatElevation[];
  /** Cumulative meters from the start, one entry per point. */
  cumulativeDistance: number[];
  cumulativeAscent: number[];
  cumulativeDescent: number[];
  totalDistanceMeters: number;
  totalAscentMeters: number;
  totalDescentMeters: number;
}

export function prepareRouteProgressGeometry(points: LngLatElevation[]): RouteProgressGeometry {
  const cumulativeDistance = [0];
  const cumulativeAscent = [0];
  const cumulativeDescent = [0];
  for (let i = 1; i < points.length; i++) {
    cumulativeDistance.push(cumulativeDistance[i - 1] + haversineDistance(points[i - 1], points[i]));
    // Missing elevation on either endpoint of a segment (manual routes have
    // none at all) contributes zero gain/loss for that segment rather than
    // guessing — matches how ascent/descent are already computed elsewhere
    // in the app for routes without a real elevation source.
    const prevElev = points[i - 1].elevation;
    const curElev = points[i].elevation;
    const delta = prevElev !== undefined && curElev !== undefined ? curElev - prevElev : 0;
    cumulativeAscent.push(cumulativeAscent[i - 1] + Math.max(0, delta));
    cumulativeDescent.push(cumulativeDescent[i - 1] + Math.max(0, -delta));
  }
  const last = points.length - 1;
  return {
    points,
    cumulativeDistance,
    cumulativeAscent,
    cumulativeDescent,
    totalDistanceMeters: cumulativeDistance[last] ?? 0,
    totalAscentMeters: cumulativeAscent[last] ?? 0,
    totalDescentMeters: cumulativeDescent[last] ?? 0,
  };
}

// Same local equirectangular-meters approach as nearestPointOnLine.ts —
// accurate enough at route-following scale (meters to low hundreds of
// meters) without a full geodesic projection.
const METERS_PER_DEG_LAT = 110540;

function metersPerDegLng(atLat: number): number {
  return 111320 * Math.cos((atLat * Math.PI) / 180);
}

function toLocalMeters(p: LngLat, origin: LngLat): [number, number] {
  return [(p.lng - origin.lng) * metersPerDegLng(origin.lat), (p.lat - origin.lat) * METERS_PER_DEG_LAT];
}

function fromLocalMeters(xy: [number, number], origin: LngLat): LngLat {
  return {
    lng: origin.lng + xy[0] / metersPerDegLng(origin.lat),
    lat: origin.lat + xy[1] / METERS_PER_DEG_LAT,
  };
}

/** Nearest point on segment a-b to the origin (0,0), plus how far along the
 * segment it fell (0 = at a, 1 = at b) — the interpolation fraction needed
 * to turn "nearest segment" into "arc-length along the route". */
function nearestOnSegmentWithT(a: [number, number], b: [number, number]): { point: [number, number]; t: number } {
  const abx = b[0] - a[0];
  const aby = b[1] - a[1];
  const lenSq = abx * abx + aby * aby;
  if (lenSq === 0) return { point: a, t: 0 };
  let t = (-a[0] * abx + -a[1] * aby) / lenSq; // projecting the origin (0,0)
  t = Math.max(0, Math.min(1, t));
  return { point: [a[0] + t * abx, a[1] + t * aby], t };
}

const DEFAULT_OFF_ROUTE_THRESHOLD_METERS = 50;

/** Projects `currentPosition` onto the route described by `geometry` and
 * derives live progress. Returns null only if the route has fewer than 2
 * points (nothing to project onto). */
export function computeRouteProgress(
  geometry: RouteProgressGeometry,
  currentPosition: LngLat,
  offRouteThresholdMeters = DEFAULT_OFF_ROUTE_THRESHOLD_METERS,
): RouteProgress | null {
  const { points, cumulativeDistance, cumulativeAscent, cumulativeDescent, totalDistanceMeters, totalAscentMeters, totalDescentMeters } =
    geometry;
  if (points.length < 2) return null;

  let best: { segmentIndex: number; t: number; localPoint: [number, number]; distSq: number } | null = null;

  for (let i = 1; i < points.length; i++) {
    const a = toLocalMeters(points[i - 1], currentPosition);
    const b = toLocalMeters(points[i], currentPosition);
    const { point: candidate, t } = nearestOnSegmentWithT(a, b);
    const distSq = candidate[0] * candidate[0] + candidate[1] * candidate[1]; // origin is (0,0) = currentPosition
    if (!best || distSq < best.distSq) best = { segmentIndex: i - 1, t, localPoint: candidate, distSq };
  }
  if (!best) return null;

  const segStart = cumulativeDistance[best.segmentIndex];
  const segEnd = cumulativeDistance[best.segmentIndex + 1];
  const distanceTraveledMeters = segStart + (segEnd - segStart) * best.t;

  const ascStart = cumulativeAscent[best.segmentIndex];
  const ascEnd = cumulativeAscent[best.segmentIndex + 1];
  const ascentSoFar = ascStart + (ascEnd - ascStart) * best.t;

  const descStart = cumulativeDescent[best.segmentIndex];
  const descEnd = cumulativeDescent[best.segmentIndex + 1];
  const descentSoFar = descStart + (descEnd - descStart) * best.t;

  const offRouteDistanceMeters = Math.sqrt(best.distSq);

  return {
    projectedPoint: fromLocalMeters(best.localPoint, currentPosition),
    segmentIndex: best.segmentIndex,
    distanceTraveledMeters,
    distanceRemainingMeters: Math.max(0, totalDistanceMeters - distanceTraveledMeters),
    ascentRemainingMeters: Math.max(0, totalAscentMeters - ascentSoFar),
    descentRemainingMeters: Math.max(0, totalDescentMeters - descentSoFar),
    offRouteDistanceMeters,
    isOffRoute: offRouteDistanceMeters > offRouteThresholdMeters,
  };
}
