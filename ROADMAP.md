# Roadmap

Where Contour (Windows desktop) stands and what's likely next. See [`architecture.md`](./architecture.md) for the full phase-by-phase build log and provider details, and [`CHANGELOG.md`](./CHANGELOG.md) for what shipped in each release.

## Status as of v1.3.0

**Fully shipped and verified:**
- Globe navigation, four map modes, 3D terrain/contours, search, hiking/ski layers, GPX/GeoJSON/KML routing and analysis, offline maps, GPS location.
- Weather: keyless hourly forecast panel (verified live); raster map overlay (implemented and error/unavailable-path verified, needs a user-supplied OpenWeatherMap key to see live tiles).
- Avalanche danger ratings for US/Alaska forecast centers (verified live against the real API).
- Smart route planning (loop/out-and-back/point-to-point, verified live against ORS) with honest limits on what it can and can't optimise for.
- Route analysis (steep sections, difficulty estimate, elevation range, waypoint summary — verified live with real elevation data).
- Measuring tools, coordinate readout/copy/format, waypoint reordering, grid overlay, GeoJSON/KML import, GeoJSON export.
- Garmin: validated GPX course export + local transfer instructions (real, working). Direct account upload is a designed-but-unimplemented interface (`GarminProvider`) — Garmin's Courses API is business-only, application-gated, and has no sandbox (confirmed live against Garmin's developer site), so there is nothing to implement against yet.
- Tile-fetch concurrency bounding, timeouts + rate-limit-aware messages on every network provider, mutual-exclusion between map click-tools, confirm-before-discard on Clear, and a corrupt-data fallback for offline-region metadata reads.

**Known gaps, tracked here rather than silently dropped:**
- No avalanche coverage outside the US/Alaska — `AvalancheProvider` is a clean interface, so a second regional service (e.g. a verified EAWS-aggregating source for Europe) can be added without touching the UI.
- KMZ (zipped KML) import isn't supported, only plain KML — would need a zip-handling dependency.
- The weather map overlay has no forecast/time-travel on the free OpenWeatherMap tier (current conditions only); the Open-Meteo panel is the real forecast source.
- The smart route planner can't target viewpoints, peaks, or surface type — no wired data source supports that, and the UI says so rather than faking it.
- The production JS bundle is a single ~1.29 MB chunk (build warns about this) — not yet code-split.

## Release checklist

### V1 (core mapping + routing) — complete
- [x] Globe navigation, 4 map modes, 3D terrain/contours
- [x] Search, place info
- [x] Hiking/ski layers
- [x] Route planning (manual + ORS modes), elevation profile, GPX export/import
- [x] Liquid Glass UI, local tile cache
- [x] Offline maps, GPS location

### V2 (this round) — complete, with the limitations noted above
- [x] Weather map + forecast panel
- [x] Avalanche danger ratings (US/Alaska)
- [x] Smart route planning
- [x] Extended route analysis
- [x] Planning tools (measure, coordinates, reorder, grid, GeoJSON/KML)
- [x] Garmin export foundation (local GPX course export; no direct upload — see Known limitations)
- [x] Cross-feature integration pass, tile-loading audit, route-editor polish, network resilience (this document + CHANGELOG)
- [x] Documentation/release-readiness pass
- [x] Final quality pass — production build produced a working `.exe`/`.msi` (release compile clean, MSI installer built successfully, reproduced 3x); the NSIS `.exe`-installer bundling step reproducibly fails with a Windows file-move error (os error 17), root-caused to Claude Code's own app-container sandboxing redirecting its NSIS download cache to isolated storage Windows treats as a different device — not an app or config defect, see CHANGELOG for the full diagnosis. No automated test suite exists in this repo; verification throughout was `tsc` type-checking (always clean) plus extensive live manual testing.

### Not in V1 or V2 (deliberately out of scope)
- Live route following / turn-by-turn navigation
- Direct Garmin account upload (blocked on Garmin's own business-approval process)
- Android build (Windows desktop only, per project scope)

## Candidate next phases

Not commitments — listed in rough order of likely value, for whoever picks up the next phase:

1. **Live route following / navigation** — explicitly out of scope for everything shipped so far (per standing instructions); would need heading, off-route detection, turn-by-turn, and background location handling design before starting.
2. **Second avalanche region** — verify and wire a European or other-region avalanche source behind the existing `AvalancheProvider` interface.
3. **Bundle size** — split the JS bundle (dynamic `import()` for MapLibre/route-planning/weather code) so initial load doesn't pull everything at once.
4. **KMZ import** — add a zip-handling dependency and unwrap to reuse the existing KML parser.
5. **Offline weather/avalanche** — decide whether/how these should degrade when offline (currently: same "unavailable" treatment as any other network failure, no offline caching since the data is inherently time-sensitive).
6. **Route-planner elevation-gain targeting** — currently a post-hoc check against a max, not a real optimisation target; would need either a smarter multi-candidate search against ORS or a different routing engine with that capability.
7. **Directional tile prefetch** — pre-fetch a small buffer of tiles ahead of the pan direction. Investigated; MapLibre GL has no documented/safe hook for this, so it wasn't added speculatively — would need either a deeper MapLibre internals dig or switching to a lower-level tile-management approach.
8. **Real Garmin Connect upload** — needs a completed, approved Garmin Connect Developer Program business application (Garmin's own process, outside this codebase) before `GarminProvider` can get a real implementation. When that exists: OAuth 2.0 Authorization Code + PKCE (no embedded client secret), token storage via a proper OS-backed secure store rather than browser localStorage (nothing in this app currently has that — would need adding, e.g. a small Tauri command backed by the Windows Credential Manager), and the upload/list/delete methods filled in behind the existing interface.
