import { useCallback, useEffect, useReducer, useRef, useState } from "react";
import MapCanvas, { type MapCanvasHandle } from "./map/MapCanvas";
import { loadRenderSettings, saveRenderSettings, type RenderSettings } from "./render/renderSettings";
import RouteControls from "./map/RouteControls";
import RouteStatsPanel from "./map/RouteStatsPanel";
import SearchBar from "./map/SearchBar";
import PlaceInfoPanel from "./map/PlaceInfoPanel";
import SkiInfoPanel, { type SkiInfoTarget } from "./map/SkiInfoPanel";
import SettingsMenu from "./map/SettingsMenu";
import LayersSheet from "./map/LayersSheet";
import LayersMenu from "./map/LayersMenu";
import RegionDrawTool from "./map/RegionDrawTool";
import OfflineDownloadPanel from "./map/OfflineDownloadPanel";
import OfflineRegionsManager from "./map/OfflineRegionsManager";
import type { Bbox } from "./offline/regionTiles";
import LocationControl from "./map/LocationControl";
import { useGeolocation } from "./geo/useGeolocation";
import { useWakeLock } from "./geo/useWakeLock";
import { useRouteNavigation } from "./routing/useRouteNavigation";
import { useSimulatedNavigationFix } from "./routing/useSimulatedNavigationFix";
import NavigationPanel from "./map/NavigationPanel";
import GlassDistortionFilter from "./theme/GlassDistortionFilter";
import { useIsMobile } from "./theme/useIsMobile";
import { CompositeGeocodingProvider, type SearchResult } from "./providers/GeocodingProvider";
import type { SkiLift, SkiRun } from "./providers/SkiDataProvider";
import type { RouteResult } from "./providers/RoutingProvider";
import type { LngLat, MapStyleMode } from "./providers/types";
import { pathLength, boundsOf } from "./geo/distance";
import { routeReducer, initialRouteEditorState } from "./routing/routeReducer";
import { computeElevationProfile, type ProfilePoint, type ProfileStats } from "./routing/elevationProfile";
import { estimateHikingDurationSeconds } from "./routing/timeEstimate";
import { buildGpxXml, suggestGpxFilename } from "./gpx/gpxExport";
import { buildGeoJson, suggestGeoJsonFilename } from "./gpx/geoJsonExport";
import { parseGpx } from "./gpx/gpxImport";
import { parseGeoJson } from "./gpx/geoJsonImport";
import { parseKml } from "./gpx/kmlImport";
import { saveGpxFile, openTrackFile, saveTextFile } from "./gpx/gpxFileIO";
import type { WeatherMapLayerId } from "./providers/WeatherProvider";
import { weatherForecastProvider } from "./providers/weatherInstances";
import { useWeatherForecast } from "./weather/useWeatherForecast";
import type { WeatherTileStatus } from "./weather/useWeatherMapLayer";
import type { AvalancheRegionFeature } from "./providers/AvalancheProvider";
import type { AvalancheStatus } from "./avalanche/useAvalancheLayer";
import AvalancheInfoPanel from "./map/AvalancheInfoPanel";
import RoutePlannerPanel from "./map/RoutePlannerPanel";
import SavedRoutesPanel from "./map/SavedRoutesPanel";
import { createSavedRoute, type SavedRoute } from "./routing/savedRoutes";
import type { RouteConstraints, RoutingMode } from "./providers/RoutingProvider";
import { formatCoordinate, coordinateToClipboardText } from "./geo/coordinateFormat";
import { useCoordinateFormat } from "./geo/CoordinateFormatContext";
import MeasureTool, { type MeasureMode } from "./map/MeasureTool";
import GarminExportPanel from "./map/GarminExportPanel";
import "./App.css";

const geocodingProvider = new CompositeGeocodingProvider();
const hasOrs = Boolean(import.meta.env.VITE_ORS_API_KEY);
const hasEsri = Boolean(import.meta.env.VITE_ESRI_API_KEY);
const hasOwm = Boolean(import.meta.env.VITE_OWM_API_KEY);

const ZOOM_BY_TYPE: Record<SearchResult["type"], number> = {
  country: 5,
  region: 7,
  city: 11,
  town: 12,
  village: 13,
  street: 15,
  address: 16,
  peak: 13,
  lake: 12,
  poi: 14,
  other: 12,
};

const EMPTY_PROFILE_STATS: ProfileStats = {
  profile: [],
  computedAscentMeters: 0,
  computedDescentMeters: 0,
  maxSlopePercent: 0,
  avgSlopePercent: 0,
  minElevationMeters: 0,
  maxElevationMeters: 0,
  steepSections: [],
  hasElevationData: false,
};

