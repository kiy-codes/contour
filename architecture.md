# Architecture & Data Providers

## Stack

| Layer | Choice |
|---|---|
| Desktop shell | Tauri v2 (Rust backend, WebView2 on Windows) |
| Frontend | React + TypeScript + Vite |
| 3D map/globe | MapLibre GL JS (globe projection, `raster-dem` terrain) |
| Local cache | SQLite via Tauri's Rust backend (tile/DEM/geocode cache) |
| GPX | Generated client-side, no server dependency |
| External HTTP (search) | `@tauri-apps/plugin-http` — plain browser `fetch()` can't set a custom User-Agent, which Nominatim's usage policy requires; the Tauri HTTP plugin routes requests through the Rust backend instead, scoped via capability permissions to the specific hosts in `src-tauri/capabilities/default.json` |

## Provider architecture

Every external data dependency sits behind a TypeScript interface in [`src/providers/`](./src/providers/), so a provider can be swapped by adding a new class and changing one config value — never by rewriting app/UI code.

| Interface | File | Concern |
|---|---|---|
| `MapProvider` | `MapProvider.ts` | Base vector/raster style |
| `TerrainProvider` | `TerrainProvider.ts` | DEM tiles for 3D terrain/contours |
| `SatelliteProvider` | `SatelliteProvider.ts` | Raster imagery for Satellite/3D-Satellite modes |
| `ElevationProvider` | `ElevationProvider.ts` | Point/path elevation queries |
| `GeocodingProvider` | `GeocodingProvider.ts` | Search |
| `RoutingProvider` | `RoutingProvider.ts` | Route calculation |
| `OutdoorDataProvider` | `OutdoorDataProvider.ts` | Hiking/walking trail geometry |
| `SkiDataProvider` | `SkiDataProvider.ts` | Ski areas/runs/lifts |

## Cost / provider table (V1 target: £0/month mandatory)

| Feature | Provider | Cost | Limits | API key | Attribution |
|---|---|---|---|---|---|
| Base map | OpenFreeMap (public instance) | Free, no cap | No published limit; self-hostable | No | © OpenStreetMap contributors |
| Roads/places/water/boundaries | OpenStreetMap data | Free | ODbL share-alike on *data* | No | Yes |
| Terrain/elevation | AWS Open Data Terrarium tiles (`elevation-tiles-prod`) | Free | None published | No | Per-region agency credit + Mapzen (see Tilezen/Joerd attribution doc) |
| Satellite imagery | Esri World Imagery via **ArcGIS Location Platform** (not the legacy keyless endpoint) | Free tier | 2,000,000 tile requests/month; over-limit blocked, not billed, unless PAYG enabled with a card | Yes, free signup | "Powered by Esri" |
| Hiking/walking trails | OSM data (same base-map vector tiles, tag-filtered) | Free | Same as base map | No | Same OSM attribution |
| Long-distance trail overlay (optional) | Waymarked Trails | Free, community-funded | No published hard cap — cache aggressively | No | © Waymarked Trails, OSM contributors |
| Ski resorts/runs/lifts | OpenSkiMap.org vector tiles (`tiles.openskimap.org/openskimap/{z}/{x}/{y}.pbf`, confirmed via direct tile fetch — OSM + Skimap.org derived) | Free | No documented request limit | No | OSM + OpenSkiMap attribution |
| Routing | OpenRouteService | Free tier | ~2,000 req/day, 40 req/60s (official FAQ) | Yes, free signup, no card | © openrouteservice.org, OSM contributors |
| Search/geocoding | Photon (primary), Nominatim (fallback) | Free | Fair-use only; Nominatim hard cap 1 req/sec | No | OSM attribution |
| 2D topo/contour fallback | OpenTopoMap | Free | ~400k tiles/month "low volume" threshold | No | OpenTopoMap + OSM + SRTM attribution |

### Known limitations
- Esri World Imagery: use the ArcGIS Location Platform key, not the legacy keyless tile endpoint (whose stated terms are scoped to OSM-editing/tracing use, not general app display).
- AWS Terrarium terrain is ~30m resolution in most regions (SRTM-derived) — good for hiking/ski, not survey-grade.
- Nominatim/Photon are shared community infrastructure — client debounces, caches, and rate-limits to stay a good citizen.
- Waymarked Trails has no formal published API terms; treated as a best-effort optional overlay.
- OSM data completeness varies by region — rural/non-Western coverage will be sparser.

## Development phases

1. Foundation — Tauri + React + MapLibre globe, camera controls (done)
2. Map — roads/places/boundaries styling, layer switcher (done)
3. Terrain — 3D terrain, hillshading, contours (done)
4. Search — geocoding, fly-to, place info (done)
5. Outdoor — hiking/walking trail layers (done)
6. Ski — resorts, runs, lifts, difficulty colors (done)
7. Routing — waypoint editor, mode-aware routing (done — walking/hiking/cycling/driving modes need your ORS key, see below; manual mode works now)
8. Elevation — route stats: profile chart, ascent/descent, max/avg slope, time estimate, unit toggle, trail/road breakdown with map coloring (done — ORS's own ascent/descent/extras.waytype used when available; manual mode falls back to DEM-sampled, noise-filtered gain/loss with no trail/road breakdown, since no classification data exists for an arbitrary drawn line)
9. GPX export & import — GPX 1.1 track/waypoint export via native Save dialog; import accepts `<trk>`, `<rte>`, or `<wpt>`-only files via native Open dialog, no fabricated elevation when a file omits `<ele>` (done — XML generation/parsing verified via round-trip test with real coordinates plus malformed-file handling; native file-dialog save/open flow itself needs a check in the real app window, not just the browser preview)
10. Liquid Glass UI polish — shared glass design tokens, top-edge specular highlight, entrance animations, button press feedback (done)
11. Performance — IndexedDB-backed tile/geocode cache, size-capped LRU eviction, cache panel with clear button (done — originally Rust/SQLite-backed via Tauri IPC; migrated to IndexedDB to cut per-tile IPC + base64 overhead, and to cover the base map itself via MapLibre's transformRequest, which the original SQLite version had left out. Now caches everything: base style JSON/sprite/glyphs/vector tiles, DEM, satellite, topo, ski, and Waymarked Trails. Also works identically in the browser preview, not just the real app, since IndexedDB needs no Tauri bridge)
11b. Satellite / 3D Satellite modes — Esri World Imagery via ArcGIS Location Platform, hybrid overlay under base-style labels, 3D Satellite auto-enables terrain (done — verified live with your key, real imagery confirmed rendering and correctly aligned)
11c. Terrain (2D) mode — OpenTopoMap hillshaded/hypsometric raster overlay, same hybrid-under-labels approach, no key needed (done — verified live, real relief shading confirmed rendering correctly). All four map modes (Standard/Satellite/Terrain/3D Satellite) are now built and enabled.
12. Final testing against the V1 acceptance checklist (done — full layer/source stack, search, routing, elevation profile, GPX, glass UI, and cache all confirmed intact with no regressions from phases 9-11; see chat for the two items that need your own check in the real window)
