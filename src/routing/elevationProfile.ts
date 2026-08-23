import type { RouteResult } from "../providers/RoutingProvider";
import type { ElevationProvider } from "../providers/ElevationProvider";
import type { LngLat } from "../providers/types";
import { haversineDistance, resampleLine } from "../geo/distance";

export interface ProfilePoint {
  distanceMeters: number;
  elevation: number;
  lng: number;
  lat: number;
}

export interface ProfileStats {
  profile: ProfilePoint[];
  /** Noise-filtered gain/loss computed from this profile — only meaningful
   * to use when the route result itself didn't already supply ascent/
   * descent (e.g. ORS gives its own, more authoritative figures). */
  computedAscentMeters: number;
  computedDescentMeters: number;
  maxSlopePercent: number;
  avgSlopePercent: number;
  hasElevationData: boolean;
}

const MANUAL_SAMPLE_COUNT = 80;
// DEM sampling noise is a few meters even on flat ground; a change has to
// clear this before it counts as real gain/loss, matching how hiking apps
// avoid reporting hundreds of meters of "gain" on a flat trail.
const GAIN_LOSS_THRESHOLD_METERS = 3;
// Slope over very short segments blows up from small horizontal error;
// ignore segments shorter than this when computing max/avg slope.
const MIN_SLOPE_SEGMENT_METERS = 8;

function computeGainLoss(profile: ProfilePoint[]): { ascent: number; descent: number } {
  if (profile.length === 0) return { ascent: 0, descent: 0 };
  let ascent = 0;
  let descent = 0;
  let lastCommitted = profile[0].elevation;
  for (const p of profile) {
    const delta = p.elevation - lastCommitted;
    if (Math.abs(delta) >= GAIN_LOSS_THRESHOLD_METERS) {
      if (delta > 0) ascent += delta;
      else descent += -delta;
      lastCommitted = p.elevation;
    }
  }
  return { ascent, descent };
}

function computeSlope(profile: ProfilePoint[]): { max: number; avg: number } {
  let max = 0;
  let totalAbsElevChange = 0;
  let totalDistance = 0;
  for (let i = 1; i < profile.length; i++) {
    const dx = profile[i].distanceMeters - profile[i - 1].distanceMeters;
    const dz = profile[i].elevation - profile[i - 1].elevation;
    totalAbsElevChange += Math.abs(dz);
    totalDistance += dx;
    if (dx < MIN_SLOPE_SEGMENT_METERS) continue;
    const slopePercent = (Math.abs(dz) / dx) * 100;
    if (slopePercent > max) max = slopePercent;
  }
  const avg = totalDistance > 0 ? (totalAbsElevChange / totalDistance) * 100 : 0;
  return { max, avg };
}

function toProfile(points: { lng: number; lat: number; elevation: number }[]): ProfilePoint[] {
  const profile: ProfilePoint[] = [];
  let cumulative = 0;
  for (let i = 0; i < points.length; i++) {
    if (i > 0) cumulative += haversineDistance(points[i - 1], points[i]);
    profile.push({ distanceMeters: cumulative, elevation: points[i].elevation, lng: points[i].lng, lat: points[i].lat });
  }
  return profile;
}

/**
 * Builds an elevation profile for a computed route. ORS results already
 * carry real per-vertex elevation (dense enough to chart directly); manual
 * routes don't, so this resamples the line and queries the same terrain
 * DEM used for 3D terrain — returning hasElevationData: false rather than
 * fabricating a profile when terrain isn't enabled (queries all resolve null).
 */
export async function computeElevationProfile(
  result: RouteResult,
  elevationProvider: ElevationProvider,
): Promise<ProfileStats> {
  const hasDenseElevation = result.points.length > 2 && result.points.every((p) => p.elevation !== undefined);

  let points: { lng: number; lat: number; elevation: number }[];
  if (hasDenseElevation) {
    points = result.points.map((p) => ({ lng: p.lng, lat: p.lat, elevation: p.elevation as number }));
  } else {
    const samples: LngLat[] = resampleLine(result.points, MANUAL_SAMPLE_COUNT);
    const elevations = await Promise.all(samples.map((s) => elevationProvider.getElevation(s)));
    if (elevations.every((e) => e === null)) {
      return { profile: [], computedAscentMeters: 0, computedDescentMeters: 0, maxSlopePercent: 0, avgSlopePercent: 0, hasElevationData: false };
    }
    points = samples.map((s, i) => ({ lng: s.lng, lat: s.lat, elevation: elevations[i] ?? 0 }));
  }

  const profile = toProfile(points);
  const { ascent, descent } = computeGainLoss(profile);
  const { max, avg } = computeSlope(profile);

  return {
    profile,
    computedAscentMeters: ascent,
    computedDescentMeters: descent,
    maxSlopePercent: max,
    avgSlopePercent: avg,
    hasElevationData: true,
  };
}
