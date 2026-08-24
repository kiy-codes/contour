import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from "react";
import * as maplibregl from "maplibre-gl";
import { Map as MapLibreMap } from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { OpenFreeMapProvider } from "../providers/MapProvider";
import { AwsTerrariumTerrainProvider } from "../providers/TerrainProvider";
import { MapLibreElevationProvider, type ElevationProvider } from "../providers/ElevationProvider";
import { OsmTransportationOutdoorProvider } from "../providers/OutdoorDataProvider";
import { OpenSkiMapProvider, type SkiLift, type SkiRun } from "../providers/SkiDataProvider";
import { EsriWorldImageryProvider } from "../providers/SatelliteProvider";
import { OpenTopoMapProvider } from "../providers/TopoProvider";
import { CompositeRoutingProvider, type RouteResult } from "../providers/RoutingProvider";
import type { LngLat, MapStyleMode } from "../providers/types";
import { useContours } from "../terrain/useContours";
import { useOutdoorLayers } from "../outdoor/useOutdoorLayers";
import { useSkiLayers } from "../ski/useSkiLayers";
import { useRouteLayer } from "../routing/useRouteLayer";
import type { RouteAction, RouteEditorState } from "../routing/routeReducer";
import type { Dispatch } from "react";
import { registerTileCacheProtocol, withCacheScheme, CACHE_SCHEME } from "../cache/tileCacheProtocol";
import type { Bbox } from "../offline/regionTiles";
import { circleRing } from "../geo/distance";

registerTileCacheProtocol();

const mapProvider = new OpenFreeMapProvider("liberty");
const terrainProvider = new AwsTerrariumTerrainProvider();
const outdoorProvider = new OsmTransportationOutdoorProvider();
const skiProvider = new OpenSkiMapProvider();
const satelliteProvider = new EsriWorldImageryProvider();
const esriApiKey = import.meta.env.VITE_ESRI_API_KEY as string | undefined;
const topoProvider = new OpenTopoMapProvider();
const routingProvider = new CompositeRoutingProvider(import.meta.env.VITE_ORS_API_KEY as string | undefined);

// See the flyTo/flyToResult comment below for why large jumps skip animation.
const ZOOM_DELTA_ANIMATE_THRESHOLD = 6;

const DEM_SOURCE_ID = "terrain-dem";
const HILLSHADE_LAYER_ID = "hillshade-layer";
const SATELLITE_SOURCE_ID = "satellite-source";
const SATELLITE_LAYER_ID = "satellite-layer";
const TOPO_SOURCE_ID = "topo-source";
const TOPO_LAYER_ID = "topo-layer";
const USER_LOCATION_ACCURACY_SOURCE_ID = "user-location-accuracy";
const USER_LOCATION_ACCURACY_LAYER_ID = "user-location-accuracy-layer";

export interface MapCanvasHandle {
  flyTo(target: LngLat, opts?: { zoom?: number; pitch?: number; bearing?: number }): void;
  /** Frames a search result — fits its bbox when one is supplied (e.g. a
   * whole country), otherwise flies to its center at a sensible zoom. */
  flyToResult(target: LngLat, bbox?: [number, number, number, number], zoom?: number): void;
  getMap(): MapLibreMap | null;
  getElevationProvider(): ElevationProvider;
  /** Whether a real OpenRouteService key is configured (VITE_ORS_API_KEY). */
  hasOrs(): boolean;
  /** Whether a real Esri ArcGIS API key is configured (VITE_ESRI_API_KEY). */
  hasEsri(): boolean;
  /** Shows/hides a small marker at a point — used to sync the elevation
   * profile chart's hover cursor to a position on the route. */
  showHoverMarker(point: LngLat | null): void;
  /** Shows/hides the GPS position marker + accuracy circle (src/geo/
   * useGeolocation.ts). Entirely separate from showHoverMarker and from
   * route waypoints — its own marker instance and its own map source. */
  showUserLocationMarker(fix: { point: LngLat; accuracy: number } | null): void;
}

