import "./TerrainControls.css";

export interface TerrainControlsProps {
  terrainEnabled: boolean;
  onTerrainEnabledChange: (enabled: boolean) => void;
  exaggeration: number;
  onExaggerationChange: (value: number) => void;
  contoursEnabled: boolean;
  onContoursEnabledChange: (enabled: boolean) => void;
}

export default function TerrainControls({
  terrainEnabled,
  onTerrainEnabledChange,
  exaggeration,
  onExaggerationChange,
  contoursEnabled,
  onContoursEnabledChange,
}: TerrainControlsProps) {
  return (
    <div className="terrain-controls">
      <label className="terrain-controls__row">
        <input type="checkbox" checked={terrainEnabled} onChange={(e) => onTerrainEnabledChange(e.target.checked)} />
        3D Terrain
      </label>
      <div className="terrain-controls__row terrain-controls__row--slider">
        <span>Exaggeration</span>
        <input
          type="range"
          min={1}
          max={3}
          step={0.25}
          value={exaggeration}
          disabled={!terrainEnabled}
          onChange={(e) => onExaggerationChange(Number(e.target.value))}
        />
        <span className="terrain-controls__value">{exaggeration.toFixed(2)}x</span>
      </div>
      <label className="terrain-controls__row">
        <input type="checkbox" checked={contoursEnabled} onChange={(e) => onContoursEnabledChange(e.target.checked)} />
        Contours
      </label>
    </div>
  );
}
