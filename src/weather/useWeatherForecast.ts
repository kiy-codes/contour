import { useEffect, useRef, useState } from "react";
import type { LngLat } from "../providers/types";
import type { WeatherForecast, WeatherForecastProvider } from "../providers/WeatherProvider";

export type WeatherForecastStatus = "idle" | "loading" | "ready" | "error";

export interface WeatherForecastState {
  status: WeatherForecastStatus;
  data: WeatherForecast | null;
  error: string | null;
  /** True once `data` is older than STALE_MS — still shown (labelled), never
   * silently treated as fresh. */
  isStale: boolean;
}

const CACHE_TTL_MS = 5 * 60 * 1000;
const STALE_MS = 30 * 60 * 1000;
// Coarse enough that small pans while the panel is open don't refetch, fine
// enough that a genuinely different area (a few km) does.
const CACHE_COORD_PRECISION = 2;

function cacheKeyFor(point: LngLat): string {
  return `${point.lat.toFixed(CACHE_COORD_PRECISION)},${point.lng.toFixed(CACHE_COORD_PRECISION)}`;
}

interface CacheEntry {
  data: WeatherForecast;
  fetchedAt: number;
}

const memoryCache = new Map<string, CacheEntry>();

/**
 * Fetches a point forecast for `point` whenever it changes while `enabled`
 * is true — debounced to the caller's own pace (point is expected to come
 * from a map "moveend" event, which already throttles this to "once panning
 * stops" rather than every frame), deduplicated via a short-lived in-memory
 * cache, and cancels any in-flight request for a stale point before starting
 * a new one.
 */
export function useWeatherForecast(
  provider: WeatherForecastProvider,
  point: LngLat | null,
  enabled: boolean,
): WeatherForecastState & { refresh: () => void } {
  const [state, setState] = useState<WeatherForecastState>({ status: "idle", data: null, error: null, isStale: false });
  const abortRef = useRef<AbortController | null>(null);
  const [refreshNonce, setRefreshNonce] = useState(0);

  useEffect(() => {
    abortRef.current?.abort();
    if (!enabled || !point) {
      setState({ status: "idle", data: null, error: null, isStale: false });
      return;
    }

    const key = cacheKeyFor(point);
    const cached = memoryCache.get(key);
    const cacheFresh = cached && Date.now() - cached.fetchedAt < CACHE_TTL_MS;
    if (cacheFresh && refreshNonce === 0) {
      setState({ status: "ready", data: cached.data, error: null, isStale: false });
      return;
    }

    const controller = new AbortController();
    abortRef.current = controller;
    setState((s) => ({ ...s, status: "loading", error: null }));

    provider
      .getForecast(point, controller.signal)
      .then((data) => {
        if (controller.signal.aborted) return;
        memoryCache.set(key, { data, fetchedAt: Date.now() });
        setState({ status: "ready", data, error: null, isStale: false });
      })
      .catch((err) => {
        if (controller.signal.aborted) return;
        // Fall back to a stale cache entry (clearly labelled) rather than
        // showing nothing, if one exists for this point.
        if (cached) {
          setState({ status: "ready", data: cached.data, error: null, isStale: true });
          return;
        }
        setState({ status: "error", data: null, error: err instanceof Error ? err.message : String(err), isStale: false });
      });

    return () => controller.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [provider, point?.lat, point?.lng, enabled, refreshNonce]);

  // Mark existing data stale once it crosses STALE_MS, without refetching.
  useEffect(() => {
    if (state.status !== "ready" || state.isStale) return;
    const fetchedAt = point ? memoryCache.get(cacheKeyFor(point))?.fetchedAt : undefined;
    if (!fetchedAt) return;
    const remaining = STALE_MS - (Date.now() - fetchedAt);
    if (remaining <= 0) {
      setState((s) => ({ ...s, isStale: true }));
      return;
    }
    const timer = setTimeout(() => setState((s) => ({ ...s, isStale: true })), remaining);
    return () => clearTimeout(timer);
  }, [state.status, state.isStale, point]);

  return { ...state, refresh: () => setRefreshNonce((n) => n + 1) };
}
