// Ties a planned route + live GPS fix together into live navigation state:
// position-on-route progress and a distance/ETA remaining figure. Owns none
// of the "is navigating" on/off state itself — that's driven externally
// (App.tsx), since starting/stopping navigation also has to coordinate
// several other things at once (geolocation's watch cadence, keep-screen-on,
// which stats panel is shown) that don't belong inside this hook.
import { useEffect, useMemo, useRef } from "react";
import type { RouteResult } from "../providers/RoutingProvider";
import type { GeolocationFix } from "../geo/useGeolocation";
import { computeRouteProgress, prepareRouteProgressGeometry, type RouteProgress } from "../geo/routeProgress";
import { estimateHikingDurationSeconds } from "./timeEstimate";

export interface RouteNavigationState {
  progress: RouteProgress | null;
  /** Seconds remaining. Live-pace-based (distance covered since navigation
   * started ÷ elapsed time) once enough movement has been observed to make
   * that meaningful; a static pre-route estimate, prorated by distance
   * remaining, before then. Null with nothing to estimate against. */
  etaSeconds: number | null;
}

// Below this much movement/time since navigation started, a live pace
// figure is noisy (a couple of GPS fixes a few meters apart can imply an
// absurd instantaneous speed) — fall back to the static estimate until
// there's enough of a baseline to trust.
const MIN_MOVEMENT_FOR_LIVE_PACE_METERS = 100;
const MIN_ELAPSED_FOR_LIVE_PACE_SECONDS = 30;

export function useRouteNavigation(
  routeResult: RouteResult | null,
  isNavigating: boolean,
  fix: GeolocationFix | null,
  /** Dev-only override — see useSimulatedNavigationFix.ts. Never set outside
   * a DEV build. */
  simulatedFix?: GeolocationFix | null,
): RouteNavigationState {
  const geometry = useMemo(() => (routeResult ? prepareRouteProgressGeometry(routeResult.points) : null), [routeResult]);

  // Real GPS always wins when it exists — the simulator is purely a
  // desktop-dev fallback for when there's no real fix to test with (and is
  // never even instantiated in a production build, see
  // useSimulatedNavigationFix's import.meta.env.DEV gate at the call site).
  const effectiveFix = fix ?? simulatedFix ?? null;

  const progress = useMemo(() => {
    if (!isNavigating || !geometry || !effectiveFix) return null;
    return computeRouteProgress(geometry, effectiveFix.point);
  }, [isNavigating, geometry, effectiveFix]);

  // Baseline for the live-pace calculation — reset every time a fresh
  // navigation session starts, not just once per route.
  const startTimeRef = useRef<number | null>(null);
  const startDistanceTraveledRef = useRef(0);
  useEffect(() => {
    if (isNavigating) {
      startTimeRef.current = Date.now();
      startDistanceTraveledRef.current = 0;
    } else {
      startTimeRef.current = null;
    }
  }, [isNavigating]);
  // First progress reading of a session is the true distance-traveled
  // baseline (route start may not be exactly where navigation began).
  const baselineSetRef = useRef(false);
  useEffect(() => {
    if (isNavigating && progress && !baselineSetRef.current) {
      startDistanceTraveledRef.current = progress.distanceTraveledMeters;
      baselineSetRef.current = true;
    }
    if (!isNavigating) baselineSetRef.current = false;
  }, [isNavigating, progress]);

  const etaSeconds = useMemo(() => {
    if (!progress || !geometry) return null;

    const elapsedSeconds = startTimeRef.current ? (Date.now() - startTimeRef.current) / 1000 : 0;
    const distanceSinceStart = progress.distanceTraveledMeters - startDistanceTraveledRef.current;
    if (elapsedSeconds >= MIN_ELAPSED_FOR_LIVE_PACE_SECONDS && distanceSinceStart >= MIN_MOVEMENT_FOR_LIVE_PACE_METERS) {
      const paceMetersPerSecond = distanceSinceStart / elapsedSeconds;
      if (paceMetersPerSecond > 0) return progress.distanceRemainingMeters / paceMetersPerSecond;
    }

    // Not enough live data yet — static Naismith's-rule estimate for the
    // whole route, prorated down to just the remaining fraction of it.
    const totalEstimateSeconds = estimateHikingDurationSeconds(geometry.totalDistanceMeters, geometry.totalAscentMeters);
    const fractionRemaining = geometry.totalDistanceMeters > 0 ? progress.distanceRemainingMeters / geometry.totalDistanceMeters : 0;
    return totalEstimateSeconds * fractionRemaining;
  }, [progress, geometry]);

  return { progress, etaSeconds };
}
