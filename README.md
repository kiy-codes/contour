# Contour

**v2.1.0** — A premium 3D world mapping desktop app: Google Earth-style globe navigation, AllTrails-style hiking/route planning, live weather and avalanche danger overlays, ski resort mapping, offline maps, GPS location, smart route planning, Garmin course export, and GPX/GeoJSON export, built on free/open geographic data.

Windows desktop app built with [Tauri v2](https://tauri.app) + React + TypeScript + [MapLibre GL JS](https://maplibre.org).

See [`architecture.md`](./architecture.md) for the provider architecture, data sources, and licensing/cost notes; [`CHANGELOG.md`](./CHANGELOG.md) for release history; and [`ROADMAP.md`](./ROADMAP.md) for what's verified-working vs. still limited, plus the release checklist.

## Features

- **3D globe navigation** — smooth pan/zoom/rotate/tilt globe, powered by MapLibre GL JS.
- **Four map modes** — Standard, Satellite, Terrain (2D hillshaded/hypsometric), and 3D Satellite (imagery + terrain).
- **3D terrain** — adjustable exaggeration, hillshading, elevation contours.
- **Search** — place/address search with fly-to and a place info panel.
- **Hiking & trail layers** — walking/hiking trails, optional long-distance trail overlay, trail name labels.
- **Ski layers** — resorts, runs, lifts, difficulty colouring, run/lift name labels.
- **Route planning** — waypoint-based editor with manual (straight-line) mode always available, plus hiking/walking/cycling/driving modes (needs a free API key).
- **Smart route planner** — generate a loop with a distance target, an out-and-back, or a point-to-point route, with activity type and terrain constraints (avoid steps/fords); generate and compare loop alternatives; unsupported preferences (viewpoints, peaks, surface type) are shown disabled with an explanation rather than faked. Generated routes are fully editable and export the same as any other route.
- **Route stats & analysis** — elevation profile chart, ascent/descent, elevation range, max/average slope, automatically flagged steep sections, an explained difficulty estimate, time estimate, trail/road breakdown where available, waypoint summary, metric/imperial toggle.
- **Weather map** — live temperature/precipitation/wind/cloud/pressure map overlay (needs a free API key) plus a keyless hourly forecast panel (temperature, rain, snow, wind, cloud cover, freezing level) with a real time slider, for the current map view.
- **Avalanche danger ratings** — current avalanche danger overlay for US/Alaska forecast centers, with official ratings, a legend, and a persistent safety disclaimer. Not available outside the US.
- **GPS location** — show your current position with a live accuracy circle, recenter on it, or start a route from it. Location is watched locally only and never transmitted or stored remotely.
- **Offline maps** — draw a region on the map, pick zoom range and layers (base map, satellite, terrain, topo, hiking/ski), and download it for offline use. Includes progress tracking (tiles, size, speed), pause/resume/cancel, automatic online/offline fallback, and a Downloaded Regions manager (rename/update/delete).
- **Planning tools** — measure distance/area, cursor coordinate readout with copy-to-clipboard and decimal/DMS format toggle, draggable waypoint reordering with undo/redo, and a best-effort lat/lng grid overlay.
- **Import/export** — GPX, GeoJSON, and KML import; GPX 1.1 and GeoJSON export, all via native file dialogs.
- **Garmin export** — "Export for Garmin" builds a validated, Garmin-compatible GPX course (name, description, activity type, start/finish/waypoint course points) and walks you through importing it into Garmin Connect, Garmin Express, or your device's storage. **This is local file export only** — there is no direct upload to a Garmin account yet; see [Garmin integration status](#garmin-integration-status) below for why and what's next.
- **Local caching** — IndexedDB-backed tile/data cache with size-capped LRU eviction and a manual clear option; downloaded offline regions are pinned and survive normal eviction.
- **Liquid Glass UI** — three selectable themes (Dark / Light / Liquid Glass), consistent rounded glass-styled controls throughout.

## Running it

**Prerequisites:**
- [Node.js](https://nodejs.org) (npm)
- [Rust](https://www.rust-lang.org/tools/install) (via rustup)
- Tauri's platform dependencies — see the [Tauri prerequisites guide](https://tauri.app/start/prerequisites/) (on Windows: MSVC Build Tools + WebView2, usually already present on Windows 11)

**Setup:**

```bash
npm install
cp .env.example .env
```

Then open `.env` and fill in your own free API keys, following the steps below (no credit card required for either). `.env` is git-ignored — your keys never get committed.

Everything else (globe navigation, terrain, hiking/ski trail layers, search, GPS location, offline maps, GPX/GeoJSON/KML import/export, the Open-Meteo forecast panel, avalanche danger ratings, and all the planning tools) works with no keys at all.

### Getting `VITE_ORS_API_KEY` (OpenRouteService)

Powers hiking/walking/cycling/driving route calculation. Without it, only manual (straight-line) routing works. Free tier: ~2,000 requests/day, 40 requests/60s.

1. Go to [openrouteservice.org/dev/#/signup](https://openrouteservice.org/dev/#/signup) and create a free account (email + password, no card).
2. Verify your email if prompted, then log in.
3. Go to your dashboard at [account.heigit.org](https://account.heigit.org).
4. Under **Request a token**, choose the **Standard** (free) plan and give the token a name (e.g. "Contour").
5. Copy the generated API key.
6. Paste it into `.env`:
   ```
   VITE_ORS_API_KEY=your_key_here
   ```

### Getting `VITE_ESRI_API_KEY` (Esri ArcGIS Location Platform)

Powers the Satellite and 3D Satellite map modes (Esri World Imagery). Without it, those modes stay disabled. Free tier: 2,000,000 basemap tile requests/month.

1. Go to [location.arcgis.com/sign-up](https://location.arcgis.com/sign-up/) and create a free ArcGIS Location Platform account.
2. Verify your email and log in to the [ArcGIS Location Platform dashboard](https://location.arcgis.com/).
3. Open the **API Keys** section and create a new API key (default settings are fine — it just needs access to basemap/tile services).
4. Copy the generated key (it will look like a long string starting with `AAPT...`).
5. Paste it into `.env`:
   ```
   VITE_ESRI_API_KEY=your_key_here
   ```
6. If signup ever prompts you for payment details before you've gone anywhere near the free tier limits, stop and don't enter them — the free tier itself shouldn't require a card.

### Getting `VITE_OWM_API_KEY` (OpenWeatherMap)

Powers the live weather map overlay (Temperature/Precipitation/Wind/Cloud cover/Pressure layers). Without it, that overlay stays unavailable — the separate Open-Meteo forecast panel works with no key at all. Free tier: 60 calls/minute, 1,000,000 calls/month.

1. Go to [home.openweathermap.org/users/sign_up](https://home.openweathermap.org/users/sign_up) and create a free account (email + password, no card).
2. Verify your email, then log in.
3. Go to the **API keys** tab in your account.
4. Copy the default key (or create a new one and name it, e.g. "Contour").
5. Paste it into `.env`:
   ```
   VITE_OWM_API_KEY=your_key_here
   ```
6. New keys can take up to ~2 hours to activate — if the weather layer shows an error immediately after signing up, that's normal; try again later.

**Run in dev mode** (hot reload):

```bash
npm run tauri dev
```

**Build a real installer** (.msi/.exe under `src-tauri/target/release/bundle/`):

```bash
npm run tauri build
```

## Garmin integration status

Contour can export a validated, Garmin-compatible GPX course file today — that part is real and works with no setup. **Direct upload to a Garmin Connect account does not work and isn't claimed to.**

Why: Garmin's Courses API (part of the [Garmin Connect Developer Program](https://developer.garmin.com/gc-developer-program/)) is business/enterprise-use only, requires a reviewed application, and — confirmed directly against Garmin's own developer site — has **no public sandbox or trial tier**; approved developers get "development against the production environment with throttled access," full stop. There's no tier of that an individual open-source app can exercise without going through Garmin's business application process.

So the app ships:
- A working **local export path**: name/description/activity-type picker, route validation (invalid coordinates, missing elevation, oversized routes), a standards-compliant GPX 1.1 course file, and on-screen instructions for getting it onto a device via Garmin Connect's own Import feature, Garmin Express, or USB drag-and-drop — none of which need any API access at all.
- A clean `GarminProvider` interface (`src/garmin/GarminProvider.ts`) for connect/upload/list/delete, so a real OAuth 2.0 integration can be dropped in later without touching the UI — but the only implementation shipped (`UnavailableGarminProvider`) honestly reports "not available" for every method rather than faking success.

No Garmin credentials or configuration are needed or possible in this build — there's nothing to put in `.env`.

## Known issues

- Avalanche danger ratings only cover US/Alaska forecast centers — no coverage elsewhere.
- The weather map overlay shows current conditions only (OpenWeatherMap's free tier has no forecast/historical time parameter); use the Open-Meteo forecast panel for an actual multi-hour forecast.
- KMZ (zipped KML) import isn't supported — only plain `.kml`.
- The smart route planner can't target viewpoints, peaks, surface type, or an exact elevation-gain figure — those preferences are shown disabled/best-effort rather than faked, since no wired data source actually supports them.
- The production JS bundle is a single ~1.3 MB file (not yet code-split) — first load is a bit heavier than it needs to be.
- Direct Garmin account upload doesn't exist — see [Garmin integration status](#garmin-integration-status) above.

See [`ROADMAP.md`](./ROADMAP.md) for the fuller list plus what's likely to come next.

## Recommended IDE Setup

- [VS Code](https://code.visualstudio.com/) + [Tauri](https://marketplace.visualstudio.com/items?itemName=tauri-apps.tauri-vscode) + [rust-analyzer](https://marketplace.visualstudio.com/items?itemName=rust-lang.rust-analyzer)
