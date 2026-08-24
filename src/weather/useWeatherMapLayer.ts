import { useEffect, useRef, useState } from "react";
import type * as maplibregl from "maplibre-gl";
import type { Map as MapLibreMap } from "maplibre-gl";
import type { WeatherMapLayerId, WeatherMapProvider } from "../providers/WeatherProvider";

const SOURCE_ID = "weather-map-source";
const LAYER_ID = "weather-map-layer";

export type WeatherTileStatus = "idle" | "loading" | "ready" | "error";

/**
 * Adds/updates a single raster overlay for the currently-selected weather
 * map layer (only one shown at a time — stacking several semi-transparent
 * weather rasters is visually unreadable, so this mirrors the existing
 * single-select MapModeSwitcher pattern rather than the multi-toggle
 * OutdoorControls/SkiControls pattern).
 *
 * Deliberately bypasses the app's persistent wmcache:// tile cache (see
 * tileCacheProtocol.ts): these tiles represent current conditions, not
 * static geography, so indefinite LRU-cached storage risks silently
 * serving old weather as current. Tiles go straight to MapLibre's own
 * in-memory tile pool, and a cache-busting timestamp bucket is appended to
 * the URL every `refreshIntervalMs` to force genuinely fresh tiles instead
 * of relying on the browser HTTP cache to decide when to revalidate.
 */
export function useWeatherMapLayer(
  map: MapLibreMap | null,
  provider: WeatherMapProvider,
  activeLayer: WeatherMapLayerId | "none",
  apiKey: string | undefined,
): { status: WeatherTileStatus; lastRefreshedAt: number | null } {
  const [status, setStatus] = useState<WeatherTileStatus>("idle");
  const [lastRefreshedAt, setLastRefreshedAt] = useState<number | null>(null);
  const bucketRef = useRef(0);

  useEffect(() => {
    if (!map) return;

    const removeLayerAndSource = () => {
      if (map.getLayer(LAYER_ID)) map.removeLayer(LAYER_ID);
      if (map.getSource(SOURCE_ID)) map.removeSource(SOURCE_ID);
    };

    if (activeLayer === "none" || !apiKey) {
      removeLayerAndSource();
      setStatus("idle");
      setLastRefreshedAt(null);
      return;
    }

    const buildTileUrl = () => {
      const base = provider.getTileUrlTemplate(activeLayer, apiKey);
      // Cache-busting bucket, not a real forecast time — OWM's free tier
      // has no time parameter; this only forces a fresh fetch instead of a
      // browser-cached copy once refreshIntervalMs has passed.
      return `${base}&_b=${bucketRef.current}`;
    };

    setStatus("loading");
    removeLayerAndSource();
    map.addSource(SOURCE_ID, {
      type: "raster",
      tiles: [buildTileUrl()],
      tileSize: 256,
      attribution: provider.attribution.html,
    });
    const firstSymbolId = map.getStyle().layers?.find((l) => l.type === "symbol")?.id;
    map.addLayer({ id: LAYER_ID, type: "raster", source: SOURCE_ID, paint: { "raster-opacity": 0.75 } }, firstSymbolId);
    setLastRefreshedAt(Date.now());

    const onData = (e: maplibregl.MapSourceDataEvent) => {
      if (e.sourceId !== SOURCE_ID) return;
      if (e.isSourceLoaded) setStatus("ready");
    };
    const onError = (e: maplibregl.ErrorEvent & { sourceId?: string }) => {
      if (e.sourceId !== SOURCE_ID) return;
      setStatus("error");
    };
    map.on("sourcedata", onData);
    map.on("error", onError);

    const interval = setInterval(() => {
      bucketRef.current += 1;
      const source = map.getSource(SOURCE_ID) as maplibregl.RasterTileSource | undefined;
      if (!source) return;
      setStatus("loading");
      source.setTiles([buildTileUrl()]);
      setLastRefreshedAt(Date.now());
    }, provider.refreshIntervalMs);

    return () => {
      clearInterval(interval);
      map.off("sourcedata", onData);
      map.off("error", onError);
      removeLayerAndSource();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [map, provider, activeLayer, apiKey]);

  return { status, lastRefreshedAt };
}
