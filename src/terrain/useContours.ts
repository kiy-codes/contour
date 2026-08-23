import { useEffect, useRef } from "react";
import type { Map as MapLibreMap, GeoJSONSource } from "maplibre-gl";
import type { TerrainProvider } from "../providers/TerrainProvider";
import { contourLevelForZoom } from "./contourLevels";
import { tilesForBounds } from "./tileMath";
import type { ContourWorkerRequest, ContourWorkerResponse } from "./contourWorker";

const SOURCE_ID = "contours-source";
const LAYER_MINOR = "contours-minor";
const LAYER_MAJOR = "contours-major";
const LAYER_LABEL = "contours-major-label";

const EMPTY_FC: GeoJSON.FeatureCollection = { type: "FeatureCollection", features: [] };

function ensureLayers(map: MapLibreMap) {
  if (map.getSource(SOURCE_ID)) return;

  map.addSource(SOURCE_ID, { type: "geojson", data: EMPTY_FC });

  map.addLayer({
    id: LAYER_MINOR,
    type: "line",
    source: SOURCE_ID,
    filter: ["==", ["get", "major"], false],
    paint: {
      "line-color": "#8a5a2b",
      "line-width": 0.75,
      "line-opacity": 0.45,
    },
  });

  map.addLayer({
    id: LAYER_MAJOR,
    type: "line",
    source: SOURCE_ID,
    filter: ["==", ["get", "major"], true],
    paint: {
      "line-color": "#8a5a2b",
      "line-width": 1.25,
      "line-opacity": 0.7,
    },
  });

  map.addLayer({
    id: LAYER_LABEL,
    type: "symbol",
    source: SOURCE_ID,
    filter: ["==", ["get", "major"], true],
    layout: {
      "symbol-placement": "line",
      "text-field": ["concat", ["to-string", ["get", "elevation"]], "m"],
      "text-size": 10,
      "text-font": ["Noto Sans Regular"],
      "symbol-spacing": 300,
    },
    paint: {
      "text-color": "#6b4423",
      "text-halo-color": "rgba(255,255,255,0.85)",
      "text-halo-width": 1.2,
    },
  });
}

function setLayersVisible(map: MapLibreMap, visible: boolean) {
  const vis = visible ? "visible" : "none";
  for (const id of [LAYER_MINOR, LAYER_MAJOR, LAYER_LABEL]) {
    if (map.getLayer(id)) map.setLayoutProperty(id, "visibility", vis);
  }
}

/**
 * Computes and renders contour lines for the current viewport, recomputed
 * on moveend, zoom-dependent interval, entirely client-side from the same
 * DEM tiles used for 3D terrain — never loads contours for the whole world
 * at once.
 */
export function useContours(map: MapLibreMap | null, enabled: boolean, terrainProvider: TerrainProvider) {
  const workerRef = useRef<Worker | null>(null);
  const requestIdRef = useRef(0);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // The worker-creation effect below runs once ([] deps) so its onmessage
  // closure must not close over `map` directly — `map` is still null at
  // that point (mount happens before style.load). Read the latest value
  // through this ref instead, which every render keeps current.
  const mapRef = useRef(map);
  mapRef.current = map;

  useEffect(() => {
    const worker = new Worker(new URL("./contourWorker.ts", import.meta.url), { type: "module" });
    workerRef.current = worker;

    worker.onmessage = (event: MessageEvent<ContourWorkerResponse>) => {
      const currentMap = mapRef.current;
      if (!currentMap || event.data.requestId !== String(requestIdRef.current)) return;
      const source = currentMap.getSource(SOURCE_ID);
      if (source && "setData" in source) {
        (source as GeoJSONSource).setData(event.data.featureCollection);
      }
    };

    return () => {
      worker.terminate();
      workerRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!map) return;

    const recompute = () => {
      // `map` is only non-null once MapCanvas has seen "style.load" fire,
      // so it's already safe to add sources/layers here — deliberately not
      // gating on map.isStyleLoaded(), which stays false indefinitely once
      // a raster-dem source has outstanding tile requests (see MapCanvas).
      ensureLayers(map);

      if (!enabled) {
        setLayersVisible(map, false);
        return;
      }

      const zoom = map.getZoom();
      const level = contourLevelForZoom(zoom);
      if (!level) {
        setLayersVisible(map, false);
        return;
      }
      setLayersVisible(map, true);

      const bounds = map.getBounds();
      const tiles = tilesForBounds(
        [bounds.getWest(), bounds.getSouth(), bounds.getEast(), bounds.getNorth()],
        level.sourceZoom,
        24,
      );

      requestIdRef.current += 1;
      const request: ContourWorkerRequest = {
        requestId: String(requestIdRef.current),
        tiles,
        urlTemplate: terrainProvider.getTileUrlTemplate(),
        tileSize: terrainProvider.tileSize,
        minor: level.minor,
        majorMultiple: level.majorMultiple,
      };
      workerRef.current?.postMessage(request);
    };

    const debouncedRecompute = () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
      debounceRef.current = setTimeout(recompute, 400);
    };

    recompute();
    map.on("moveend", debouncedRecompute);
    return () => {
      map.off("moveend", debouncedRecompute);
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [map, enabled, terrainProvider]);
}
