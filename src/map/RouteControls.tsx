import type { RoutingMode } from "../providers/RoutingProvider";
import { useExitTransition } from "../theme/useExitTransition";
import "./TerrainControls.css";
import "./RouteControls.css";

const CLOSE_ANIMATION_MS = 220;

export interface RouteControlsProps {
  isEditing: boolean;
  hasWaypoints: boolean;
  hasImportedRoute: boolean;
  mode: RoutingMode;
  hasOrs: boolean;
  canUndo: boolean;
  canRedo: boolean;
  onStart: () => void;
  onFinish: () => void;
  onClear: () => void;
  onUndo: () => void;
  onRedo: () => void;
  onModeChange: (mode: RoutingMode) => void;
  onImportGpx: () => void;
  onExportGpx: () => void;
}

const MODE_OPTIONS: { mode: RoutingMode; label: string; needsOrs: boolean }[] = [
  { mode: "hiking", label: "Hiking", needsOrs: true },
  { mode: "walking", label: "Walking", needsOrs: true },
  { mode: "cycling", label: "Cycling", needsOrs: true },
  { mode: "driving", label: "Driving", needsOrs: true },
  { mode: "manual", label: "Manual", needsOrs: false },
];

export default function RouteControls({
  isEditing,
  hasWaypoints,
  hasImportedRoute,
  mode,
  hasOrs,
  canUndo,
  canRedo,
  onStart,
  onFinish,
  onClear,
  onUndo,
  onRedo,
  onModeChange,
  onImportGpx,
  onExportGpx,
}: RouteControlsProps) {
  // The full editing panel below is its own branch, not a toggled child —
  // so its close (Finish+Clear collapsing back down) needs the same
  // exit-transition treatment as the other panels, keyed off whether it
  // should be showing at all rather than a simple open/closed prop.
  const showFullPanel = isEditing || hasWaypoints;
  const { rendered: fullPanelRendered, closing: fullPanelClosing } = useExitTransition(showFullPanel, CLOSE_ANIMATION_MS);

  if (!fullPanelRendered && !hasImportedRoute) {
    return (
      <div className="terrain-controls">
        <button className="route-controls__start" onClick={onStart}>
          Start route
        </button>
        <div className="route-controls__row">
          <button onClick={onImportGpx}>Import GPX</button>
        </div>
      </div>
    );
  }

  if (!fullPanelRendered && hasImportedRoute) {
    return (
      <div className="terrain-controls">
        <div className="route-controls__row">
          <button onClick={onExportGpx}>Export GPX</button>
          <button onClick={onImportGpx}>Import GPX</button>
        </div>
        <div className="route-controls__row">
          <button onClick={onClear}>Clear</button>
          <button onClick={onStart}>Start new route</button>
        </div>
      </div>
    );
  }

  return (
    <div className={fullPanelClosing ? "terrain-controls route-controls route-controls--closing" : "terrain-controls route-controls"}>
      <div className="route-controls__modes">
        {MODE_OPTIONS.map((opt) => {
          const disabled = opt.needsOrs && !hasOrs;
          return (
            <button
              key={opt.mode}
              className={mode === opt.mode ? "route-controls__mode route-controls__mode--active" : "route-controls__mode"}
              disabled={disabled}
              title={disabled ? "Needs a free OpenRouteService API key — not configured yet" : opt.label}
              onClick={() => onModeChange(opt.mode)}
            >
              {opt.label}
            </button>
          );
        })}
      </div>
      <div className="route-controls__row">
        <button disabled={!canUndo} onClick={onUndo} title="Undo">
          ↶ Undo
        </button>
        <button disabled={!canRedo} onClick={onRedo} title="Redo">
          ↷ Redo
        </button>
      </div>
      <div className="route-controls__row">
        {isEditing ? (
          <button onClick={onFinish}>Finish</button>
        ) : (
          <button onClick={onStart}>Continue editing</button>
        )}
        <button onClick={onClear} disabled={!hasWaypoints}>
          Clear
        </button>
      </div>
      <div className="route-controls__row">
        <button onClick={onExportGpx} disabled={!hasWaypoints}>
          Export GPX
        </button>
        <button onClick={onImportGpx}>Import GPX</button>
      </div>
    </div>
  );
}
