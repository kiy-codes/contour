import type { SearchResult } from "../providers/GeocodingProvider";
import "./PlaceInfoPanel.css";

export interface PlaceInfoPanelProps {
  place: SearchResult;
  elevation: number | null | "loading";
  onClose: () => void;
}

const TYPE_LABEL: Record<SearchResult["type"], string> = {
  country: "Country",
  region: "Region",
  city: "City",
  town: "Town",
  village: "Village",
  street: "Street",
  address: "Address",
  peak: "Peak",
  lake: "Water",
  poi: "Place",
  other: "Place",
};

function formatCoord(value: number, positiveSuffix: string, negativeSuffix: string): string {
  const suffix = value >= 0 ? positiveSuffix : negativeSuffix;
  return `${Math.abs(value).toFixed(4)}°${suffix}`;
}

export default function PlaceInfoPanel({ place, elevation, onClose }: PlaceInfoPanelProps) {
  return (
    <div className="place-info-panel">
      <button className="place-info-panel__close" onClick={onClose} aria-label="Close place information">
        ×
      </button>
      <div className="place-info-panel__type">{TYPE_LABEL[place.type]}</div>
      <h2 className="place-info-panel__name">{place.name}</h2>

      <dl className="place-info-panel__facts">
        {place.country && (
          <>
            <dt>Country</dt>
            <dd>{place.country}</dd>
          </>
        )}
        {place.region && (
          <>
            <dt>Region</dt>
            <dd>{place.region}</dd>
          </>
        )}
        <dt>Coordinates</dt>
        <dd>
          {formatCoord(place.center.lat, "N", "S")}, {formatCoord(place.center.lng, "E", "W")}
        </dd>
        <dt>Elevation</dt>
        <dd>
          {elevation === "loading" && "…"}
          {elevation === null && "Not available"}
          {typeof elevation === "number" && `${Math.round(elevation)} m`}
        </dd>
      </dl>
    </div>
  );
}
