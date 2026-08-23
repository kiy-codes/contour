import { useEffect, useRef } from "react";
import * as maplibregl from "maplibre-gl";
import type { Map as MapLibreMap } from "maplibre-gl";
import type { Dispatch } from "react";
import type { RouteAction, RouteEditorState } from "./routeReducer";
import type { RoutingProvider, RouteResult } from "../providers/RoutingProvider";
import type { OutdoorDataProvider } from "../providers/OutdoorDataProvider";
import type { LngLat } from "../providers/types";
import { nearestPointOnLines } from "../geo/nearestPointOnLine";

const ROUTE_SOURCE_ID = "route-line-source";
const ROUTE_CASING_ID = "route-line-casing";
const ROUTE_LINE_ID = "route-line";

// Clicks/drags within this distance of a trail snap onto it; farther than
// this, the point is assumed to genuinely be off-trail (e.g. a trailhead
// car park) and is left where the user put it.
const MAX_SNAP_DISTANCE_METERS = 35;

/** Snaps a point onto the nearest trail from the already-loaded OSM vector
 * tiles (no network call), if one is close enough. Falls back to the
 * original point when nothing is loaded/close nearby — never blocks
 * waypoint placement on this being available. */
function snapToNearestTrail(map: MapLibreMap, point: LngLat, provider: OutdoorDataProvider): LngLat {
  let features: ReturnType<MapLibreMap["querySourceFeatures"]>;
  try {
    features = map.querySourceFeatures(provider.vectorSourceId, {
      sourceLayer: provider.sourceLayer,
      filter: provider.trailFilter,
    });
  } catch {
    return point;
  }

  const lines: LngLat[][] = [];
  for (const f of features) {
    const geom = f.geometry;
    if (geom.type === "LineString") {
      lines.push(geom.coordinates.map(([lng, lat]) => ({ lng, lat })));
    } else if (geom.type === "MultiLineString") {
      for (const line of geom.coordinates) lines.push(line.map(([lng, lat]) => ({ lng, lat })));
    }
  }
  if (lines.length === 0) return point;

  const nearest = nearestPointOnLines(point, lines);
  if (!nearest || nearest.distanceMeters > MAX_SNAP_DISTANCE_METERS) return point;
  return nearest.point;
}

const EMPTY_LINE: GeoJSON.Feature<GeoJSON.LineString> = {
  type: "Feature",
  properties: {},
  geometry: { type: "LineString", coordinates: [] },
};

/** Builds the route line source data — one feature per waytype segment
 * (tagged with a "category" property for data-driven coloring) when ORS
 * supplied a breakdown, otherwise a single untagged feature. */
function buildRouteGeoJson(result: RouteResult): GeoJSON.FeatureCollection<GeoJSON.LineString> {
  const coords = result.points.map((p) => [p.lng, p.lat] as [number, number]);

  if (!result.waytypeBreakdown || result.waytypeBreakdown.length === 0) {
    return { type: "FeatureCollection", features: [{ type: "Feature", properties: {}, geometry: { type: "LineString", coordinates: coords } }] };
  }

  const features: GeoJSON.Feature<GeoJSON.LineString>[] = result.waytypeBreakdown.map((seg) => ({
    type: "Feature",
    properties: { category: seg.category, label: seg.label },
    geometry: { type: "LineString", coordinates: coords.slice(seg.startIndex, seg.endIndex + 1) },
  }));
  return { type: "FeatureCollection", features };
}

function ensureRouteLayers(map: MapLibreMap) {
  if (map.getSource(ROUTE_SOURCE_ID)) return;
  map.addSource(ROUTE_SOURCE_ID, { type: "geojson", data: EMPTY_LINE });
  map.addLayer({
    id: ROUTE_CASING_ID,
    type: "line",
    source: ROUTE_SOURCE_ID,
    layout: { "line-cap": "round", "line-join": "round" },
    paint: { "line-color": "#ffffff", "line-width": 6, "line-opacity": 0.9 },
  });
  map.addLayer({
    id: ROUTE_LINE_ID,
    type: "line",
    source: ROUTE_SOURCE_ID,
    layout: { "line-cap": "round", "line-join": "round" },
    paint: {
      // Colored by trail/road category when ORS's waytype breakdown is
      // available (see useRouteLayer's route-data builder); routes with no
      // "category" property (manual mode) fall through to the default blue.
      "line-color": ["match", ["get", "category"], "trail", "#22c55e", "road", "#f59e0b", "#2563eb"],
      "line-width": 4,
    },
  });
}

