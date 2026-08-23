import type { AttributionEntry } from "./types";
import type { FilterSpecification } from "maplibre-gl";

export type TrailType = "footpath" | "hiking" | "long-distance" | "bridleway" | "track";

/**
 * Supplies hiking/walking trail geometry. Primary source is OSM data — the
 * same "openmaptiles" vector source the base map style already loads
 * (tag-filtered on the `transportation` source-layer), so this never needs
 * its own network round trip or a separate tile budget. Waymarked Trails is
 * a supplementary raster overlay handled separately (see useOutdoorLayers)
 * for named long-distance route rendering, since it isn't vector geometry
 * from this same source.
 */
export interface OutdoorDataProvider {
  readonly name: string;
  readonly attribution: AttributionEntry;
  /** Vector source + source-layer this provider reads from — already part
   * of the base map style, not a source this provider adds itself. */
  readonly vectorSourceId: string;
  readonly sourceLayer: string;
  /** MapLibre filter selecting hiking/walking-relevant ways from that layer. */
  readonly trailFilter: FilterSpecification;
}

/**
 * Reads hiking/walking paths and tracks out of the OpenMapTiles
 * "transportation" layer already present in the OpenFreeMap style (verified
 * against the live style JSON: `class` values include "path", "track",
 * "pedestrian" — no finer OSM-tag subclass is populated in this tileset, so
 * that's the finest filter available without a second data source).
 */
export class OsmTransportationOutdoorProvider implements OutdoorDataProvider {
  readonly name = "OpenStreetMap (via base map vector tiles)";
  readonly attribution: AttributionEntry = {
    html: '© <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">OpenStreetMap</a> contributors',
  };
  readonly vectorSourceId = "openmaptiles";
  readonly sourceLayer = "transportation";
  readonly trailFilter: FilterSpecification = ["match", ["get", "class"], ["path", "track"], true, false];
}
