import { useEffect, useRef } from "react";
import type { FilterSpecification, Map as MapLibreMap, MapGeoJSONFeature, MapLayerMouseEvent } from "maplibre-gl";
import {
  parseSkiLiftProperties,
  parseSkiRunProperties,
  type SkiDataProvider,
  type SkiLift,
  type SkiRun,
} from "../providers/SkiDataProvider";
import type { LngLat } from "../providers/types";
import { withCacheScheme } from "../cache/tileCacheProtocol";

const SOURCE_ID = "openskimap";
const RUNS_LINE_ID = "ski-runs-line";
const LIFTS_LINE_ID = "ski-lifts-line";
const RUN_LABELS_ID = "ski-run-labels";
const LIFT_LABELS_ID = "ski-lift-labels";

const NEUTRAL_RUN_COLOR = "#2b6cb0";

function toLngLatArray(coords: number[][]): LngLat[] {
  return coords.map(([lng, lat]) => ({ lng, lat }));
}

/** Both runs and lifts can be LineString or MultiLineString in OSM data;
 * flattens to a single vertex list for length/elevation purposes. */
function flattenLine(geometry: MapGeoJSONFeature["geometry"]): LngLat[] {
  if (geometry.type === "LineString") return toLngLatArray(geometry.coordinates);
  if (geometry.type === "MultiLineString") return geometry.coordinates.flatMap(toLngLatArray);
  return [];
}

function ensureSkiLayers(map: MapLibreMap, provider: SkiDataProvider) {
  if (map.getSource(SOURCE_ID)) return;

  map.addSource(SOURCE_ID, {
    type: "vector",
    tiles: [withCacheScheme(provider.tileUrlTemplate)],
    minzoom: provider.minzoom,
    maxzoom: provider.maxzoom,
    attribution: provider.attribution.html,
  });

  const firstSymbolId = map.getStyle().layers?.find((l) => l.type === "symbol")?.id;
  const lineStringOnly: FilterSpecification = ["match", ["geometry-type"], ["LineString", "MultiLineString"], true, false];

  map.addLayer(
    {
      id: RUNS_LINE_ID,
      type: "line",
      source: SOURCE_ID,
      "source-layer": "runs",
      filter: ["all", lineStringOnly, ["has", "downhill"]],
      minzoom: 9,
      layout: { "line-cap": "round", "line-join": "round", visibility: "none" },
      paint: {
        "line-color": NEUTRAL_RUN_COLOR,
        "line-width": ["interpolate", ["exponential", 1.1], ["zoom"], 9, 1, 18, 4],
      },
    },
    firstSymbolId,
  );

  map.addLayer(
    {
      id: LIFTS_LINE_ID,
      type: "line",
      source: SOURCE_ID,
      "source-layer": "lifts",
      filter: lineStringOnly,
      minzoom: 9,
      layout: { "line-cap": "round", "line-join": "round", visibility: "none" },
      paint: {
        "line-color": "#555555",
        "line-width": ["interpolate", ["exponential", 1.1], ["zoom"], 9, 0.75, 18, 2.5],
      },
    },
    firstSymbolId,
  );

  map.addLayer({
    id: RUN_LABELS_ID,
    type: "symbol",
    source: SOURCE_ID,
    "source-layer": "runs",
    filter: ["all", lineStringOnly, ["has", "name"]],
    minzoom: 13,
    layout: {
      visibility: "none",
      "symbol-placement": "line",
      "text-field": ["get", "name"],
      "text-size": 11,
      "text-font": ["Noto Sans Regular"],
    },
    paint: {
      "text-color": "#1a3a5c",
      "text-halo-color": "rgba(255,255,255,0.85)",
      "text-halo-width": 1.2,
    },
  });

  map.addLayer({
    id: LIFT_LABELS_ID,
    type: "symbol",
    source: SOURCE_ID,
    "source-layer": "lifts",
    filter: lineStringOnly,
    minzoom: 12,
    layout: {
      visibility: "none",
      "symbol-placement": "line",
      "text-field": ["get", "name_and_type"],
      "text-size": 11,
      "text-font": ["Noto Sans Regular"],
    },
    paint: {
      "text-color": "#333333",
      "text-halo-color": "rgba(255,255,255,0.85)",
      "text-halo-width": 1.2,
    },
  });
}

export interface SkiLayerToggles {
  runsEnabled: boolean;
  difficultyColoursEnabled: boolean;
  liftsEnabled: boolean;
  runNamesEnabled: boolean;
  liftNamesEnabled: boolean;
}

export function useSkiLayers(
  map: MapLibreMap | null,
  provider: SkiDataProvider,
  toggles: SkiLayerToggles,
  onRunClick?: (run: SkiRun) => void,
  onLiftClick?: (lift: SkiLift) => void,
) {
  const onRunClickRef = useRef(onRunClick);
  onRunClickRef.current = onRunClick;
  const onLiftClickRef = useRef(onLiftClick);
  onLiftClickRef.current = onLiftClick;

  // Layer creation + click wiring: runs once per map instance.
  useEffect(() => {
    if (!map) return;
    ensureSkiLayers(map, provider);

    const handleRunClick = (e: MapLayerMouseEvent) => {
      const feature = e.features?.[0];
      if (!feature) return;
      const geometry = flattenLine(feature.geometry);
      const run: SkiRun = { ...parseSkiRunProperties(String(feature.id ?? feature.properties?.id), feature.properties ?? {}), geometry };
      onRunClickRef.current?.(run);
    };
    const handleLiftClick = (e: MapLayerMouseEvent) => {
      const feature = e.features?.[0];
      if (!feature) return;
      const geometry = flattenLine(feature.geometry);
      const lift: SkiLift = {
        ...parseSkiLiftProperties(String(feature.id ?? feature.properties?.id), feature.properties ?? {}),
        geometry,
      };
      onLiftClickRef.current?.(lift);
    };

    map.on("click", RUNS_LINE_ID, handleRunClick);
    map.on("click", LIFTS_LINE_ID, handleLiftClick);
    for (const id of [RUNS_LINE_ID, LIFTS_LINE_ID]) {
      map.on("mouseenter", id, () => (map.getCanvas().style.cursor = "pointer"));
      map.on("mouseleave", id, () => (map.getCanvas().style.cursor = ""));
    }

    return () => {
      map.off("click", RUNS_LINE_ID, handleRunClick);
      map.off("click", LIFTS_LINE_ID, handleLiftClick);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [map, provider]);

  // Visibility/paint toggling.
  useEffect(() => {
    if (!map) return;
    const vis = (on: boolean) => (on ? "visible" : "none");
    map.setLayoutProperty(RUNS_LINE_ID, "visibility", vis(toggles.runsEnabled));
    map.setLayoutProperty(LIFTS_LINE_ID, "visibility", vis(toggles.liftsEnabled));
    map.setLayoutProperty(RUN_LABELS_ID, "visibility", vis(toggles.runsEnabled && toggles.runNamesEnabled));
    map.setLayoutProperty(LIFT_LABELS_ID, "visibility", vis(toggles.liftsEnabled && toggles.liftNamesEnabled));
    map.setPaintProperty(RUNS_LINE_ID, "line-color", toggles.difficultyColoursEnabled ? ["get", "color"] : NEUTRAL_RUN_COLOR);
  }, [
    map,
    toggles.runsEnabled,
    toggles.difficultyColoursEnabled,
    toggles.liftsEnabled,
    toggles.runNamesEnabled,
    toggles.liftNamesEnabled,
  ]);
}
