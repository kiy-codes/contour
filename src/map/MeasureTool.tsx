import { useUnits } from "../units/UnitsContext";
import "./TerrainControls.css";
import "./MeasureTool.css";

export type MeasureMode = "off" | "distance" | "area";

export interface MeasureToolProps {
  mode: MeasureMode;
  onModeChange: (mode: MeasureMode) => void;
  pointCount: number;
  totalMeters: number;
  areaSqMeters: number | null;
  onClear: () => void;
  gridEnabled: boolean;
  onGridEnabledChange: (enabled: boolean) => void;
}

function formatArea(sqMeters: number): string {
  if (sqMeters >= 1_000_000) return `${(sqMeters / 1_000_000).toFixed(2)} km²`;
  if (sqMeters >= 10_000) return `${(sqMeters / 10_000).toFixed(2)} ha`;
  return `${Math.round(sqMeters)} m²`;
}

export default function MeasureTool({
  mode,
  onModeChange,
  pointCount,
  totalMeters,
  areaSqMeters,
  onClear,
  gridEnabled,
  onGridEnabledChange,
}: MeasureToolProps) {
  const { formatDistance } = useUnits();

  return (
    <div className="measure-tool">
      <div className="measure-tool__triggers">
        <button
          className={mode === "distance" ? "weather-controls__pill weather-controls__pill--active" : "weather-controls__pill"}
          onClick={() => onModeChange(mode === "distance" ? "off" : "distance")}
          title="Measure distance — click points on the map"
        >
          Measure distance
        </button>
        <button
          className={mode === "area" ? "weather-controls__pill weather-controls__pill--active" : "weather-controls__pill"}
          onClick={() => onModeChange(mode === "area" ? "off" : "area")}
          title="Measure area — click points on the map"
        >
          Measure area
        </button>
        <button
          className={gridEnabled ? "weather-controls__pill weather-controls__pill--active" : "weather-controls__pill"}
          onClick={() => onGridEnabledChange(!gridEnabled)}
          title="Toggle a lat/lng reference grid"
        >
          Grid
        </button>
      </div>

      {mode !== "off" && (
        <div className="terrain-controls measure-tool__panel">
          <span className="measure-tool__hint">{pointCount === 0 ? "Click the map to start." : "Click to add points."}</span>
          <div className="measure-tool__readout">
            <span className="measure-tool__value">{formatDistance(totalMeters)}</span>
            <span className="measure-tool__label">{mode === "area" ? "Perimeter" : "Distance"}</span>
          </div>
          {mode === "area" && areaSqMeters !== null && (
            <div className="measure-tool__readout">
              <span className="measure-tool__value">{formatArea(areaSqMeters)}</span>
              <span className="measure-tool__label">Area</span>
            </div>
          )}
          <div className="route-controls__row">
            <button onClick={onClear} disabled={pointCount === 0}>
              Clear
            </button>
            <button onClick={() => onModeChange("off")}>Done</button>
          </div>
        </div>
      )}
    </div>
  );
}
