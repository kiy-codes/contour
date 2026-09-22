// Reduces terrain/tile "LOD pop" — the hard, one-frame swap to a different
// zoom tile as the camera moves — by adding hysteresis on top of MapLibre's
// own calculateTileZoom hook (set via Map.setSourceTileLodParams).
//
// Why this exists: read directly from maplibre-gl@6.5.0's own source before
// writing this. The tile-swap texture fade (raster-fade-duration) is
// hardcoded OFF whenever 3D terrain is active (tile_manager.ts, gated on
// `!terrain` with no override), there is no geomorphing/height-blending
// between adjacent-zoom tiles anywhere in the renderer (each tile
// independently samples only its own DEM texture), and calculateTileZoom
// itself is a pure function of the current camera geometry recomputed fresh
// every call with no memory of the previous frame — so a tile hovering near
// an integer-zoom boundary can flip its selected zoom back and forth every
// single frame. None of that can be fixed from application code. What CAN
// be fixed: how often a swap is allowed to happen at all. Fewer swaps means
// fewer visible pops, even though each individual swap is still a hard cut.
//
// calculateTileZoom's signature (requestedCenterZoom, distanceToTile2D,
// distanceToTileZ, distanceToCenter3D, cameraVerticalFOV) — confirmed by
// reading node_modules/maplibre-gl/src/geo/projection/covering_tiles.ts —
// does NOT include the tile's own id, so there is no way to key hysteresis
// state by "this exact tile". Instead this keys by a coarse, LOG-scaled
// bucket of the distance inputs: the same physical tile evaluated on
// consecutive frames (camera barely moved) lands in the same bucket, while
// two genuinely different tiles usually don't share one. Log-scaled because
// zoom itself is logarithmic in distance — a fixed linear bucket would be
// far too coarse near the camera and far too fine at the horizon. An
// occasional bucket collision between two unrelated tiles is a real
// possibility and an accepted trade-off: worst case is a swap allowed
// slightly earlier/later than ideal for one tile, never a crash or a change
// to the underlying LOD curve shape (the wrapped function is only ever
// asked "hold the old value or take the new one" — it never alters what the
// base function actually computes).
type CalculateTileZoom = (
  requestedCenterZoom: number,
  distanceToTile2D: number,
  distanceToTileZ: number,
  distanceToCenter3D: number,
  cameraVerticalFOV: number,
) => number;

// Every call belongs to one continuous "session" (one style-tuning pass);
// entries older than this are just stale distance buckets nobody asked
// about recently — cheap to drop, no correctness cost since a missing entry
// simply means the next call for that bucket starts fresh (no held value).
const STALE_MS = 4000;

function bucketKey(distanceToTile2D: number, distanceToCenter3D: number): string {
  const a = Math.round(Math.log2(Math.max(1, distanceToTile2D)) * 4);
  const b = Math.round(Math.log2(Math.max(1, distanceToCenter3D)) * 4);
  return `${a}:${b}`;
}

/** Wraps a calculateTileZoom function so it only returns a new value once
 * the raw result differs from the last one seen for a similar camera
 * geometry by more than `marginZoomLevels` — otherwise it holds the
 * previous value, suppressing flicker right at an integer-zoom boundary. */
export function withTileZoomHysteresis(base: CalculateTileZoom, marginZoomLevels: number): CalculateTileZoom {
  const lastByKey = new Map<string, { zoom: number; at: number }>();
  let lastSweep = Date.now();

  return (requestedCenterZoom, distanceToTile2D, distanceToTileZ, distanceToCenter3D, cameraVerticalFOV) => {
    const raw = base(requestedCenterZoom, distanceToTile2D, distanceToTileZ, distanceToCenter3D, cameraVerticalFOV);
    const now = Date.now();

    if (now - lastSweep > STALE_MS) {
      lastSweep = now;
      for (const [key, entry] of lastByKey) {
        if (now - entry.at > STALE_MS) lastByKey.delete(key);
      }
    }

    const key = bucketKey(distanceToTile2D, distanceToCenter3D);
    const prev = lastByKey.get(key);
    if (prev && Math.abs(raw - prev.zoom) < marginZoomLevels) {
      prev.at = now;
      return prev.zoom;
    }
    lastByKey.set(key, { zoom: raw, at: now });
    return raw;
  };
}

interface TileManagerLike {
  getSource(): { calculateTileZoom?: CalculateTileZoom };
}

interface StyleWithTileManagers {
  style?: { tileManagers?: Record<string, TileManagerLike> };
}

/** Applies hysteresis on top of whatever calculateTileZoom
 * Map.setSourceTileLodParams just assigned. Call this immediately after
 * setSourceTileLodParams — for a specific sourceId to wrap just that
 * source, or with no sourceId to wrap every source currently on the style
 * (matching setSourceTileLodParams's own unscoped-vs-scoped behavior).
 *
 * Reaches into style.tileManagers / source.calculateTileZoom, which are
 * real but undocumented/private MapLibre internals (not part of its public
 * TypeScript surface) — same risk class as the terrain.qualityFactor lever
 * noted elsewhere in this codebase. Verify visually after any MapLibre
 * version bump. */
export function applyTileZoomHysteresis(map: unknown, marginZoomLevels: number, sourceId?: string): void {
  const tileManagers = (map as StyleWithTileManagers).style?.tileManagers;
  if (!tileManagers) return;

  const ids = sourceId ? [sourceId] : Object.keys(tileManagers);
  for (const id of ids) {
    const source = tileManagers[id]?.getSource();
    if (!source?.calculateTileZoom) continue;
    source.calculateTileZoom = withTileZoomHysteresis(source.calculateTileZoom, marginZoomLevels);
  }
}