function makeMarkerElement(index: number, total: number): HTMLDivElement {
  const el = document.createElement("div");
  const isEndpoint = index === 0 || index === total - 1;
  el.style.width = isEndpoint ? "16px" : "11px";
  el.style.height = isEndpoint ? "16px" : "11px";
  el.style.borderRadius = "50%";
  el.style.background = index === 0 ? "#22c55e" : index === total - 1 ? "#ef4444" : "#2563eb";
  el.style.border = "2px solid white";
  el.style.boxShadow = "0 1px 4px rgba(0,0,0,0.5)";
  el.style.cursor = "pointer";
  return el;
}

export function useRouteLayer(
  map: MapLibreMap | null,
  state: RouteEditorState,
  dispatch: Dispatch<RouteAction>,
  routingProvider: RoutingProvider,
  outdoorProvider: OutdoorDataProvider,
  onRouteComputed: (result: RouteResult | null, error: string | null) => void,
  /** When set, displays this instead of computing from waypoints — used for
   * an imported GPX track, which is already a finished, fixed geometry
   * (not something the routing provider or waypoint editor should touch). */
  importedResult: RouteResult | null = null,
) {
  const markersRef = useRef<maplibregl.Marker[]>([]);
  const stateRef = useRef(state);
  stateRef.current = state;
  const dispatchRef = useRef(dispatch);
  dispatchRef.current = dispatch;
  const onRouteComputedRef = useRef(onRouteComputed);
  onRouteComputedRef.current = onRouteComputed;

  // Map click-to-add-waypoint, only while editing.
  useEffect(() => {
    if (!map) return;
    ensureRouteLayers(map);

    const handleClick = (e: maplibregl.MapMouseEvent) => {
      if (!stateRef.current.isEditing) return;
      const clicked = { lng: e.lngLat.lng, lat: e.lngLat.lat };
      const snapped = snapToNearestTrail(map, clicked, outdoorProvider);
      dispatchRef.current({ type: "ADD_WAYPOINT", point: snapped });
    };
    map.on("click", handleClick);
    return () => {
      map.off("click", handleClick);
    };
  }, [map, outdoorProvider]);

  // Sync waypoint markers to state.waypoints.
  useEffect(() => {
    if (!map) return;

    for (const marker of markersRef.current) marker.remove();
    markersRef.current = state.waypoints.map((point, index) => {
      const el = makeMarkerElement(index, state.waypoints.length);
      const marker = new maplibregl.Marker({ element: el, draggable: true })
        .setLngLat([point.lng, point.lat])
        .addTo(map);

      marker.on("dragend", () => {
        const { lng, lat } = marker.getLngLat();
        const snapped = snapToNearestTrail(map, { lng, lat }, outdoorProvider);
        marker.setLngLat([snapped.lng, snapped.lat]);
        dispatchRef.current({ type: "MOVE_WAYPOINT", index, point: snapped });
      });

      el.addEventListener("click", (e) => {
        e.stopPropagation();
        if (stateRef.current.isEditing) {
          dispatchRef.current({ type: "DELETE_WAYPOINT", index });
        }
      });

      return marker;
    });

    return () => {
      for (const marker of markersRef.current) marker.remove();
      markersRef.current = [];
    };
  }, [map, state.waypoints, outdoorProvider]);

  // Show an imported track as-is, bypassing the routing provider entirely.
  useEffect(() => {
    if (!map || !importedResult) return;
    const source = map.getSource(ROUTE_SOURCE_ID) as maplibregl.GeoJSONSource | undefined;
    source?.setData(buildRouteGeoJson(importedResult));
    onRouteComputedRef.current(importedResult, null);
  }, [map, importedResult]);

  // Recompute the route whenever waypoints/mode change (debounced). Skipped
  // entirely while an imported track is being shown.
  useEffect(() => {
    if (!map || importedResult) return;
    const source = map.getSource(ROUTE_SOURCE_ID) as maplibregl.GeoJSONSource | undefined;

    if (state.waypoints.length < 2) {
      source?.setData(EMPTY_LINE);
      onRouteComputedRef.current(null, null);
      return;
    }

    let cancelled = false;
    const timer = setTimeout(async () => {
      try {
        const result = await routingProvider.route(state.waypoints, state.mode);
        if (cancelled) return;
        source?.setData(buildRouteGeoJson(result));
        onRouteComputedRef.current(result, null);
      } catch (err) {
        if (cancelled) return;
        onRouteComputedRef.current(null, err instanceof Error ? err.message : String(err));
      }
    }, 400);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [map, state.waypoints, state.mode, routingProvider, importedResult]);
}
