// Live-tunable rendering knobs, persisted to localStorage (same best-effort
// pattern as ThemeContext). These exist because the values that make 3D feel
// right are device-specific and can only really be judged on the phone —
// baking them into constants meant a full Android rebuild per guess.
//
// pixelRatio is a permanent user setting. The two LOD numbers are TEMPORARY
// tuning inputs: once we've settled on values that look right on-device, fold
// them back into MapCanvas's DEFAULT_TERRAIN_LOD/PERFORMANCE_TERRAIN_LOD and
// drop them from the settings UI.

const STORAGE_KEY = "contour-render-settings";

export interface RenderSettings {
  /** Canvas resolution multiplier. Defaults to 2 rather than the device's own
   * devicePixelRatio (2.81 on the test phone) — fragment cost scales with the
   * square of this, so 2 is roughly half the GPU work for a difference that's
   * hard to see at this density. */
  pixelRatio: number;
  /** How fast tile zoom decays toward the horizon. Higher = distant tiles get
   * coarser faster = cheaper frame. See MapLibre's setSourceTileLodParams. */
  maxZoomLevelsOnScreen: number;
  /** How many more tiles a pitched view may use than a top-down one before
   * MapLibre uniformly drops zoom across the WHOLE frame. Higher = the near
   * field keeps its resolution when you pitch down. This is the knob that
   * controls the "everything goes blurry when pitched" behaviour. */
  tileCountMaxMinRatio: number;
  /** Same as maxZoomLevelsOnScreen, but applied only to the terrain DEM
   * source instead of the visual (imagery) sources. MapLibre's terrain mesh
   * is a fixed-size grid reused for every tile regardless of zoom — so the
   * DEM source's LOD params are simultaneously "elevation texture
   * resolution" AND "how much terrain geometry gets drawn". This wants to be
   * much more aggressive than the visual falloff: unlike a photo, a coarser
   * elevation sample at distance is nearly invisible, but it directly caps
   * triangle count. */
  terrainMaxZoomLevelsOnScreen: number;
  /** Same as tileCountMaxMinRatio, but for the DEM source. Unlike the visual
   * case there's no near-field-sharpness reason to keep this high — it
   * should be LOW, to cap total mesh-tile count hard at high pitch. */
  terrainTileCountMaxMinRatio: number;
}

export const DEFAULT_RENDER_SETTINGS: RenderSettings = {
  pixelRatio: 2,
  maxZoomLevelsOnScreen: 12,
  tileCountMaxMinRatio: 6,
  terrainMaxZoomLevelsOnScreen: 20,
  terrainTileCountMaxMinRatio: 2,
};

/** Guards against a stored value (or a typed-in one) that would make the map
 * unusable — MapLibre itself floors the LOD pair at 1, but a pixelRatio of 0
 * or 40 would produce a blank or an out-of-memory canvas. */
export function clampRenderSettings(s: RenderSettings): RenderSettings {
  return {
    pixelRatio: clamp(s.pixelRatio, 1, 4, DEFAULT_RENDER_SETTINGS.pixelRatio),
    maxZoomLevelsOnScreen: clamp(s.maxZoomLevelsOnScreen, 1, 30, DEFAULT_RENDER_SETTINGS.maxZoomLevelsOnScreen),
    tileCountMaxMinRatio: clamp(s.tileCountMaxMinRatio, 1, 30, DEFAULT_RENDER_SETTINGS.tileCountMaxMinRatio),
    terrainMaxZoomLevelsOnScreen: clamp(
      s.terrainMaxZoomLevelsOnScreen,
      1,
      30,
      DEFAULT_RENDER_SETTINGS.terrainMaxZoomLevelsOnScreen,
    ),
    terrainTileCountMaxMinRatio: clamp(
      s.terrainTileCountMaxMinRatio,
      1,
      30,
      DEFAULT_RENDER_SETTINGS.terrainTileCountMaxMinRatio,
    ),
  };
}

function clamp(value: number, min: number, max: number, fallback: number): number {
  if (!Number.isFinite(value)) return fallback;
  return Math.min(max, Math.max(min, value));
}

/** The ratio to actually hand MapLibre. The setting is a *ceiling*, never a
 * target: rendering above the display's own pixel ratio is supersampling —
 * it costs real GPU time and cannot show any extra detail. So a default of 2
 * caps the test phone (2.81) but leaves a 1.75x laptop rendering natively. */
export function effectivePixelRatio(settings: RenderSettings): number {
  const devicePixelRatio = typeof window === "undefined" ? 1 : window.devicePixelRatio || 1;
  return Math.min(settings.pixelRatio, devicePixelRatio);
}

export function loadRenderSettings(): RenderSettings {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      const parsed = JSON.parse(stored) as Partial<RenderSettings>;
      return clampRenderSettings({ ...DEFAULT_RENDER_SETTINGS, ...parsed });
    }
  } catch {
    // Unreadable or corrupt — fall back to defaults rather than blocking startup.
  }
  return DEFAULT_RENDER_SETTINGS;
}

export function saveRenderSettings(settings: RenderSettings): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
  } catch {
    // best-effort persistence only
  }
}
