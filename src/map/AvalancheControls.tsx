import { avalancheProvider } from "../providers/avalancheInstances";
import type { AvalancheStatus } from "../avalanche/useAvalancheLayer";
import "./TerrainControls.css";
import "./AvalancheControls.css";

export interface AvalancheControlsProps {
  avalancheEnabled: boolean;
  onAvalancheEnabledChange: (enabled: boolean) => void;
  avalancheStatus: AvalancheStatus;
  avalancheError: string | null;
  avalancheRegionCount: number;
  avalancheFetchedAt: number | null;
  onRefreshAvalanche: () => void;
}

const LEGEND: { label: string; color: string }[] = [
  { label: "Low", color: "#4aa03d" },
  { label: "Moderate", color: "#f7ec13" },
  { label: "Considerable", color: "#f7941d" },
  { label: "High", color: "#ed1c24" },
  { label: "Extreme", color: "#3a0c0c" },
];

function relativeTime(ms: number | null): string {
  if (ms === null) return "—";
  const deltaM = Math.round((Date.now() - ms) / 60000);
  if (deltaM < 1) return "just now";
  if (deltaM < 60) return `${deltaM}m ago`;
  return `${Math.round(deltaM / 60)}h ago`;
}

export default function AvalancheControls({
  avalancheEnabled,
  onAvalancheEnabledChange,
  avalancheStatus,
  avalancheError,
  avalancheRegionCount,
  avalancheFetchedAt,
  onRefreshAvalanche,
}: AvalancheControlsProps) {
  return (
    <div className="terrain-controls avalanche-controls">
      <span className="settings-menu__section-label">Avalanche</span>
      <label className="terrain-controls__row">
        <input type="checkbox" checked={avalancheEnabled} onChange={(e) => onAvalancheEnabledChange(e.target.checked)} />
        Danger ratings
      </label>

      {avalancheEnabled && (
        <>
          {avalancheStatus === "loading" && <p className="avalanche-controls__hint">Loading forecast centers…</p>}
          {avalancheStatus === "error" && (
            <p className="avalanche-controls__hint avalanche-controls__hint--error">Unavailable: {avalancheError}</p>
          )}
          {avalancheStatus === "ready" && (
            <div className="avalanche-controls__status-row">
              <span className="avalanche-controls__count">{avalancheRegionCount} regions</span>
              <span className="avalanche-controls__timestamp">Updated {relativeTime(avalancheFetchedAt)}</span>
              <button className="glass-btn" onClick={onRefreshAvalanche}>
                Refresh
              </button>
            </div>
          )}
          <div className="avalanche-controls__legend">
            {LEGEND.map((l) => (
              <span key={l.label} className="avalanche-controls__legend-item">
                <span className="avalanche-controls__legend-swatch" style={{ background: l.color }} />
                {l.label}
              </span>
            ))}
            <span className="avalanche-controls__legend-item">
              <span className="avalanche-controls__legend-swatch avalanche-controls__legend-swatch--none" />
              No rating
            </span>
          </div>
          <p className="avalanche-controls__coverage">{avalancheProvider.coverageDescription}</p>
          <p className="avalanche-controls__disclaimer">
            Not a substitute for official forecasts. Always check official local avalanche services before travelling in avalanche
            terrain.
          </p>
        </>
      )}
    </div>
  );
}
