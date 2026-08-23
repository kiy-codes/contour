# Contour

A premium 3D world mapping desktop app — Google Earth-style globe navigation, AllTrails-style hiking/route planning, ski resort mapping, and GPX export, built on free/open geographic data.

Windows desktop app built with [Tauri v2](https://tauri.app) + React + TypeScript + [MapLibre GL JS](https://maplibre.org).

See [`architecture.md`](./architecture.md) for the provider architecture, data sources, and licensing/cost notes.

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

Everything else (globe navigation, terrain, hiking/ski trail layers, search, GPX import/export) works with no keys at all.

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
