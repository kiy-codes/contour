import "./TerrainControls.css";

export interface OutdoorControlsProps {
  hikingTrailsEnabled: boolean;
  onHikingTrailsEnabledChange: (enabled: boolean) => void;
  longDistanceTrailsEnabled: boolean;
  onLongDistanceTrailsEnabledChange: (enabled: boolean) => void;
  trailNamesEnabled: boolean;
  onTrailNamesEnabledChange: (enabled: boolean) => void;
}

export default function OutdoorControls({
  hikingTrailsEnabled,
  onHikingTrailsEnabledChange,
  longDistanceTrailsEnabled,
  onLongDistanceTrailsEnabledChange,
  trailNamesEnabled,
  onTrailNamesEnabledChange,
}: OutdoorControlsProps) {
  return (
    <div className="terrain-controls">
      <label className="terrain-controls__row">
        <input
          type="checkbox"
          checked={hikingTrailsEnabled}
          onChange={(e) => onHikingTrailsEnabledChange(e.target.checked)}
        />
        Hiking trails
      </label>
      <label className="terrain-controls__row">
        <input
          type="checkbox"
          checked={longDistanceTrailsEnabled}
          onChange={(e) => onLongDistanceTrailsEnabledChange(e.target.checked)}
        />
        Long-distance trails
      </label>
      <label className="terrain-controls__row">
        <input type="checkbox" checked={trailNamesEnabled} onChange={(e) => onTrailNamesEnabledChange(e.target.checked)} />
        Trail names
      </label>
    </div>
  );
}
