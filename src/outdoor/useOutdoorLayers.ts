import { useEffect } from "react";
import type { Map as MapLibreMap } from "maplibre-gl";
import type { OutdoorDataProvider } from "../providers/OutdoorDataProvider";
import { withCacheScheme } from "../cache/tileCacheProtocol";

const TRAIL_LINE_ID = "outdoor-trails-line";
const TRAIL_CASING_ID = "outdoor-trails-casing";
const WAYMARKED_SOURCE_ID = "waymarked-hiking";
const WAYMARKED_LAYER_ID = "waymarked-hiking-layer";
const BASE_TRAIL_LABEL_ID = "highway-name-path"; // defined by the OpenFreeMap style itself

const WAYMARKED_ATTRIBUTION =
  '© <a href="https://waymarkedtrails.org" target="_blank" rel="noreferrer">Waymarked Trails</a>, OSM contributors';

function ensureTrailLayers(map: MapLibreMap, provider: OutdoorDataProvider) {
  if (map.getLayer(TRAIL_LINE_ID)) return;
  const firstSymbolId = map.getStyle().layers?.find((l) => l.type === "symbol")?.id;

  map.addLayer(
    {
      id: TRAIL_CASING_ID,
      type: "line",
      source: provider.vectorSourceId,
      "source-layer": provider.sourceLayer,
      filter: provider.trailFilter,
      layout: { "line-join": "round", visibility: "none" },
      paint: {
        "line-color": "#ffffff",
        "line-width": ["interpolate", ["linear"], ["zoom"], 10, 1.5, 16, 4],
        "line-opacity": 0.8,
      },
    },
    firstSymbolId,
  );

  map.addLayer(
    {
      id: TRAIL_LINE_ID,
      type: "line",
      source: provider.vectorSourceId,
      "source-layer": provider.sourceLayer,
      filter: provider.trailFilter,
      layout: { "line-join": "round", visibility: "none" },
      paint: {
        "line-color": "#e2662d",
        "line-width": ["interpolate", ["linear"], ["zoom"], 10, 1, 16, 2.5],
        "line-dasharray": [2, 1.5],
      },
    },
    firstSymbolId,
  );
}

function ensureWaymarkedLayer(map: MapLibreMap) {
  if (map.getLayer(WAYMARKED_LAYER_ID)) return;
  if (!map.getSource(WAYMARKED_SOURCE_ID)) {
    map.addSource(WAYMARKED_SOURCE_ID, {
      type: "raster",
      tiles: [withCacheScheme("https://tile.waymarkedtrails.org/hiking/{z}/{x}/{y}.png")],
      tileSize: 256,
      minzoom: 1,
      maxzoom: 18,
      attribution: WAYMARKED_ATTRIBUTION,
    });
  }
  const firstSymbolId = map.getStyle().layers?.find((l) => l.type === "symbol")?.id;
  map.addLayer(
    {
      id: WAYMARKED_LAYER_ID,
      type: "raster",
      source: WAYMARKED_SOURCE_ID,
      layout: { visibility: "none" },
      paint: { "raster-opacity": 0.85 },
    },
    firstSymbolId,
  );
}

export interface OutdoorLayerToggles {
  hikingTrailsEnabled: boolean;
  longDistanceTrailsEnabled: boolean;
  trailNamesEnabled: boolean;
}

/**
 * Adds/toggles the hiking-trail highlight layer (from the base map's own
 * vector tiles — no extra network cost), the optional Waymarked Trails
 * raster overlay for named long-distance routes, and trail name labels
 * (reuses the style's own path-name layer rather than duplicating it).
 */
export function useOutdoorLayers(map: MapLibreMap | null, provider: OutdoorDataProvider, toggles: OutdoorLayerToggles) {
  useEffect(() => {
    if (!map) return;
    ensureTrailLayers(map, provider);
    ensureWaymarkedLayer(map);

    const vis = (on: boolean) => (on ? "visible" : "none");
    map.setLayoutProperty(TRAIL_LINE_ID, "visibility", vis(toggles.hikingTrailsEnabled));
    map.setLayoutProperty(TRAIL_CASING_ID, "visibility", vis(toggles.hikingTrailsEnabled));
    map.setLayoutProperty(WAYMARKED_LAYER_ID, "visibility", vis(toggles.longDistanceTrailsEnabled));
    if (map.getLayer(BASE_TRAIL_LABEL_ID)) {
      map.setLayoutProperty(BASE_TRAIL_LABEL_ID, "visibility", vis(toggles.trailNamesEnabled));
    }
  }, [map, provider, toggles.hikingTrailsEnabled, toggles.longDistanceTrailsEnabled, toggles.trailNamesEnabled]);
}
