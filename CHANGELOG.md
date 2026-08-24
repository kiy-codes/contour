# Changelog

All notable changes to Contour are documented here. Versions follow `major.minor.patch`.

## [1.2.0] — 2026-08-24

### Added
- **Weather map** — live weather overlay on the desktop map:
  - Raster map layers (Temperature, Precipitation, Wind, Cloud cover, Pressure) via OpenWeatherMap Weather Maps 1.0, gated behind a new free `VITE_OWM_API_KEY`; shows a clear "unavailable" state with setup instructions when no key is configured, rather than silently doing nothing.
  - A keyless hourly forecast panel (temperature, precipitation, rain, snowfall, cloud cover, wind speed/direction, freezing level) for the current map center via Open-Meteo, with a real time slider across the next 48 hours and an explicit "stale data" indicator after 30 minutes without a refresh.
  - Only requests data for what's on screen — raster tiles are viewport-scoped like every other map layer, and the forecast panel only fetches for the current map center while open, with a 5-minute cache and automatic cancellation of superseded requests.
- **Avalanche danger ratings** — a map layer showing current avalanche danger for US/Alaska forecast centers (avalanche.org), with each region's own official color/rating, an off-season/no-rating state shown honestly rather than hidden or faked, a click-through panel linking to the official forecast, a legend, and a persistent safety disclaimer. No coverage outside the US — shown as an explicit, documented limitation, not a broken layer.
- **Smart route planning** — a route planner alongside manual route drawing:
  - Loop routes with a distance target (OpenRouteService's round-trip routing), out-and-back and point-to-point shapes, walking/hiking/cycling activity types, "avoid steps"/"avoid fords" constraints, an optional max-elevation-gain check, and a way to generate and compare a few loop alternatives.
  - Preferences the routing provider can't actually honor (viewpoints, peaks, surface type) are shown disabled with an explanation rather than faked as working.
  - Generated routes flow through the same GPX export and route-analysis pipeline as manually drawn or imported routes.
- **Route analysis** — extended stats for any route (planned, drawn, or imported): elevation range (min/max), automatically-identified steep sections (≥15% grade), an estimated difficulty rating with the reasoning spelled out (distance/ascent/max grade — explicitly not an official trail rating), and a waypoint summary, all in a new collapsible "Route analysis" section. Recalculates automatically after any edit.
- **Planning tools**: measure distance and measure area (click-to-add-point, live readout, clear/cancel), a cursor coordinate readout with copy-to-clipboard and a decimal/DMS format toggle in Settings, drag-free waypoint reordering (▲/▼, fully undo/redo-able), a best-effort lat/lng grid overlay, and GeoJSON/KML import alongside the existing GPX import, plus GeoJSON export alongside GPX export.

### Changed
- "Import GPX" is now "Import track" everywhere, reflecting that it accepts GPX, GeoJSON, and KML.

### Known limitations
- Weather map tiles need a free OpenWeatherMap key and only show current conditions (no historical/forecast time travel on the free tier) — the separate Open-Meteo forecast panel is what covers real multi-hour forecasting.
- Avalanche coverage is US/Alaska only; no global or European avalanche source is wired up yet (see the provider interface for adding one).
- KMZ (zipped KML) isn't supported, only plain KML — KMZ would need a new zip-handling dependency.
- The routing provider has no signal for viewpoints, peaks, or surface type, so those planner preferences are shown but disabled rather than implemented.

## [1.1.0] — 2026-08-24

### Added
- **Offline maps (Windows desktop)** — download a region for offline use:
  - Draw a rectangular region directly on the map to select an area.
  - Pick a zoom range and which layers to include: base map, satellite, terrain/contours, 2D topo, hiking/walking trails, long-distance trails, and ski (runs/lifts).
  - Live download progress: tile count, estimated storage size, download speed, pause/resume/cancel, and per-tile error handling.
  - Downloaded Regions manager — view, rename, re-download/update, and delete saved regions from Settings.
  - Downloaded tiles are pinned in the local cache so they survive normal cache eviction and "Clear cache," and are reused automatically instead of being re-downloaded.
  - Automatic offline fallback — when the network is unavailable, the map serves previously cached/downloaded tiles instead of failing; an offline indicator shows when the app has lost connectivity.
  - A hard cap on tiles per region download guards against accidentally queuing a whole-world download.
- **GPS location (Windows desktop)** — for route planning, not navigation:
  - A "my location" button shows your current position on the map with a live accuracy circle, using the system's location services (Wi-Fi/network-based positioning on most desktops).
  - Click to recenter the map on your position; a "Start from my location" action begins a new route at your current position.
  - Clear states for locating, active, and error (permission denied, unavailable, or other error), with Windows-specific guidance when the system Location privacy toggle is off.
  - Location is only watched while sharing is active — turning it off (from Settings) immediately stops the location watch. Nothing about your location is ever sent off your device or stored remotely.
- Three-way theme switch (Dark / Light / Liquid Glass) with icon buttons in Settings.
- Consolidated Layers menu (desktop) — map mode, terrain, hiking, and ski layer toggles behind a single "Layers" button with the same icon used on mobile.

### Changed
- Reworked desktop control buttons (offline download panel, region draw tool, location control, route panel) onto a single rounded, theme-aware button style — removing plain unstyled buttons that rendered as default browser "grey boxes."
- Location control is now an icon-only button (crosshair), positioned to the left of the Layers button, matching the visual style of the Settings button.
- "Stop sharing location" moved from the location control into the Settings menu, alongside the new Location sharing status.
- "Download region…" label simplified to "Download region."
- Fixed a settings-panel clipping/shadow rendering issue on desktop.

### Fixed
- Settings dropdown panel no longer gets cut off or loses its drop shadow near window edges.

## [1.0.0] — Initial release

### Added
- **3D globe navigation** — Tauri v2 + React + TypeScript + MapLibre GL JS, globe projection, pan/zoom/rotate/tilt.
- **Base map** — OpenFreeMap vector tiles (OpenStreetMap data): roads, places, water, boundaries.
- **Map modes** — Standard, Satellite (Esri World Imagery), Terrain (OpenTopoMap hillshaded/hypsometric), and 3D Satellite (satellite imagery with terrain enabled).
- **3D terrain** — AWS Terrarium DEM tiles, adjustable exaggeration, hillshading, elevation contours.
- **Search** — Photon (primary) / Nominatim (fallback) geocoding, fly-to-result, place info panel.
- **Outdoor layers** — hiking/walking trails (OSM data), optional long-distance trail overlay (Waymarked Trails), trail name labels.
- **Ski layers** — resorts, runs, and lifts from OpenSkiMap, difficulty colouring, run/lift name labels.
- **Routing** — waypoint-based route editor with manual (straight-line) mode always available, and hiking/walking/cycling/driving modes via OpenRouteService (requires a free API key).
- **Elevation & route stats** — elevation profile chart, ascent/descent, max/average slope, time estimate, trail/road breakdown where classification data is available, metric/imperial unit toggle.
- **GPX import/export** — GPX 1.1 track/waypoint export via native Save dialog; import of `<trk>`, `<rte>`, or `<wpt>`-only files via native Open dialog.
- **Liquid Glass UI** — shared glass design tokens, specular highlight, entrance animations, press feedback.
- **Local tile/data cache** — IndexedDB-backed cache with size-capped LRU eviction, covering base style/sprite/glyphs, vector tiles, DEM, satellite, topo, and ski data; cache panel with size display and manual clear.
