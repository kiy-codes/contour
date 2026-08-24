# Contour

**v1.1.0** — A premium 3D world mapping desktop app: Google Earth-style globe navigation, AllTrails-style hiking/route planning, ski resort mapping, offline maps, GPS location, and GPX export, built on free/open geographic data.

Windows desktop app built with [Tauri v2](https://tauri.app) + React + TypeScript + [MapLibre GL JS](https://maplibre.org).

See [`architecture.md`](./architecture.md) for the provider architecture, data sources, and licensing/cost notes, and [`CHANGELOG.md`](./CHANGELOG.md) for release history.

## Features

- **3D globe navigation** — smooth pan/zoom/rotate/tilt globe, powered by MapLibre GL JS.
- **Four map modes** — Standard, Satellite, Terrain (2D hillshaded/hypsometric), and 3D Satellite (imagery + terrain).
- **3D terrain** — adjustable exaggeration, hillshading, elevation contours.
- **Search** — place/address search with fly-to and a place info panel.
- **Hiking & trail layers** — walking/hiking trails, optional long-distance trail overlay, trail name labels.
- **Ski layers** — resorts, runs, lifts, difficulty colouring, run/lift name labels.
- **Route planning** — waypoint-based editor with manual (straight-line) mode always available, plus hiking/walking/cycling/driving modes (needs a free API key).
- **Route stats** — elevation profile chart, ascent/descent, max/average slope, time estimate, trail/road breakdown where available, metric/imperial toggle.
- **GPS location** — show your current position with a live accuracy circle, recenter on it, or start a route from it. Location is watched locally only and never transmitted or stored remotely.
- **Offline maps** — draw a region on the map, pick zoom range and layers (base map, satellite, terrain, topo, hiking/ski), and download it for offline use. Includes progress tracking (tiles, size, speed), pause/resume/cancel, automatic online/offline fallback, and a Downloaded Regions manager (rename/update/delete).
- **GPX import/export** — export routes as GPX 1.1; import existing GPX tracks/routes/waypoints via native file dialogs.
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

Then open `.env` and fill in your own free API keys — see the comments in `.env.example` for signup links (no credit card required for either):
- `VITE_ORS_API_KEY` (OpenRouteService) — powers hiking/walking/cycling/driving route calculation. Without it, only manual (straight-line) routing works.
- `VITE_ESRI_API_KEY` (Esri ArcGIS Location Platform) — powers Satellite map mode. Without it, that mode stays disabled.

Everything else (globe navigation, terrain, hiking/ski trail layers, search, GPS location, offline maps, GPX import/export) works with no keys at all.

**Run in dev mode** (hot reload):

```bash
npm run tauri dev
```

**Build a real installer** (.msi/.exe under `src-tauri/target/release/bundle/`):

```bash
npm run tauri build
```

## Recommended IDE Setup

- [VS Code](https://code.visualstudio.com/) + [Tauri](https://marketplace.visualstudio.com/items?itemName=tauri-apps.tauri-vscode) + [rust-analyzer](https://marketplace.visualstudio.com/items?itemName=rust-lang.rust-analyzer)
