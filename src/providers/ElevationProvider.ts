import type { Map as MapLibreMap } from "maplibre-gl";
import type { LngLat, LngLatElevation } from "./types";

/**
 * Answers point/path elevation queries. The intended implementation samples
 * whichever TerrainProvider DEM tiles are already loaded for 3D terrain
 * rendering, rather than making a separate network call per query — keeps
 * elevation profile generation fast and avoids depending on a second
 * rate-limited service.
 */
export interface ElevationProvider {
  getElevation(point: LngLat): Promise<number | null>;
  getElevationProfile(points: LngLat[]): Promise<LngLatElevation[]>;
}

/**
 * Samples elevation from the MapLibre terrain DEM tiles already loaded for
 * 3D rendering (map.queryTerrainElevation). Returns null when terrain isn't
 * enabled or the relevant tile isn't loaded yet — callers should treat that
 * as "unknown", never fabricate a value.
 */
export class MapLibreElevationProvider implements ElevationProvider {
  constructor(private readonly getMap: () => MapLibreMap | null) {}

  async getElevation(point: LngLat): Promise<number | null> {
    const map = this.getMap();
    if (!map) return null;
    const elevation = map.queryTerrainElevation([point.lng, point.lat]);
    return elevation ?? null;
  }

  async getElevationProfile(points: LngLat[]): Promise<LngLatElevation[]> {
    const results: LngLatElevation[] = [];
    for (const point of points) {
      const elevation = await this.getElevation(point);
      results.push({ ...point, elevation: elevation ?? undefined });
    }
    return results;
  }
}