export interface MapCanvasProps {
  /** Only "standard" has a real provider wired up so far — see MapModeSwitcher. */
  mode?: MapStyleMode;
  terrainEnabled?: boolean;
  terrainExaggeration?: number;
  contoursEnabled?: boolean;
  hikingTrailsEnabled?: boolean;
  longDistanceTrailsEnabled?: boolean;
  trailNamesEnabled?: boolean;
  skiRunsEnabled?: boolean;
  skiDifficultyColoursEnabled?: boolean;
  skiLiftsEnabled?: boolean;
  skiRunNamesEnabled?: boolean;
  skiLiftNamesEnabled?: boolean;
  routeState: RouteEditorState;
  routeDispatch: Dispatch<RouteAction>;
  importedRoute?: RouteResult | null;
  onElevationHover?: (elevation: number | null, point: LngLat) => void;
  onSkiRunClick?: (run: SkiRun) => void;
  onSkiLiftClick?: (lift: SkiLift) => void;
  onRouteComputed?: (result: RouteResult | null, error: string | null) => void;
  /** When true, drag-select on the map draws a rectangle instead of
   * panning — used to define an offline download region (see
   * src/offline/). Pan/rotate are restored automatically when this goes
   * false or the component unmounts. */
  regionDrawEnabled?: boolean;
  onRegionDrawn?: (bbox: Bbox) => void;
}

function addTerrainLayers(map: MapLibreMap) {
  if (!map.getSource(DEM_SOURCE_ID)) {
    map.addSource(DEM_SOURCE_ID, {
      type: "raster-dem",
      tiles: [withCacheScheme(terrainProvider.getTileUrlTemplate())],
      tileSize: terrainProvider.tileSize,
      maxzoom: terrainProvider.maxZoom,
      encoding: terrainProvider.encoding,
      attribution: terrainProvider.attribution.html,
    });
  }
  if (!map.getLayer(HILLSHADE_LAYER_ID)) {
    const firstSymbolId = map.getStyle().layers?.find((l) => l.type === "symbol")?.id;
    map.addLayer(
      {
        id: HILLSHADE_LAYER_ID,
        type: "hillshade",
        source: DEM_SOURCE_ID,
        layout: { visibility: "none" },
        paint: {
          "hillshade-shadow-color": "#3b2f1f",
          // Fades out well past the DEM's real maxzoom (15) — hillshade
          // computes per-pixel shading from the heightmap texture, and
          // magnifying that texture far beyond its native resolution turns
          // each source pixel's shading into a visible flat-shaded "step",
          // which reads as banding/terracing once you're zoomed in close.
          // The terrain displacement mesh itself holds up fine that close
          // (confirmed visually); it's specifically this paint layer's
          // shading computation that needed to back off.
          "hillshade-exaggeration": ["interpolate", ["linear"], ["zoom"], 13, 0.5, 15, 0.4, 17, 0.15, 19, 0.02],
        },
      },
      firstSymbolId,
    );
  }
}

/** Inserted below the base style's symbol layers (like hillshade), so
 * place-name/road labels stay legible on top of the imagery — a hybrid
 * look rather than imagery replacing the whole style. Hidden by default;
 * MapCanvas toggles visibility based on the `mode` prop. */
function addSatelliteLayer(map: MapLibreMap) {
  if (!esriApiKey || map.getSource(SATELLITE_SOURCE_ID)) return;
  map.addSource(SATELLITE_SOURCE_ID, {
    type: "raster",
    tiles: [withCacheScheme(satelliteProvider.getTileUrlTemplate(esriApiKey))],
    tileSize: 256,
    maxzoom: satelliteProvider.maxZoom,
    attribution: satelliteProvider.attribution.html,
  });
  const firstSymbolId = map.getStyle().layers?.find((l) => l.type === "symbol")?.id;
  map.addLayer(
    { id: SATELLITE_LAYER_ID, type: "raster", source: SATELLITE_SOURCE_ID, layout: { visibility: "none" } },
    firstSymbolId,
  );
}

/** Flat 2D "Terrain" mode — hillshaded/hypsometric raster overlay, same
 * hybrid approach as satellite (inserted below labels, hidden by default). */
function addTopoLayer(map: MapLibreMap) {
  if (map.getSource(TOPO_SOURCE_ID)) return;
  map.addSource(TOPO_SOURCE_ID, {
    type: "raster",
    tiles: topoProvider.tileUrlTemplates.map(withCacheScheme),
    tileSize: 256,
    maxzoom: topoProvider.maxZoom,
    attribution: topoProvider.attribution.html,
  });
  const firstSymbolId = map.getStyle().layers?.find((l) => l.type === "symbol")?.id;
  map.addLayer(
    { id: TOPO_LAYER_ID, type: "raster", source: TOPO_SOURCE_ID, layout: { visibility: "none" } },
    firstSymbolId,
  );
}

