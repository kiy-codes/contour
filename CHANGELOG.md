# Changelog

All notable changes to Contour are documented here. Versions follow `major.minor.patch`.

## [2.1.0] — 2026-08-24

### Added
- **Low-res satellite backdrop** — a second, coarser raster layer under the main satellite layer, from the same tile source but capped at zoom 5. MapLibre overzooms a source's own max-zoom tiles to cover any deeper view, so this backdrop always has *something* real to show, at whatever zoom is actually requested, instead of the transparent gap a fresh jump or fast pan previously left. Paired with a one-time background pre-seed of the whole world at that same shallow zoom range (1,365 tiles, ~11MB) — reuses the existing offline-region download engine wholesale, so it's a real, visible, deletable entry in the Downloaded Regions manager rather than a parallel system. Verified end-to-end with an artificially delayed network: a blurry-but-real backdrop shows immediately, with sharp imagery filling in on top as it arrives.
- Max camera pitch raised from MapLibre's default 60° to 80°, in 3D terrain mode, flat 2D mode, and the globe world view — verified live with no rendering artifacts in any of the three.

### Changed
- `maxTileCacheSize` raised 2000 → 4000, keeping more recently-viewed tiles decoded and ready instead of re-fetching.
- Measure distance/area and Grid triggers now match the Layers/GPS glass-pill button style, instead of the flatter in-panel chip style meant for compact selection lists.
- Default 3D Terrain exaggeration changed from 1.5x to 1x.
- Layers menu panel now scrolls (six sections can run taller than a modest window), with `overscroll-behavior: contain` so scrolling it never chains through to the map underneath.
- Liquid Glass theme: every text node now guarantees a text-shadow via one root-level declaration instead of N per-panel copies; every icon gets a drop-shadow (text-shadow doesn't affect SVGs); checkbox interiors reskinned to match the glass aesthetic instead of the bare OS checkbox. Scoped to the Liquid Glass theme only — Dark/Light untouched.

### Fixed
- Avalanche panel forced itself wider than the Layers menu had room for, causing horizontal scrolling — same root cause (and fix) as the weather panel's earlier min-width bug.
- Exaggeration slider row and weather-map section could overflow past the Layers panel's right edge — flex items weren't allowed to shrink below their intrinsic content width, and the weather panel had its own min-width wider than the space actually available.
- The Layers button's "open" blue background lost a CSS specificity fight to its own `:hover` rule (two selectors beat one), so hovering right after opening it — the common case — silently reverted it to the plain hover fill instead of staying blue. Same fix applied everywhere else the pattern was reused (map mode switcher, route mode buttons, weather/route-planner/Garmin activity pills).

### Verified
- Real Windows desktop window, both a standard desktop viewport and a narrow/tall (portrait-monitor-style) one.

## [2.0.0] — 2026-08-24

This is Contour's V2 release — the full round of work described below, on top of the V1 core (globe navigation, terrain, search, hiking/ski layers, route planning, GPX export, offline maps, GPS location). See [`ROADMAP.md`](./ROADMAP.md) for the V1/V2 release checklist.

### Added
- **Garmin export foundation** — "Export for Garmin" builds a validated, Garmin-compatible GPX course (name, description, activity type, start/finish/waypoint course points as GPX waypoints with standard symbols) and shows step-by-step instructions for importing it into Garmin Connect, Garmin Express, or a device's storage over USB. Route validation checks for invalid coordinates, missing/partial elevation, zero-length routes, and unusually large courses before allowing export.
- A `GarminProvider` interface (`src/garmin/GarminProvider.ts`) for a future OAuth-based Garmin Connect Developer Program integration (connect, connection status, upload/list/delete course, disconnect) — isolated from core route-planning code so it can be implemented later without touching the route editor.

### Changed
- Tile fetches through the app's cache protocol (base map, DEM, satellite, topo, ski, Waymarked Trails) are now bounded to 6 concurrent network requests, queued rather than unbounded — protects free tile providers' rate limits during fast panning/zooming across multiple layers at once, and requests already queued are dropped without ever firing if MapLibre cancels them first (panned away before their turn). Verified with an 8-location rapid pan/zoom stress test — map rendered correctly afterward, no errors.
- Audited the rest of the requested tile-loading behavior against what MapLibre GL already provides: visible-tile prioritisation, parent-tile-while-loading, and per-request cancellation are all built-in and were already working (confirmed via live testing, incl. a real Esri satellite mode switch over an uncached area — no white flash, the vector base map stays visible under the loading imagery by design). Directional pan prefetching was investigated and deliberately not added — MapLibre has no safe, documented API for it, and a hand-rolled version risked jank for unproven benefit; left for a future phase if it turns out to matter in practice (see ROADMAP.md).
- Activating Measure distance/area, Download region, or the route planner's end-point picker now deactivates the other two, and starting a route clears all three — previously more than one could be "listening" to map clicks at once, so a click could be interpreted more than one way.
- "Clear" on a route with waypoints or an imported/generated track now confirms first, with accurate wording: waypoint edits can be brought back with Undo after clearing, an imported/generated route can't (it isn't tracked in undo history) — the message reflects which case applies. Clearing an already-empty route never prompts.
- Every network provider call (weather, avalanche, routing) now times out (15-20s) instead of being able to hang in "loading" forever, and shows a specific message for a timeout, being offline, or a 429 rate limit instead of a raw error string.

