import { useEffect, useRef, useState } from "react";
import type * as maplibregl from "maplibre-gl";
import type { Map as MapLibreMap, MapMouseEvent } from "maplibre-gl";
import type { AvalancheProvider, AvalancheRegionCollection, AvalancheRegionFeature } from "../providers/AvalancheProvider";
import { describeNetworkError } from "../net/fetchTimeout";

const SOURCE_ID = "avalanche-regions";
const FILL_LAYER_ID = "avalanche-regions-fill";
const LINE_LAYER_ID = "avalanche-regions-line";

export type AvalancheStatus = "idle" | "loading" | "ready" | "error";

// Forecast-center danger ratings are issued at most a few times a day —
// re-fetching more often than this would just hit the same data.
const CACHE_TTL_MS = 15 * 60 * 1000;
let cache: { data: AvalancheRegionCollection; fetchedAt: number } | null = null;

const EMPTY_COLLECTION: AvalancheRegionCollection = { type: "FeatureCollection", features: [] };

function ensureLayers(map: MapLibreMap) {
  if (map.getLayer(FILL_LAYER_ID)) return;
  if (!map.getSource(SOURCE_ID)) {
    map.addSource(SOURCE_ID, { type: "geojson", data: EMPTY_COLLECTION });
  }
  const firstSymbolId = map.getStyle().layers?.find((l) => l.type === "symbol")?.id;
  map.addLayer(
    {
      id: FILL_LAYER_ID,
      type: "fill",
      source: SOURCE_ID,
      paint: {
        "fill-color": ["get", "color"],
        // Off-season/no-rating regions (danger_level -1) are shown as a
        // faint outline only — a real rating gets a more visible fill so
        // the two states are never visually confusable.
        "fill-opacity": ["case", ["<", ["get", "danger_level"], 0], 0.06, 0.45],
      },
    },
    firstSymbolId,
  );
  map.addLayer(
    {
      id: LINE_LAYER_ID,
      type: "line",
      source: SOURCE_ID,
      paint: { "line-color": ["get", "color"], "line-width": 1.5, "line-opacity": 0.8 },
    },
    firstSymbolId,
  );
}

function removeLayers(map: MapLibreMap) {
  if (map.getLayer(LINE_LAYER_ID)) map.removeLayer(LINE_LAYER_ID);
  if (map.getLayer(FILL_LAYER_ID)) map.removeLayer(FILL_LAYER_ID);
  if (map.getSource(SOURCE_ID)) map.removeSource(SOURCE_ID);
}

export function useAvalancheLayer(
  map: MapLibreMap | null,
  provider: AvalancheProvider,
  enabled: boolean,
  onSelect?: (feature: AvalancheRegionFeature) => void,
): { status: AvalancheStatus; error: string | null; regionCount: number; fetchedAt: number | null; refresh: () => void } {
  const [status, setStatus] = useState<AvalancheStatus>("idle");
  const [error, setError] = useState<string | null>(null);
  const [regionCount, setRegionCount] = useState(0);
  const [fetchedAt, setFetchedAt] = useState<number | null>(null);
  const [nonce, setNonce] = useState(0);
  const onSelectRef = useRef(onSelect);
  onSelectRef.current = onSelect;

  useEffect(() => {
    if (!map || !enabled) {
      if (map) removeLayers(map);
      setStatus("idle");
      return;
    }

    ensureLayers(map);
    const controller = new AbortController();

    const load = async () => {
      const cacheFresh = cache && Date.now() - cache.fetchedAt < CACHE_TTL_MS;
      if (cacheFresh && nonce === 0) {
        (map.getSource(SOURCE_ID) as maplibregl.GeoJSONSource).setData(cache!.data);
        setStatus("ready");
        setRegionCount(cache!.data.features.length);
        setFetchedAt(cache!.fetchedAt);
        return;
      }
      setStatus("loading");
      try {
        const data = await provider.getRegions(controller.signal);
        if (controller.signal.aborted) return;
        cache = { data, fetchedAt: Date.now() };
        (map.getSource(SOURCE_ID) as maplibregl.GeoJSONSource).setData(data);
        setStatus("ready");
        setRegionCount(data.features.length);
        setFetchedAt(cache.fetchedAt);
        setError(null);
      } catch (err) {
        if (controller.signal.aborted) return;
        setStatus("error");
        setError(describeNetworkError(err));
      }
    };
    void load();

    const onClick = (e: MapMouseEvent) => {
      const features = map.queryRenderedFeatures(e.point, { layers: [FILL_LAYER_ID] });
      const feature = features[0] as unknown as AvalancheRegionFeature | undefined;
      if (feature) onSelectRef.current?.(feature);
    };
    map.on("click", FILL_LAYER_ID, onClick);
    const setCursor = () => (map.getCanvas().style.cursor = "pointer");
    const unsetCursor = () => (map.getCanvas().style.cursor = "");
    map.on("mouseenter", FILL_LAYER_ID, setCursor);
    map.on("mouseleave", FILL_LAYER_ID, unsetCursor);

    return () => {
      controller.abort();
      map.off("click", FILL_LAYER_ID, onClick);
      map.off("mouseenter", FILL_LAYER_ID, setCursor);
      map.off("mouseleave", FILL_LAYER_ID, unsetCursor);
      removeLayers(map);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [map, provider, enabled, nonce]);

  return { status, error, regionCount, fetchedAt, refresh: () => setNonce((n) => n + 1) };
}