const MapCanvas = forwardRef<MapCanvasHandle, MapCanvasProps>(
  (
    {
      mode = "standard",
      terrainEnabled = false,
      terrainExaggeration = 1.5,
      contoursEnabled = false,
      hikingTrailsEnabled = false,
      longDistanceTrailsEnabled = false,
      trailNamesEnabled = false,
      skiRunsEnabled = false,
      skiDifficultyColoursEnabled = true,
      skiLiftsEnabled = false,
      skiRunNamesEnabled = false,
      skiLiftNamesEnabled = false,
      routeState,
      routeDispatch,
      importedRoute = null,
      onElevationHover,
      onSkiRunClick,
      onSkiLiftClick,
      onRouteComputed,
      regionDrawEnabled = false,
      onRegionDrawn,
    },
    ref,
  ) => {
    const containerRef = useRef<HTMLDivElement | null>(null);
    const mapRef = useRef<MapLibreMap | null>(null);
    const [mapReady, setMapReady] = useState<MapLibreMap | null>(null);
    const elevationProviderRef = useRef(new MapLibreElevationProvider(() => mapRef.current));
    const onElevationHoverRef = useRef(onElevationHover);
    onElevationHoverRef.current = onElevationHover;
    const hoverMarkerRef = useRef<maplibregl.Marker | null>(null);
    const userLocationMarkerRef = useRef<maplibregl.Marker | null>(null);

    useImperativeHandle(ref, () => ({
      flyTo(target, opts) {
        const map = mapRef.current;
        if (!map) return;
        const zoom = opts?.zoom ?? 12;
        const pitch = opts?.pitch ?? 60;
        const bearing = opts?.bearing ?? 0;
        // A flyTo spanning a huge zoom delta (e.g. from the fully-zoomed-out
        // globe down to a street-level zoom) forces MapLibre to reproject
        // the globe every animated frame across that whole range — on
        // weaker/mobile GPUs this pegs the main thread hard enough that the
        // WebView compositor stalls and never recovers on its own (observed
        // as a permanently blank map after a search from the initial globe
        // view on Android). A plain unanimated jump sidesteps the expensive
        // per-frame reprojection entirely; only large jumps pay this cost,
        // so normal nearby flyTos keep their smooth animation.
        if (Math.abs(zoom - map.getZoom()) > ZOOM_DELTA_ANIMATE_THRESHOLD) {
          map.jumpTo({ center: [target.lng, target.lat], zoom, pitch, bearing });
          return;
        }
        map.flyTo({
          center: [target.lng, target.lat],
          zoom,
          pitch,
          bearing,
          duration: 2500,
          essential: true,
          curve: 1.4,
        });
      },
      flyToResult(target, bbox, zoom) {
        const map = mapRef.current;
        if (!map) return;
        if (bbox) {
          map.fitBounds(
            [
              [bbox[0], bbox[1]],
              [bbox[2], bbox[3]],
            ],
            { padding: 80, duration: 2500, pitch: 45, essential: true },
          );
        } else {
          const targetZoom = zoom ?? 12;
          if (Math.abs(targetZoom - map.getZoom()) > ZOOM_DELTA_ANIMATE_THRESHOLD) {
            map.jumpTo({ center: [target.lng, target.lat], zoom: targetZoom, pitch: 60 });
          } else {
            map.flyTo({
              center: [target.lng, target.lat],
              zoom: targetZoom,
              pitch: 60,
              duration: 2500,
              essential: true,
              curve: 1.4,
            });
          }
        }
      },
      getMap() {
        return mapRef.current;
      },
      getElevationProvider() {
        return elevationProviderRef.current;
      },
      hasOrs() {
        return routingProvider.hasOrs;
      },
      hasEsri() {
        return Boolean(esriApiKey);
      },
      showHoverMarker(point) {
        const map = mapRef.current;
        if (!map) return;
        if (!point) {
          hoverMarkerRef.current?.remove();
          hoverMarkerRef.current = null;
          return;
        }
        if (!hoverMarkerRef.current) {
          const el = document.createElement("div");
          el.style.width = "12px";
          el.style.height = "12px";
          el.style.borderRadius = "50%";
          el.style.background = "#ffffff";
          el.style.border = "2px solid #2563eb";
          el.style.boxShadow = "0 1px 4px rgba(0,0,0,0.6)";
          el.style.pointerEvents = "none";
          hoverMarkerRef.current = new maplibregl.Marker({ element: el }).setLngLat([point.lng, point.lat]).addTo(map);
        } else {
          hoverMarkerRef.current.setLngLat([point.lng, point.lat]);
        }
      },
      showUserLocationMarker(fix) {
        const map = mapRef.current;
        if (!map) return;

        if (!fix) {
          userLocationMarkerRef.current?.remove();
          userLocationMarkerRef.current = null;
          if (map.getLayer(USER_LOCATION_ACCURACY_LAYER_ID)) map.setLayoutProperty(USER_LOCATION_ACCURACY_LAYER_ID, "visibility", "none");
          return;
        }

        const ring = circleRing(fix.point, fix.accuracy);
        const circleData: GeoJSON.Feature = { type: "Feature", properties: {}, geometry: { type: "Polygon", coordinates: [ring] } };
        const circleSource = map.getSource(USER_LOCATION_ACCURACY_SOURCE_ID) as maplibregl.GeoJSONSource | undefined;
        if (circleSource) {
          circleSource.setData(circleData);
          map.setLayoutProperty(USER_LOCATION_ACCURACY_LAYER_ID, "visibility", "visible");
        } else {
          map.addSource(USER_LOCATION_ACCURACY_SOURCE_ID, { type: "geojson", data: circleData });
          map.addLayer({
            id: USER_LOCATION_ACCURACY_LAYER_ID,
            type: "fill",
            source: USER_LOCATION_ACCURACY_SOURCE_ID,
            paint: { "fill-color": "#2563eb", "fill-opacity": 0.15 },
          });
        }

        if (!userLocationMarkerRef.current) {
          // Deliberately distinct from both the route-elevation hover
          // marker (white/blue outline dot) and route waypoint markers
          // (rendered separately by useRouteLayer) — this one is a solid
          // blue dot with a white ring, the conventional "you are here"
          // look, so it's never mistaken for either.
          const el = document.createElement("div");
          el.style.width = "16px";
          el.style.height = "16px";
          el.style.borderRadius = "50%";
          el.style.background = "#2563eb";
          el.style.border = "3px solid #ffffff";
          el.style.boxShadow = "0 1px 4px rgba(0,0,0,0.5)";
          el.style.pointerEvents = "none";
          userLocationMarkerRef.current = new maplibregl.Marker({ element: el }).setLngLat([fix.point.lng, fix.point.lat]).addTo(map);
        } else {
          userLocationMarkerRef.current.setLngLat([fix.point.lng, fix.point.lat]);
        }
      },
    }));

    useContours(mapReady, contoursEnabled, terrainProvider);
    useOutdoorLayers(mapReady, outdoorProvider, {
      hikingTrailsEnabled,
      longDistanceTrailsEnabled,
      trailNamesEnabled,
    });
    useSkiLayers(
      mapReady,
      skiProvider,
      {
        runsEnabled: skiRunsEnabled,
        difficultyColoursEnabled: skiDifficultyColoursEnabled,
        liftsEnabled: skiLiftsEnabled,
        runNamesEnabled: skiRunNamesEnabled,
        liftNamesEnabled: skiLiftNamesEnabled,
      },
      onSkiRunClick,
      onSkiLiftClick,
    );
    useRouteLayer(
      mapReady,
      routeState,
      routeDispatch,
      routingProvider,
      outdoorProvider,
      onRouteComputed ?? (() => {}),
      importedRoute,
    );

    useEffect(() => {
      if (!containerRef.current || mapRef.current) return;

      let cancelled = false;

      (async () => {
        const style = await mapProvider.getStyle();
        if (cancelled || !containerRef.current) return;

        const map = new maplibregl.Map({
          container: containerRef.current,
          style,
          center: [10, 30],
          zoom: 1.8,
          pitch: 0,
          bearing: 0,
          canvasContextAttributes: { antialias: true },
          attributionControl: false,
          // Larger in-memory decoded-tile pool (default 512) — this is
          // separate from the on-disk cache; a bigger one means panning
          // back over recently-seen area redraws from memory instead of
          // re-decoding from disk/network.
          maxTileCacheSize: 2000,
          // Skip revalidation round-trips for tiles our own cache already
          // has — we manage staleness via the LRU cap, not HTTP expiry.
          refreshExpiredTiles: false,
          // Routes every base-style request (the style JSON itself, sprite
          // image/JSON, glyph PBFs, and vector tiles) through the same
          // on-disk cache the other sources already use — previously only
          // DEM/satellite/ski/topo/waymarked tiles were cached, leaving out
          // the base map, which is what's on screen 100% of the time. The
          // wmcache:// guard prevents double-wrapping URLs those other
          // sources already prefixed themselves.
          transformRequest: (url) => (url.startsWith(`${CACHE_SCHEME}://`) ? { url } : { url: withCacheScheme(url) }),
        });
        mapRef.current = map;
        if (import.meta.env.DEV) {
          (window as unknown as { __map: MapLibreMap }).__map = map;
          (window as unknown as { __routingProvider: typeof routingProvider }).__routingProvider = routingProvider;
        }

        map.on("style.load", () => {
          map.setProjection({ type: "globe" });
          map.setSky({
            "sky-color": "#0b1020",
            "horizon-color": "#7fa8c9",
            "fog-color": "#cfe3f2",
            "sky-horizon-blend": 0.6,
            "horizon-fog-blend": 0.5,
            "fog-ground-blend": 0.4,
            "atmosphere-blend": ["interpolate", ["linear"], ["zoom"], 0, 1, 5, 1, 12, 0],
          } as maplibregl.SkySpecification);
          addTerrainLayers(map);
          addSatelliteLayer(map);
          addTopoLayer(map);
          setMapReady(map);
        });

        map.on("mousemove", async (e) => {
          if (!onElevationHoverRef.current) return;
          const point = { lng: e.lngLat.lng, lat: e.lngLat.lat };
          const elevation = await elevationProviderRef.current.getElevation(point);
          onElevationHoverRef.current(elevation, point);
        });

        map.addControl(new maplibregl.NavigationControl({ visualizePitch: true }), "top-right");
        map.addControl(
          new maplibregl.AttributionControl({
            compact: true,
            customAttribution: [mapProvider.attribution.html, terrainProvider.attribution.html],
          }),
          "bottom-right",
        );
        // MapLibre's own compact-attribution logic auto-adds
        // "maplibregl-compact-show" (showing the full text) whenever the
        // container is wide enough, independent of the <details> element's
        // real open/closed state — a pure CSS override of that class was
        // tried and either did nothing (lost the specificity fight) or, if
        // forced to always-win, would have permanently blocked the actual
        // click-to-expand toggle too, since both cases render via the same
        // class. Removing it once, right after mount, leaves the control's
        // own click handling (which re-adds it correctly) fully intact.
        map.getContainer().querySelector(".maplibregl-ctrl-attrib")?.classList.remove("maplibregl-compact-show");
      })();

      return () => {
        cancelled = true;
        mapRef.current?.remove();
        mapRef.current = null;
        setMapReady(null);
      };
    }, []);

    useEffect(() => {
      // Gate on our own `mapReady` (set once after "style.load", once
      // addTerrainLayers has run) rather than map.isStyleLoaded() — that
      // stays false indefinitely once a raster-dem source is present
      // (outstanding DEM tile requests keep the style "not fully loaded"),
      // which made this effect a permanent no-op when gated on it.
      if (!mapReady) return;
      mapReady.setTerrain(terrainEnabled ? { source: DEM_SOURCE_ID, exaggeration: terrainExaggeration } : null);
      if (mapReady.getLayer(HILLSHADE_LAYER_ID)) {
        mapReady.setLayoutProperty(HILLSHADE_LAYER_ID, "visibility", terrainEnabled ? "visible" : "none");
      }
    }, [terrainEnabled, terrainExaggeration, mapReady]);

    useEffect(() => {
      if (!mapReady || !mapReady.getLayer(SATELLITE_LAYER_ID)) return;
      mapReady.setLayoutProperty(SATELLITE_LAYER_ID, "visibility", mode === "satellite" ? "visible" : "none");
    }, [mode, mapReady]);

    useEffect(() => {
      if (!mapReady || !mapReady.getLayer(TOPO_LAYER_ID)) return;
      mapReady.setLayoutProperty(TOPO_LAYER_ID, "visibility", mode === "terrain" ? "visible" : "none");
    }, [mode, mapReady]);

    useEffect(() => {
      const map = mapReady;
      if (!map || !regionDrawEnabled) return;

      const RECT_SOURCE_ID = "region-draw-rect";
      const RECT_FILL_ID = "region-draw-rect-fill";
      const RECT_LINE_ID = "region-draw-rect-line";
      let startLngLat: maplibregl.LngLat | null = null;

      const rectRingFor = (a: maplibregl.LngLat, b: maplibregl.LngLat) => {
        const west = Math.min(a.lng, b.lng);
        const east = Math.max(a.lng, b.lng);
        const south = Math.min(a.lat, b.lat);
        const north = Math.max(a.lat, b.lat);
        return {
          bbox: [west, south, east, north] as Bbox,
          ring: [
            [west, south],
            [east, south],
            [east, north],
            [west, north],
            [west, south],
          ] as [number, number][],
        };
      };

      const setRect = (ring: [number, number][]) => {
        const data: GeoJSON.Feature = { type: "Feature", properties: {}, geometry: { type: "Polygon", coordinates: [ring] } };
        const source = map.getSource(RECT_SOURCE_ID) as maplibregl.GeoJSONSource | undefined;
        if (source) {
          source.setData(data);
          return;
        }
        map.addSource(RECT_SOURCE_ID, { type: "geojson", data });
        map.addLayer({ id: RECT_FILL_ID, type: "fill", source: RECT_SOURCE_ID, paint: { "fill-color": "#4682f0", "fill-opacity": 0.15 } });
        map.addLayer({
          id: RECT_LINE_ID,
          type: "line",
          source: RECT_SOURCE_ID,
          paint: { "line-color": "#4682f0", "line-width": 2, "line-dasharray": [2, 1.5] },
        });
      };

      const clearRect = () => {
        if (map.getLayer(RECT_LINE_ID)) map.removeLayer(RECT_LINE_ID);
        if (map.getLayer(RECT_FILL_ID)) map.removeLayer(RECT_FILL_ID);
        if (map.getSource(RECT_SOURCE_ID)) map.removeSource(RECT_SOURCE_ID);
      };

      const onMouseDown = (e: maplibregl.MapMouseEvent) => {
        e.preventDefault();
        startLngLat = e.lngLat;
        map.dragPan.disable();
        map.dragRotate.disable();
      };
      const onMouseMove = (e: maplibregl.MapMouseEvent) => {
        if (!startLngLat) return;
        setRect(rectRingFor(startLngLat, e.lngLat).ring);
      };
      const onMouseUp = (e: maplibregl.MapMouseEvent) => {
        if (!startLngLat) return;
        const { bbox } = rectRingFor(startLngLat, e.lngLat);
        startLngLat = null;
        map.dragPan.enable();
        map.dragRotate.enable();
        clearRect();
        // Ignore an accidental click/tiny-drag rather than treating it as a
        // (degenerate, near-zero-area) region.
        if (bbox[2] - bbox[0] > 0.0005 && bbox[3] - bbox[1] > 0.0005) {
          onRegionDrawn?.(bbox);
        }
      };

      map.getCanvas().style.cursor = "crosshair";
      map.on("mousedown", onMouseDown);
      map.on("mousemove", onMouseMove);
      map.on("mouseup", onMouseUp);

      return () => {
        map.off("mousedown", onMouseDown);
        map.off("mousemove", onMouseMove);
        map.off("mouseup", onMouseUp);
        map.dragPan.enable();
        map.dragRotate.enable();
        map.getCanvas().style.cursor = "";
        clearRect();
      };
    }, [mapReady, regionDrawEnabled, onRegionDrawn]);

    return <div ref={containerRef} style={{ position: "absolute", inset: 0 }} />;
  },
);

MapCanvas.displayName = "MapCanvas";

export default MapCanvas;