### Fixed
- Garmin export used flat (no-elevation) track geometry for manual-mode routes even when Contour's own route analysis panel was showing real elevation data for the same route, computed separately via DEM sampling. Found via cross-feature integration testing.
- Region metadata reads (`listRegions`/`getRegion`/create/update in the offline-maps cache) could throw an unhandled rejection on IndexedDB failure instead of degrading gracefully, unlike the tile-read functions next to them, which already did.

### Verified
- Real Windows desktop window: clean debug build, launches without errors, survives a full close/reopen cycle.
- Release production build: `cargo build --release` compiles cleanly and produces a working `contour.exe`; the MSI installer bundles successfully every time (`Contour_1.3.0_x64_en-US.msi`). The NSIS `.exe`-installer bundle step consistently fails with a Windows "cannot move file to a different disk drive" error (os error 17) — root-caused, not guessed: `%LOCALAPPDATA%\tauri` (Tauri's NSIS download cache) is a reparse point that Windows silently redirects to an isolated app-container storage path (`C:\WpSystem\...\Packages\Claude_...\LocalCache\...`) because the build was run from inside Claude Code's own sandboxed process, which Windows treats as a different device for file-move purposes than the real project directory. Confirmed by inspecting the reparse target directly; an `LOCALAPPDATA` environment override did not help, since Windows resolves known-folder paths via an OS API tied to the process's app-container token, not the env var. Not a defect in Contour or its Tauri config — running `npm run tauri build` from a plain (non-sandboxed) terminal should produce the NSIS installer with no changes needed.
- No automated test suite exists in this repo (confirmed: no test files, no test script in `package.json`) — `tsc` type-checking via every `npm run build` plus extensive live manual/browser testing was the verification method throughout this round.

### Known limitations
- **No direct upload to a Garmin account.** Confirmed directly against Garmin's own developer documentation (2026-08-24): the Garmin Connect Developer Program's Courses API is business/enterprise-use only, requires a reviewed application, and has no public sandbox — approved developers get throttled *production* access only. There is no credential tier this build can obtain or exercise. Only local GPX export is implemented; the `GarminProvider` interface exists but its only implementation (`UnavailableGarminProvider`) honestly reports "not available" rather than faking a connection.
- No Garmin proprietary GPX extension schema is used (only standard GPX 1.1 track/waypoint elements), since that schema wasn't independently verified.

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
