// DEV-ONLY testing aid: feeds a synthetic GeolocationFix that walks a
// route's own points at a fixed pace, so navigation mode (progress math,
// marker rotation, off-route detection, live stats) can be verified end to
// end from the desktop dev server without physically walking a route with
// the phone every rebuild. Never imported/used outside import.meta.env.DEV
// — strip the call site (not this file) if this stops being wanted.
import { useEffect, useRef, useState } from "react";
import type { RouteResult } from "../providers/RoutingProvider";
import type { GeolocationFix } from "../geo/useGeolocation";
import { haversineDistance } from "../geo/distance";

const DEFAULT_SIMULATED_SPEED_METERS_PER_SECOND = 1.4; // ≈ brisk walking pace
const TICK_MS = 500;

/** Returns a fabricated GeolocationFix that advances along `route.points`
 * over real time while `active` is true, or null otherwise/when there's no
 * route. Includes a synthetic heading derived from the current direction of
 * travel, so the heading-cone marker has something real to test against. */
export function useSimulatedNavigationFix(
  route: RouteResult | null,
  active: boolean,
  speedMetersPerSecond = DEFAULT_SIMULATED_SPEED_METERS_PER_SECOND,
): GeolocationFix | null {
  const [fix, setFix] = useState<GeolocationFix | null>(null);
  const distanceCoveredRef = useRef(0);

  useEffect(() => {
    if (!active || !route || route.points.length < 2) {
      setFix(null);
      distanceCoveredRef.current = 0;
      return;
    }

    const interval = setInterval(() => {
      distanceCoveredRef.current += speedMetersPerSecond * (TICK_MS / 1000);

      let remaining = distanceCoveredRef.current;
      let i = 1;
      for (; i < route.points.length; i++) {
        const segLen = haversineDistance(route.points[i - 1], route.points[i]);
        if (remaining <= segLen || i === route.points.length - 1) break;
        remaining -= segLen;
      }
      const a = route.points[i - 1];
      const b = route.points[i];
      const segLen = haversineDistance(a, b) || 1;
      const t = Math.max(0, Math.min(1, remaining / segLen));
      const point = { lng: a.lng + (b.lng - a.lng) * t, lat: a.lat + (b.lat - a.lat) * t };

      const dLng = ((b.lng - a.lng) * Math.PI) / 180;
      const lat1 = (a.lat * Math.PI) / 180;
      const lat2 = (b.lat * Math.PI) / 180;
      const y = Math.sin(dLng) * Math.cos(lat2);
      const x = Math.cos(lat1) * Math.sin(lat2) - Math.sin(lat1) * Math.cos(lat2) * Math.cos(dLng);
      const heading = ((Math.atan2(y, x) * 180) / Math.PI + 360) % 360;

      setFix({ point, accuracy: 8, heading, speed: speedMetersPerSecond });
    }, TICK_MS);

    return () => clearInterval(interval);
  }, [active, route, speedMetersPerSecond]);

  return fix;
}