function App() {
  const isMobile = useIsMobile();
  const { format: coordFormat } = useCoordinateFormat();
  const mapHandle = useRef<MapCanvasHandle>(null);
  // Live GPS route-following. Foreground-only — the geolocation plugin
  // tears down updates the moment the app is backgrounded/screen-locks (see
  // useGeolocation.ts), so this is a real, documented limit, not a bug.
  const [navigationActive, setNavigationActive] = useState(false);
  const geolocation = useGeolocation({ highFrequency: navigationActive });
  const [mode, setMode] = useState<MapStyleMode>("standard");
  const [terrainEnabled, setTerrainEnabled] = useState(false);
  const [exaggeration, setExaggeration] = useState(1);
  // Mobile-only for now (see SettingsMenu) — makes tile detail fall off
  // faster toward the horizon, cutting the tile churn behind the lag
  // confirmed live in 3D on a real Android device.
  const [performanceMode, setPerformanceMode] = useState(false);
  const [renderSettings, setRenderSettings] = useState(loadRenderSettings);
  const updateRenderSettings = useCallback((next: RenderSettings) => {
    setRenderSettings(next);
    saveRenderSettings(next);
  }, []);
  const [contoursEnabled, setContoursEnabled] = useState(false);
  const [hikingTrailsEnabled, setHikingTrailsEnabled] = useState(false);
  const [longDistanceTrailsEnabled, setLongDistanceTrailsEnabled] = useState(false);
  const [trailNamesEnabled, setTrailNamesEnabled] = useState(false);
  const [skiRunsEnabled, setSkiRunsEnabled] = useState(false);
  const [skiDifficultyColoursEnabled, setSkiDifficultyColoursEnabled] = useState(true);
  const [skiLiftsEnabled, setSkiLiftsEnabled] = useState(false);
  const [skiRunNamesEnabled, setSkiRunNamesEnabled] = useState(false);
  const [skiLiftNamesEnabled, setSkiLiftNamesEnabled] = useState(false);
  const [hoverElevation, setHoverElevation] = useState<number | null>(null);
  const [hoverPoint, setHoverPoint] = useState<LngLat | null>(null);
  const [coordCopied, setCoordCopied] = useState(false);
  const [selectedPlace, setSelectedPlace] = useState<SearchResult | null>(null);
  const [placeElevation, setPlaceElevation] = useState<number | null | "loading">(null);
  const [skiTarget, setSkiTarget] = useState<SkiInfoTarget | null>(null);
  const [routeState, routeDispatch] = useReducer(routeReducer, initialRouteEditorState);
  const [routeResult, setRouteResult] = useState<RouteResult | null>(null);
  const [routeError, setRouteError] = useState<string | null>(null);
  const [profileStats, setProfileStats] = useState<ProfileStats>(EMPTY_PROFILE_STATS);
  const [importedRoute, setImportedRoute] = useState<RouteResult | null>(null);
  const [importedRouteName, setImportedRouteName] = useState<string>("Route");
  const [gpxNotice, setGpxNotice] = useState<string | null>(null);
  const [regionDrawActive, setRegionDrawActive] = useState(false);
  const [drawnBbox, setDrawnBbox] = useState<Bbox | null>(null);
  const [offlineManagerOpen, setOfflineManagerOpen] = useState(false);
  const [isOnline, setIsOnline] = useState(() => navigator.onLine);
  const [weatherMapLayer, setWeatherMapLayer] = useState<WeatherMapLayerId | "none">("none");
  const [weatherTileStatus, setWeatherTileStatus] = useState<WeatherTileStatus>("idle");
  const [weatherLastRefreshedAt, setWeatherLastRefreshedAt] = useState<number | null>(null);
  const [weatherForecastEnabled, setWeatherForecastEnabled] = useState(false);
  const [weatherHourIndex, setWeatherHourIndex] = useState(0);
  const [mapCenter, setMapCenter] = useState<LngLat | null>(null);
  const weatherForecast = useWeatherForecast(weatherForecastProvider, mapCenter, weatherForecastEnabled);
  const [avalancheEnabled, setAvalancheEnabled] = useState(false);
  const [avalancheStatus, setAvalancheStatus] = useState<AvalancheStatus>("idle");
  const [avalancheError, setAvalancheError] = useState<string | null>(null);
  const [avalancheRegionCount, setAvalancheRegionCount] = useState(0);
  const [avalancheFetchedAt, setAvalancheFetchedAt] = useState<number | null>(null);
  const [avalancheTarget, setAvalancheTarget] = useState<AvalancheRegionFeature | null>(null);
  const [routePlannerOpen, setRoutePlannerOpen] = useState(false);
  const [savedRoutesOpen, setSavedRoutesOpen] = useState(false);
  const [plannerStartPoint, setPlannerStartPoint] = useState<LngLat | null>(null);
  const [plannerStartLabel, setPlannerStartLabel] = useState<string>("Map center");
  const [plannerEndPoint, setPlannerEndPoint] = useState<LngLat | null>(null);
  const [pickPointActive, setPickPointActive] = useState(false);
  const [measureMode, setMeasureMode] = useState<MeasureMode>("off");
  const [measurePointCount, setMeasurePointCount] = useState(0);
  const [measureTotalMeters, setMeasureTotalMeters] = useState(0);
  const [measureAreaSqMeters, setMeasureAreaSqMeters] = useState<number | null>(null);
  const [gridEnabled, setGridEnabled] = useState(false);
  const [garminExportOpen, setGarminExportOpen] = useState(false);

  // Whichever route is actually on screen right now — an imported track
  // takes precedence over an in-progress computed route.
  const activeResult = importedRoute ?? routeResult;

  useWakeLock(navigationActive);
  // DEV-only fallback so navigation mode can be exercised on the desktop
  // dev server without real GPS — always null in a production build (the
  // import.meta.env.DEV check), so this never affects a shipped app.
  const simulatedNavigationFix = useSimulatedNavigationFix(activeResult, import.meta.env.DEV && navigationActive);
  const { progress: navigationProgress, etaSeconds: navigationEtaSeconds } = useRouteNavigation(
    activeResult,
    navigationActive,
    geolocation.position,
    simulatedNavigationFix,
  );
  // Real GPS still wins for the on-map marker too — see useRouteNavigation
  // for why the simulator is a fallback, never an override.
  const navigationDisplayFix = geolocation.position ?? simulatedNavigationFix;

  const handleStartNavigation = () => {
    if (geolocation.status !== "active" && geolocation.status !== "locating") geolocation.enable();
    setNavigationActive(true);
  };
  const handleStopNavigation = () => setNavigationActive(false);

  // On mobile, RouteControls' floating panel becomes a full-width bottom
  // bar (see RouteControls.tsx) — showing the stats panel at the same time
  // would fight it for the same screen real estate, so hide stats while
  // any of that bar's variants are up; it reappears once collapsed back to
  // the FAB (Finish/Clear/Start-new all lead there).
  const mobileRouteBarShowing = isMobile && (routeState.isEditing || routeState.waypoints.length > 0 || importedRoute !== null);

  const handleElevationHover = (elevation: number | null, point: LngLat) => {
    setHoverElevation(elevation);
    setHoverPoint(point);
  };

  const handleCopyCoordinate = () => {
    if (!hoverPoint) return;
    navigator.clipboard
      .writeText(coordinateToClipboardText(hoverPoint))
      .then(() => {
        setCoordCopied(true);
        setTimeout(() => setCoordCopied(false), 1500);
      })
      .catch(() => {});
  };

  const handleSelectResult = async (result: SearchResult) => {
    setSkiTarget(null);
    setAvalancheTarget(null);
    mapHandle.current?.flyToResult(result.center, result.bbox, ZOOM_BY_TYPE[result.type]);
    setSelectedPlace(result);
    setPlaceElevation("loading");
    const elevationProvider = mapHandle.current?.getElevationProvider();
    const elevation = elevationProvider ? await elevationProvider.getElevation(result.center) : null;
    setPlaceElevation(elevation);
  };

  const handleSkiRunClick = async (run: SkiRun) => {
    setSelectedPlace(null);
    setAvalancheTarget(null);
    const lengthMeters = pathLength(run.geometry);
    setSkiTarget({ kind: "run", run: { ...run, lengthMeters } });
    const elevationProvider = mapHandle.current?.getElevationProvider();
    if (!elevationProvider || run.geometry.length === 0) return;
    const [startElevation, endElevation] = await Promise.all([
      elevationProvider.getElevation(run.geometry[0]),
      elevationProvider.getElevation(run.geometry[run.geometry.length - 1]),
    ]);
    setSkiTarget({ kind: "run", run: { ...run, lengthMeters, startElevation, endElevation } });
  };

  const handleSkiLiftClick = async (lift: SkiLift) => {
    setSelectedPlace(null);
    setAvalancheTarget(null);
    setSkiTarget({ kind: "lift", lift });
    const elevationProvider = mapHandle.current?.getElevationProvider();
    if (!elevationProvider || lift.geometry.length === 0) return;
    const [startElevation, endElevation] = await Promise.all([
      elevationProvider.getElevation(lift.geometry[0]),
      elevationProvider.getElevation(lift.geometry[lift.geometry.length - 1]),
    ]);
    setSkiTarget({ kind: "lift", lift: { ...lift, startElevation, endElevation } });
  };

  const handleRouteComputed = (result: RouteResult | null, error: string | null) => {
    setRouteResult(result);
    setRouteError(error);
  };

  // Build the elevation profile (and, for manual/imported routes with no
  // ORS-supplied ascent/descent, the noise-filtered gain/loss + slope stats)
  // whenever the on-screen route changes.
  useEffect(() => {
    if (!activeResult) {
      setProfileStats(EMPTY_PROFILE_STATS);
      return;
    }
    let cancelled = false;
    const elevationProvider = mapHandle.current?.getElevationProvider();
    if (!elevationProvider) return;
    computeElevationProfile(activeResult, elevationProvider).then((stats) => {
      if (!cancelled) setProfileStats(stats);
    });
    return () => {
      cancelled = true;
    };
  }, [activeResult]);

  const handleProfileHover = (point: ProfilePoint | null) => {
    mapHandle.current?.showHoverMarker(point ? { lng: point.lng, lat: point.lat } : null);
  };

  useEffect(() => {
    if (!gpxNotice) return;
    const timer = setTimeout(() => setGpxNotice(null), 4000);
    return () => clearTimeout(timer);
  }, [gpxNotice]);

  useEffect(() => {
    const onOnline = () => setIsOnline(true);
    const onOffline = () => setIsOnline(false);
    window.addEventListener("online", onOnline);
    window.addEventListener("offline", onOffline);
    return () => {
      window.removeEventListener("online", onOnline);
      window.removeEventListener("offline", onOffline);
    };
  }, []);

  useEffect(() => {
    mapHandle.current?.showUserLocationMarker(navigationActive ? navigationDisplayFix : geolocation.position);
  }, [geolocation.position, navigationActive, navigationDisplayFix]);

  const handleRecenterOnLocation = () => {
    if (geolocation.position) mapHandle.current?.flyTo(geolocation.position.point, { pitch: 0 });
  };

  const handleStartRouteHere = () => {
    if (!geolocation.position) return;
    handleStartRoute();
    routeDispatch({ type: "ADD_WAYPOINT", point: geolocation.position.point });
  };

  const handleMoveEnd = (center: LngLat) => setMapCenter(center);
  const handleWeatherTileStatusChange = (status: WeatherTileStatus, lastRefreshedAt: number | null) => {
    setWeatherTileStatus(status);
    setWeatherLastRefreshedAt(lastRefreshedAt);
  };
  const handleAvalancheSelect = (feature: AvalancheRegionFeature) => {
    setSelectedPlace(null);
    setSkiTarget(null);
    setAvalancheTarget(feature);
  };
  const handleAvalancheStatusChange = (
    status: AvalancheStatus,
    error: string | null,
    regionCount: number,
    fetchedAt: number | null,
  ) => {
    setAvalancheStatus(status);
    setAvalancheError(error);
    setAvalancheRegionCount(regionCount);
    setAvalancheFetchedAt(fetchedAt);
  };

  // Forecast hour indices are only meaningful relative to the currently
  // loaded hours array — clamp back into range whenever a fresh (shorter or
  // differently-timed) forecast lands, rather than pointing at a stale index.
  useEffect(() => {
    const count = weatherForecast.data?.hours.length ?? 0;
    if (count > 0 && weatherHourIndex >= count) setWeatherHourIndex(0);
  }, [weatherForecast.data, weatherHourIndex]);

  const handleRegionDrawn = (bbox: Bbox) => {
    setRegionDrawActive(false);
    setDrawnBbox(bbox);
  };

  const handleFlyToOfflineRegion = (bbox: Bbox) => {
    mapHandle.current?.flyToResult({ lng: (bbox[0] + bbox[2]) / 2, lat: (bbox[1] + bbox[3]) / 2 }, bbox);
  };

  // Hiking trails are the whole point of route editing, so switch them on
  // automatically while editing — but only restore them to off on finish if
  // they were actually off beforehand; if the user already had them on (or
  // turned them on/off themselves mid-edit), finishing leaves that alone.
  const hikingTrailsWasOffRef = useRef(false);
  const handleStartRoute = () => {
    // Mutually exclusive with the route planner and saved-routes library —
    // all three are ways to get a route onto the map, and left open
    // together they fight over the same screen space.
    setRoutePlannerOpen(false);
    setSavedRoutesOpen(false);
    hikingTrailsWasOffRef.current = !hikingTrailsEnabled;
    if (!hikingTrailsEnabled) setHikingTrailsEnabled(true);
    // Route-editing clicks add waypoints — clear any other click-interaction
    // mode first so a click can't be interpreted two ways at once.
    handleMeasureModeChange("off");
    setRegionDrawActive(false);
    setPickPointActive(false);
    routeDispatch({ type: "START_EDITING" });
  };
  const handleFinishRoute = () => {
    if (hikingTrailsWasOffRef.current) setHikingTrailsEnabled(false);
    routeDispatch({ type: "STOP_EDITING" });
  };

  // Prefer ORS's own ascent/descent/duration (more authoritative) and fall
  // back to what we derived from the DEM-sampled profile for manual/imported
  // routes that don't already carry it.
  const ascentMeters = activeResult?.ascentMeters ?? (profileStats.hasElevationData ? profileStats.computedAscentMeters : undefined);
  const descentMeters = activeResult?.descentMeters ?? (profileStats.hasElevationData ? profileStats.computedDescentMeters : undefined);
  const isDurationEstimated = activeResult?.durationSeconds === undefined;
  const durationSeconds =
    activeResult?.durationSeconds ??
    (activeResult && ascentMeters !== undefined ? estimateHikingDurationSeconds(activeResult.distanceMeters, ascentMeters) : undefined);

  // Garmin export needs real elevation on the track points themselves, not
  // just the derived ascent/descent totals above. Manual-mode (and some
  // imported) routes carry no per-point elevation on activeResult.points —
  // Contour still has real DEM-sampled elevation for them via profileStats,
  // just resampled onto a different point count/spacing, so it can't be
  // zipped 1:1 onto activeResult.points. Swap in the profile's own points
  // (already lng/lat/elevation) as the export geometry in that case, rather
  // than exporting a flat course while the on-screen stats show real
  // elevation right next to it.
  const hasDenseElevation = activeResult !== null && activeResult.points.length > 2 && activeResult.points.every((p) => p.elevation !== undefined);
  const garminExportResult: RouteResult | null = activeResult
    ? {
        ...activeResult,
        points: hasDenseElevation
          ? activeResult.points
          : profileStats.hasElevationData
            ? profileStats.profile.map((p) => ({ lng: p.lng, lat: p.lat, elevation: p.elevation }))
            : activeResult.points,
        ascentMeters,
        descentMeters,
      }
    : null;

  const handleImportGpx = async () => {
    setGpxNotice(null);
    let file: { path: string; contents: string } | null;
    try {
      file = await openTrackFile();
    } catch (err) {
      setGpxNotice(`Could not open file: ${err instanceof Error ? err.message : String(err)}`);
      return;
    }
    if (file === null) return; // user cancelled

    try {
      const ext = file.path.split(".").pop()?.toLowerCase();
      const parsed =
        ext === "geojson" || ext === "json" ? parseGeoJson(file.contents) : ext === "kml" ? parseKml(file.contents) : parseGpx(file.contents);
      routeDispatch({ type: "CLEAR" });
      routeDispatch({ type: "STOP_EDITING" });
      setRouteResult(null);
      setRouteError(null);
      setImportedRouteName(parsed.name ?? "Imported route");
      setImportedRoute({
        points: parsed.points,
        distanceMeters: pathLength(parsed.points),
      });
      const bounds = boundsOf(parsed.points);
      if (bounds) mapHandle.current?.flyToResult(parsed.points[0], bounds);
    } catch (err) {
      setGpxNotice(`Could not read file: ${err instanceof Error ? err.message : String(err)}`);
    }
  };

  const handleReturnToRoute = () => {
    if (!activeResult || activeResult.points.length === 0) return;
    const bounds = boundsOf(activeResult.points);
    if (bounds) mapHandle.current?.flyToResult(activeResult.points[0], bounds);
  };

  const handleExportGpx = async () => {
    if (!activeResult) return;
    setGpxNotice(null);
    const routeName = importedRoute ? importedRouteName : "Route";
    const xml = buildGpxXml({
      routeName,
      trackPoints: activeResult.points,
      waypoints: routeState.waypoints.map((point, i) => ({
        point,
        name: i === 0 ? "Start" : i === routeState.waypoints.length - 1 ? "Finish" : `Waypoint ${i + 1}`,
      })),
    });
    const filename = suggestGpxFilename(routeName, activeResult.distanceMeters);
    try {
      const saved = await saveGpxFile(xml, filename);
      if (saved) setGpxNotice(`Saved ${filename}`);
    } catch (err) {
      setGpxNotice(`Could not save file: ${err instanceof Error ? err.message : String(err)}`);
    }
  };

  const handleExportGeoJson = async () => {
    if (!activeResult) return;
    setGpxNotice(null);
    const routeName = importedRoute ? importedRouteName : "Route";
    const json = buildGeoJson({
      routeName,
      trackPoints: activeResult.points,
      waypoints: routeState.waypoints.map((point, i) => ({
        point,
        name: i === 0 ? "Start" : i === routeState.waypoints.length - 1 ? "Finish" : `Waypoint ${i + 1}`,
      })),
    });
    const filename = suggestGeoJsonFilename(routeName, activeResult.distanceMeters);
    try {
      const saved = await saveTextFile(json, filename, { name: "GeoJSON", extensions: ["geojson", "json"] });
      if (saved) setGpxNotice(`Saved ${filename}`);
    } catch (err) {
      setGpxNotice(`Could not save file: ${err instanceof Error ? err.message : String(err)}`);
    }
  };

  const handleOpenRoutePlanner = () => {
    // Same mutual exclusivity as above, other direction — pause (not clear)
    // any in-progress manual/ORS editing, same as the Finish button.
    if (routeState.isEditing) routeDispatch({ type: "STOP_EDITING" });
    setSavedRoutesOpen(false);
    setPlannerStartPoint(mapCenter ?? mapHandle.current?.getCenter() ?? null);
    setPlannerStartLabel("Map center");
    setPlannerEndPoint(null);
    setRoutePlannerOpen(true);
  };

  const handleOpenSavedRoutes = () => {
    setRoutePlannerOpen(false);
    setSavedRoutesOpen(true);
  };

  // Imported/planner-generated routes have no click-added waypoint list —
  // only routeState.waypoints (manual/ORS multi-point) does, and only while
  // that's actually what's being shown (not while browsing an imported
  // track that happens to coexist with a stale waypoint list from before).
  const handleSaveCurrentRoute = async () => {
    if (!activeResult) return;
    const defaultName = importedRoute ? importedRouteName : `Route ${new Date().toLocaleDateString()}`;
    const name = window.prompt("Save route as:", defaultName);
    if (!name || !name.trim()) return;
    await createSavedRoute({
      name: name.trim(),
      mode: routeState.mode,
      waypoints: !importedRoute && routeState.waypoints.length > 0 ? routeState.waypoints : undefined,
      result: activeResult,
    });
    setGpxNotice(`Saved "${name.trim()}"`);
  };

  const handleLoadSavedRoute = (route: SavedRoute) => {
    setSavedRoutesOpen(false);
    setRoutePlannerOpen(false);
    if (route.waypoints && route.waypoints.length > 0) {
      // Waypoint-editable — restore into the live editor, same path as
      // drawing it fresh, and drop any unrelated imported track so the two
      // don't both claim to be "the" active route.
      setImportedRoute(null);
      setRouteResult(null);
      setRouteError(null);
      routeDispatch({ type: "CLEAR" });
      routeDispatch({ type: "LOAD_WAYPOINTS", waypoints: route.waypoints, mode: route.mode });
    } else {
      // View-only (imported/planner-generated) — same path as importing a
      // GPX file or a planner result.
      routeDispatch({ type: "CLEAR" });
      routeDispatch({ type: "STOP_EDITING" });
      setRouteResult(null);
      setRouteError(null);
      setImportedRouteName(route.name);
      setImportedRoute(route.result);
    }
    const bounds = boundsOf(route.result.points);
    if (bounds) mapHandle.current?.flyToResult(route.result.points[0], bounds);
  };
  const handleUseMapCenterStart = () => {
    setPlannerStartPoint(mapCenter ?? mapHandle.current?.getCenter() ?? null);
    setPlannerStartLabel("Map center");
  };
  const handleUseGpsStart = () => {
    if (!geolocation.position) return;
    setPlannerStartPoint(geolocation.position.point);
    setPlannerStartLabel("My location");
  };
  const handlePointPicked = (point: LngLat) => {
    setPlannerEndPoint(point);
    setPickPointActive(false);
  };
  const handlePlanRoundTrip = (lengthMeters: number, mode: RoutingMode, constraints: RouteConstraints, seed: number) => {
    if (!plannerStartPoint) return Promise.reject(new Error("No start point"));
    return mapHandle.current!.planRoundTrip(plannerStartPoint, { lengthMeters, seed }, mode, constraints);
  };
  const handlePlanRoute = (waypoints: LngLat[], mode: RoutingMode, constraints: RouteConstraints) => {
    return mapHandle.current!.planRoute(waypoints, mode, constraints);
  };
  const handleRouteGenerated = (result: RouteResult, label: string) => {
    routeDispatch({ type: "CLEAR" });
    routeDispatch({ type: "STOP_EDITING" });
    setRouteResult(null);
    setRouteError(null);
    setImportedRouteName(label);
    setImportedRoute(result);
    setRoutePlannerOpen(false);
    setPickPointActive(false);
    const bounds = boundsOf(result.points);
    if (bounds) mapHandle.current?.flyToResult(result.points[0], bounds);
  };

  const handleMeasureUpdate = (points: LngLat[], totalMeters: number, areaSqMeters: number | null) => {
    setMeasurePointCount(points.length);
    setMeasureTotalMeters(totalMeters);
    setMeasureAreaSqMeters(areaSqMeters);
  };
  // Only one map-click interaction mode makes sense at a time (drawing an
  // offline region, measuring, and picking a route-planner end point all
  // reinterpret plain map clicks) — activating one clears the others so a
  // stray click can't be interpreted two different ways at once.
  const handleMeasureModeChange = (mode: MeasureMode) => {
    setMeasureMode(mode);
    if (mode === "off") {
      setMeasurePointCount(0);
      setMeasureTotalMeters(0);
      setMeasureAreaSqMeters(null);
    } else {
      setRegionDrawActive(false);
      setPickPointActive(false);
    }
  };
  const handleToggleRegionDraw = () => {
    setRegionDrawActive((a) => {
      const next = !a;
      if (next) {
        handleMeasureModeChange("off");
        setPickPointActive(false);
      }
      return next;
    });
  };
  const handleTogglePickPoint = () => {
    setPickPointActive((a) => {
      const next = !a;
      if (next) {
        handleMeasureModeChange("off");
        setRegionDrawActive(false);
      }
      return next;
    });
  };

  const handleClearRoute = () => {
    const hasUnsavedWork = routeState.waypoints.length > 0 || importedRoute !== null;
    // Waypoint edits go through routeReducer's undo history and can be
    // brought back with Undo after clearing; an imported/generated route
    // (importedRoute) has no such history, so clearing it is final —
    // the message below only promises what's actually true for each case.
    if (hasUnsavedWork) {
      const message = importedRoute
        ? "Clear the current route? This route was imported/generated and can't be brought back with Undo."
        : "Clear the current route? You can bring it back with Undo.";
      if (!window.confirm(message)) return;
    }
    routeDispatch({ type: "CLEAR" });
    setRouteResult(null);
    setRouteError(null);
    setImportedRoute(null);
  };

  return (
    <main className="app-root">
      <GlassDistortionFilter />
      <MapCanvas
        ref={mapHandle}
        mode={mode}
        terrainEnabled={terrainEnabled}
        terrainExaggeration={exaggeration}
        performanceMode={performanceMode}
        renderSettings={renderSettings}
        contoursEnabled={contoursEnabled}
        hikingTrailsEnabled={hikingTrailsEnabled}
        longDistanceTrailsEnabled={longDistanceTrailsEnabled}
        trailNamesEnabled={trailNamesEnabled}
        skiRunsEnabled={skiRunsEnabled}
        skiDifficultyColoursEnabled={skiDifficultyColoursEnabled}
        skiLiftsEnabled={skiLiftsEnabled}
        skiRunNamesEnabled={skiRunNamesEnabled}
        skiLiftNamesEnabled={skiLiftNamesEnabled}
        routeState={routeState}
        routeDispatch={routeDispatch}
        importedRoute={importedRoute}
        navigationProgress={navigationProgress}
        onElevationHover={handleElevationHover}
        onSkiRunClick={handleSkiRunClick}
        onSkiLiftClick={handleSkiLiftClick}
        onRouteComputed={handleRouteComputed}
        regionDrawEnabled={regionDrawActive}
        onRegionDrawn={handleRegionDrawn}
        weatherMapLayer={weatherMapLayer}
        onMoveEnd={handleMoveEnd}
        onWeatherTileStatusChange={handleWeatherTileStatusChange}
        avalancheEnabled={avalancheEnabled}
        onAvalancheSelect={handleAvalancheSelect}
        onAvalancheStatusChange={handleAvalancheStatusChange}
        pickPointEnabled={pickPointActive}
        onPointPicked={handlePointPicked}
        measureMode={measureMode}
        onMeasureUpdate={handleMeasureUpdate}
        gridEnabled={gridEnabled}
      />
      <div className="glow-layer" aria-hidden="true">
        <div className="glow-blob glow-blob--1" />
        <div className="glow-blob glow-blob--2" />
        <div className="glow-blob glow-blob--3" />
        <div className="glow-blob glow-blob--4" />
      </div>
      <SearchBar provider={geocodingProvider} onSelect={handleSelectResult} />
      {selectedPlace && (
        <PlaceInfoPanel place={selectedPlace} elevation={placeElevation} onClose={() => setSelectedPlace(null)} />
      )}
      {skiTarget && <SkiInfoPanel target={skiTarget} onClose={() => setSkiTarget(null)} />}
      {avalancheTarget && <AvalancheInfoPanel feature={avalancheTarget} onClose={() => setAvalancheTarget(null)} />}
      {isMobile ? (
        <>
          <div className="mobile-settings-slot">
            <SettingsMenu
              locationStatus={geolocation.status}
              onStopSharingLocation={geolocation.disable}
              performanceMode={performanceMode}
              onPerformanceModeChange={setPerformanceMode}
              renderSettings={renderSettings}
              onRenderSettingsChange={updateRenderSettings}
              onOpenOfflineManager={() => setOfflineManagerOpen(true)}
            />
          </div>
          <div className="mobile-location-slot">
            <LocationControl
              status={geolocation.status}
              errorMessage={geolocation.errorMessage}
              onEnable={geolocation.enable}
              onRecenter={handleRecenterOnLocation}
            />
          </div>
          <div className="mobile-region-draw-slot">
            <RegionDrawTool active={regionDrawActive} onToggle={handleToggleRegionDraw} />
            {drawnBbox && <OfflineDownloadPanel bbox={drawnBbox} hasEsri={hasEsri} onClose={() => setDrawnBbox(null)} />}
          </div>
          <LayersSheet
            mode={mode}
            onChange={setMode}
            hasEsri={hasEsri}
            terrainEnabled={terrainEnabled}
            onTerrainEnabledChange={setTerrainEnabled}
            exaggeration={exaggeration}
            onExaggerationChange={setExaggeration}
            contoursEnabled={contoursEnabled}
            onContoursEnabledChange={setContoursEnabled}
            hikingTrailsEnabled={hikingTrailsEnabled}
            onHikingTrailsEnabledChange={setHikingTrailsEnabled}
            longDistanceTrailsEnabled={longDistanceTrailsEnabled}
            onLongDistanceTrailsEnabledChange={setLongDistanceTrailsEnabled}
            trailNamesEnabled={trailNamesEnabled}
            onTrailNamesEnabledChange={setTrailNamesEnabled}
            runsEnabled={skiRunsEnabled}
            onRunsEnabledChange={setSkiRunsEnabled}
            difficultyColoursEnabled={skiDifficultyColoursEnabled}
            onDifficultyColoursEnabledChange={setSkiDifficultyColoursEnabled}
            liftsEnabled={skiLiftsEnabled}
            onLiftsEnabledChange={setSkiLiftsEnabled}
            runNamesEnabled={skiRunNamesEnabled}
            onRunNamesEnabledChange={setSkiRunNamesEnabled}
            liftNamesEnabled={skiLiftNamesEnabled}
            onLiftNamesEnabledChange={setSkiLiftNamesEnabled}
          />
          {!navigationActive && (
            <RouteControls
              isMobile
              isEditing={routeState.isEditing}
              hasWaypoints={routeState.waypoints.length > 0}
              hasImportedRoute={importedRoute !== null}
              mode={routeState.mode}
              hasOrs={hasOrs}
              canUndo={routeState.past.length > 0}
              canRedo={routeState.future.length > 0}
              onStart={handleStartRoute}
              onFinish={handleFinishRoute}
              onClear={handleClearRoute}
              onImportGpx={handleImportGpx}
              onExportGpx={handleExportGpx}
              onExportGeoJson={handleExportGeoJson}
              onExportGarmin={() => setGarminExportOpen(true)}
              onUndo={() => routeDispatch({ type: "UNDO" })}
              onRedo={() => routeDispatch({ type: "REDO" })}
              onModeChange={(newMode) => routeDispatch({ type: "SET_MODE", mode: newMode })}
              canNavigate={activeResult !== null}
              onStartNavigation={handleStartNavigation}
            />
          )}
        </>
      ) : (
        <div className="right-controls">
          <SettingsMenu
            onOpenOfflineManager={() => setOfflineManagerOpen(true)}
            locationStatus={geolocation.status}
            onStopSharingLocation={geolocation.disable}
            renderSettings={renderSettings}
            onRenderSettingsChange={updateRenderSettings}
          />
          <div className="right-controls__row">
            <LocationControl
              status={geolocation.status}
              errorMessage={geolocation.errorMessage}
              onEnable={geolocation.enable}
              onRecenter={handleRecenterOnLocation}
            />
            <LayersMenu
              mode={mode}
              onChange={setMode}
              hasEsri={hasEsri}
              terrainEnabled={terrainEnabled}
              onTerrainEnabledChange={setTerrainEnabled}
              exaggeration={exaggeration}
              onExaggerationChange={setExaggeration}
              contoursEnabled={contoursEnabled}
              onContoursEnabledChange={setContoursEnabled}
              hikingTrailsEnabled={hikingTrailsEnabled}
              onHikingTrailsEnabledChange={setHikingTrailsEnabled}
              longDistanceTrailsEnabled={longDistanceTrailsEnabled}
              onLongDistanceTrailsEnabledChange={setLongDistanceTrailsEnabled}
              trailNamesEnabled={trailNamesEnabled}
              onTrailNamesEnabledChange={setTrailNamesEnabled}
              runsEnabled={skiRunsEnabled}
              onRunsEnabledChange={setSkiRunsEnabled}
              difficultyColoursEnabled={skiDifficultyColoursEnabled}
              onDifficultyColoursEnabledChange={setSkiDifficultyColoursEnabled}
              liftsEnabled={skiLiftsEnabled}
              onLiftsEnabledChange={setSkiLiftsEnabled}
              runNamesEnabled={skiRunNamesEnabled}
              onRunNamesEnabledChange={setSkiRunNamesEnabled}
              liftNamesEnabled={skiLiftNamesEnabled}
              onLiftNamesEnabledChange={setSkiLiftNamesEnabled}
              hasOwmKey={hasOwm}
              activeMapLayer={weatherMapLayer}
              onActiveMapLayerChange={setWeatherMapLayer}
              tileStatus={weatherTileStatus}
              lastRefreshedAt={weatherLastRefreshedAt}
              forecastEnabled={weatherForecastEnabled}
              onForecastEnabledChange={setWeatherForecastEnabled}
              forecast={weatherForecast}
              hourIndex={weatherHourIndex}
              onHourIndexChange={setWeatherHourIndex}
              onRefreshForecast={weatherForecast.refresh}
              avalancheEnabled={avalancheEnabled}
              onAvalancheEnabledChange={setAvalancheEnabled}
              avalancheStatus={avalancheStatus}
              avalancheError={avalancheError}
              avalancheRegionCount={avalancheRegionCount}
              avalancheFetchedAt={avalancheFetchedAt}
              onRefreshAvalanche={() => mapHandle.current?.refreshAvalanche()}
            />
          </div>
          <MeasureTool
            mode={measureMode}
            onModeChange={handleMeasureModeChange}
            pointCount={measurePointCount}
            totalMeters={measureTotalMeters}
            areaSqMeters={measureAreaSqMeters}
            onClear={() => mapHandle.current?.clearMeasurement()}
            gridEnabled={gridEnabled}
            onGridEnabledChange={setGridEnabled}
          />
          <RouteControls
            isEditing={routeState.isEditing}
            hasWaypoints={routeState.waypoints.length > 0}
            hasImportedRoute={importedRoute !== null}
            mode={routeState.mode}
            hasOrs={hasOrs}
            canUndo={routeState.past.length > 0}
            canRedo={routeState.future.length > 0}
            hasLocationFix={geolocation.position !== null}
            onStartFromLocation={handleStartRouteHere}
            onPlanRoute={handleOpenRoutePlanner}
            onOpenSavedRoutes={handleOpenSavedRoutes}
            onStart={handleStartRoute}
            onFinish={handleFinishRoute}
            onClear={handleClearRoute}
            onImportGpx={handleImportGpx}
            onExportGpx={handleExportGpx}
            onExportGeoJson={handleExportGeoJson}
            onExportGarmin={() => setGarminExportOpen(true)}
            onUndo={() => routeDispatch({ type: "UNDO" })}
            onRedo={() => routeDispatch({ type: "REDO" })}
            onModeChange={(newMode) => routeDispatch({ type: "SET_MODE", mode: newMode })}
          />
          <RegionDrawTool active={regionDrawActive} onToggle={handleToggleRegionDraw} />
          {drawnBbox && (
            <OfflineDownloadPanel bbox={drawnBbox} hasEsri={hasEsri} onClose={() => setDrawnBbox(null)} />
          )}
          {routePlannerOpen && (
            <RoutePlannerPanel
              hasRoundTrip={hasOrs}
              startPoint={plannerStartPoint}
              startLabel={plannerStartLabel}
              hasGpsFix={geolocation.position !== null}
              onUseGpsStart={handleUseGpsStart}
              onUseMapCenterStart={handleUseMapCenterStart}
              pickedEndPoint={plannerEndPoint}
              pickPointActive={pickPointActive}
              onTogglePickPoint={handleTogglePickPoint}
              onClearEndPoint={() => setPlannerEndPoint(null)}
              planRoundTrip={handlePlanRoundTrip}
              planRoute={handlePlanRoute}
              onGenerated={handleRouteGenerated}
              onClose={() => {
                setRoutePlannerOpen(false);
                setPickPointActive(false);
              }}
            />
          )}
          {savedRoutesOpen && <SavedRoutesPanel onClose={() => setSavedRoutesOpen(false)} onLoad={handleLoadSavedRoute} />}
          {garminExportOpen && garminExportResult && (
            <GarminExportPanel
              result={garminExportResult}
              waypoints={routeState.waypoints}
              defaultName={importedRoute ? importedRouteName : "Route"}
              onClose={() => setGarminExportOpen(false)}
            />
          )}
        </div>
      )}
      {offlineManagerOpen && (
        <OfflineRegionsManager hasEsri={hasEsri} onClose={() => setOfflineManagerOpen(false)} onFlyTo={handleFlyToOfflineRegion} />
      )}
      {terrainEnabled && (
        <div className="elevation-hud">{hoverElevation !== null ? `Elevation: ${Math.round(hoverElevation)} m` : "Elevation: —"}</div>
      )}
      {!isMobile && hoverPoint && (
        <div className="coordinate-hud">
          <span>{formatCoordinate(hoverPoint, coordFormat)}</span>
          <button className="coordinate-hud__copy" onClick={handleCopyCoordinate} title="Copy coordinates">
            {coordCopied ? "Copied" : "Copy"}
          </button>
        </div>
      )}
      {!isMobile && !isOnline && <div className="offline-badge">Offline</div>}
      <div className="version-badge">v2.0</div>
      {gpxNotice && <div className="gpx-notice">{gpxNotice}</div>}
      {navigationActive ? (
        <NavigationPanel
          progress={navigationProgress}
          etaSeconds={navigationEtaSeconds}
          speedMetersPerSecond={navigationDisplayFix?.speed ?? null}
          onStop={handleStopNavigation}
        />
      ) : (
        <RouteStatsPanel
          result={mobileRouteBarShowing ? null : activeResult}
          error={importedRoute ? null : routeError}
          waypointCount={routeState.waypoints.length}
          waypoints={routeState.waypoints}
          profile={profileStats.profile}
          ascentMeters={ascentMeters}
          descentMeters={descentMeters}
          maxSlopePercent={profileStats.hasElevationData ? profileStats.maxSlopePercent : undefined}
          avgSlopePercent={profileStats.hasElevationData ? profileStats.avgSlopePercent : undefined}
          minElevationMeters={profileStats.hasElevationData ? profileStats.minElevationMeters : undefined}
          maxElevationMeters={profileStats.hasElevationData ? profileStats.maxElevationMeters : undefined}
          steepSections={profileStats.hasElevationData ? profileStats.steepSections : []}
          durationSeconds={durationSeconds}
          isDurationEstimated={isDurationEstimated}
          onProfileHover={handleProfileHover}
          onReturnToRoute={handleReturnToRoute}
          isEditing={routeState.isEditing}
          onReorderWaypoint={(from, to) => routeDispatch({ type: "REORDER_WAYPOINT", from, to })}
          onStartNavigation={handleStartNavigation}
          onSaveRoute={handleSaveCurrentRoute}
        />
      )}
    </main>
  );
}

export default App;
