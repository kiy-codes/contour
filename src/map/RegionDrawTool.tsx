import "./TerrainControls.css";
import "./RegionDrawTool.css";

export interface RegionDrawToolProps {
  active: boolean;
  onToggle: () => void;
}

/** Small desktop toolbar entry that arms/disarms MapCanvas's
 * regionDrawEnabled rectangle-select mode (see MapCanvas.tsx). The actual
 * drag-to-draw interaction lives on the map itself; this just toggles it
 * on and shows a hint while it's active. */
export default function RegionDrawTool({ active, onToggle }: RegionDrawToolProps) {
  return (
    <div className="terrain-controls region-draw-tool">
      {active ? (
        <>
          <div className="region-draw-tool__hint">Drag on the map to select an area to download</div>
          <div className="terrain-controls__row">
            <button className="glass-btn" onClick={onToggle}>
              Cancel
            </button>
          </div>
        </>
      ) : (
        <div className="terrain-controls__row">
          <button className="glass-btn" onClick={onToggle}>
            Download region
          </button>
        </div>
      )}
    </div>
  );
}
