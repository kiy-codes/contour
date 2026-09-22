import type { RouteProgress } from "../geo/routeProgress";
import { useUnits } from "../units/UnitsContext";
import "./RouteStatsPanel.css";
import "./NavigationPanel.css";

export interface NavigationPanelProps {
  progress: RouteProgress | null;
  etaSeconds: number | null;
  /** From the live GPS fix — m/s, null when the platform can't determine it
   * (see useGeolocation's GeolocationFix.speed docs). */
  speedMetersPerSecond: number | null;
  onStop: () => void;
}

function formatDuration(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.round((seconds % 3600) / 60);
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
}

export default function NavigationPanel({ progress, etaSeconds, speedMetersPerSecond, onStop }: NavigationPanelProps) {
  const { formatDistance, formatElevation, system } = useUnits();

  if (!progress) {
    return (
      <div className="route-stats-panel navigation-panel">
        <p className="navigation-panel__waiting">Waiting for a GPS fix…</p>
        <button className="navigation-panel__stop" onClick={onStop}>
          Stop navigating
        </button>
      </div>
    );
  }

  const paceLabel =
    speedMetersPerSecond !== null && speedMetersPerSecond > 0.1
      ? system === "imperial"
        ? `${(speedMetersPerSecond * 2.2369).toFixed(1)} mph`
        : `${(speedMetersPerSecond * 3.6).toFixed(1)} km/h`
      : "—";

  return (
    <div className="route-stats-panel navigation-panel">
      {progress.isOffRoute && (
        <div className="navigation-panel__off-route">Off route — {formatDistance(progress.offRouteDistanceMeters)} from the trail</div>
      )}

      <div className="route-stats-panel__row">
        <div className="route-stats-panel__stat">
          <span className="route-stats-panel__value">{formatDistance(progress.distanceRemainingMeters)}</span>
          <span className="route-stats-panel__label">Remaining</span>
        </div>
        {progress.ascentRemainingMeters > 0 && (
          <div className="route-stats-panel__stat">
            <span className="route-stats-panel__value">↑ {formatElevation(progress.ascentRemainingMeters)}</span>
            <span className="route-stats-panel__label">Ascent left</span>
          </div>
        )}
        {progress.descentRemainingMeters > 0 && (
          <div className="route-stats-panel__stat">
            <span className="route-stats-panel__value">↓ {formatElevation(progress.descentRemainingMeters)}</span>
            <span className="route-stats-panel__label">Descent left</span>
          </div>
        )}
        {etaSeconds !== null && (
          <div className="route-stats-panel__stat">
            <span className="route-stats-panel__value">{formatDuration(etaSeconds)}</span>
            <span className="route-stats-panel__label">ETA</span>
          </div>
        )}
        <div className="route-stats-panel__stat">
          <span className="route-stats-panel__value">{paceLabel}</span>
          <span className="route-stats-panel__label">Speed</span>
        </div>
      </div>

      <button className="navigation-panel__stop" onClick={onStop}>
        Stop navigating
      </button>
    </div>
  );
}
