import { useEffect } from "react";
import type * as maplibregl from "maplibre-gl";
import type { Map as MapLibreMap } from "maplibre-gl";

const SOURCE_ID = "graticule-lines";
const LAYER_ID = "graticule-lines-layer";
const LABEL_LAYER_ID = "graticule-labels-layer";

const EMPTY: GeoJSON.FeatureCollection = { type: "FeatureCollection", features: [] };

/** Picks a lat/lng grid spacing (degrees) from the current zoom — coarse
 * lines when zoomed out (a handful across the whole visible extent),
 * finer as you zoom in, capped so it never tries to draw an unreasonable
 * number of lines. */
function stepForZoom(zoom: number): number {
  const steps = [30, 15, 10, 5, 2, 1, 0.5, 0.25, 0.1, 0.05, 0.02, 0.01];
  const index = Math.max(0, Math.min(steps.length - 1, Math.floor(zoom)));
  return steps[Math.min(index, steps.length - 1)] ?? 0.01;
}

function buildGraticule(map: MapLibreMap): GeoJSON.FeatureCollection {
  const bounds = map.getBounds();
  const zoom = map.getZoom();
  const step = stepForZoom(zoom);
  const south = Math.max(-85, bounds.getSouth() - step);
  const north = Math.min(85, bounds.getNorth() + step);
  const west = bounds.getWest() - step;
  const east = bounds.getEast() + step;

  const features: GeoJSON.Feature[] = [];
  const startLng = Math.floor(west / step) * step;
  for (let lng = startLng; lng <= east; lng += step) {
    features.push({
      type: "Feature",
      properties: { label: `${lng.toFixed(2)}°` },
      geometry: { type: "LineString", coordinates: [[lng, south], [lng, north]] },
    });
  }
  const startLat = Math.floor(south / step) * step;
  for (let lat = startLat; lat <= north; lat += step) {
    features.push({
      type: "Feature",
      properties: { label: `${lat.toFixed(2)}°` },
      geometry: { type: "LineString", coordinates: [[west, lat], [east, lat]] },
    });
  }
  return { type: "FeatureCollection", features };
}

/** A best-effort lat/lng graticule overlay — client-side only, recomputed
 * on moveend/zoomend (not every frame), capped to a sane line count per
 * view via stepForZoom. Not a survey-grade grid, just a visual reference. */
export function useGraticule(map: MapLibreMap | null, enabled: boolean) {
  useEffect(() => {
    if (!map) return;

    if (!enabled) {
      if (map.getLayer(LABEL_LAYER_ID)) map.removeLayer(LABEL_LAYER_ID);
      if (map.getLayer(LAYER_ID)) map.removeLayer(LAYER_ID);
      if (map.getSource(SOURCE_ID)) map.removeSource(SOURCE_ID);
      return;
    }

    if (!map.getSource(SOURCE_ID)) {
      map.addSource(SOURCE_ID, { type: "geojson", data: EMPTY });
      map.addLayer({
        id: LAYER_ID,
        type: "line",
        source: SOURCE_ID,
        paint: { "line-color": "#ffffff", "line-width": 0.6, "line-opacity": 0.35 },
      });
      map.addLayer({
        id: LABEL_LAYER_ID,
        type: "symbol",
        source: SOURCE_ID,
        layout: { "symbol-placement": "line", "text-field": ["get", "label"], "text-size": 10 },
        paint: { "text-color": "#ffffff", "text-opacity": 0.5 },
      });
    }

    const update = () => (map.getSource(SOURCE_ID) as maplibregl.GeoJSONSource)?.setData(buildGraticule(map));
    update();
    map.on("moveend", update);
    return () => {
      map.off("moveend", update);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [map, enabled]);
}
