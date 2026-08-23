import type { RouteResult, WaytypeSegment } from "../providers/RoutingProvider";
import type { ProfilePoint } from "../routing/elevationProfile";
import { useUnits } from "../units/UnitsContext";
import ElevationProfileChart from "./ElevationProfileChart";
import "./RouteStatsPanel.css";

export interface RouteStatsPanelProps {
  result: RouteResult | null;
  error: string | null;
  waypointCount: number;
  profile: ProfilePoint[];
  ascentMeters?: number;
  descentMeters?: number;
  maxSlopePercent?: number;
  avgSlopePercent?: number;
  durationSeconds?: number;
  isDurationEstimated: boolean;
  onProfileHover: (point: ProfilePoint | null) => void;
  onReturnToRoute: () => void;
}

const CATEGORY_COLOR: Record<WaytypeSegment["category"], string> = {
  trail: "#22c55e",
  road: "#f59e0b",
  other: "#94a3b8",
};
const CATEGORY_LABEL: Record<WaytypeSegment["category"], string> = {
  trail: "Trail",
  road: "Road",
  other: "Other",
};

function formatDuration(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.round((seconds % 3600) / 60);
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
}

function summarizeByCategory(breakdown: WaytypeSegment[]) {
  const byCategory = new Map<WaytypeSegment["category"], number>();
  for (const seg of breakdown) {
    byCategory.set(seg.category, (byCategory.get(seg.category) ?? 0) + seg.percentage);
  }
  return [...byCategory.entries()].sort((a, b) => b[1] - a[1]);
}

export default function RouteStatsPanel({
  result,
  error,
  waypointCount,
  profile,
  ascentMeters,
  descentMeters,
  maxSlopePercent,
  avgSlopePercent,
  durationSeconds,
  isDurationEstimated,
  onProfileHover,
  onReturnToRoute,
}: RouteStatsPanelProps) {
  const { formatDistance, formatElevation, formatSlope } = useUnits();

  if (error) {
    return <div className="route-stats-panel route-stats-panel--error">Route could not be calculated: {error}</div>;
  }
  if (!result) return null;

  const categorySummary = result.waytypeBreakdown ? summarizeByCategory(result.waytypeBreakdown) : null;

  return (
    <div className="route-stats-panel">
      <button
        className="route-stats-panel__recenter"
        onClick={onReturnToRoute}
        title="Return to route"
        aria-label="Return to route"
      >
        ⌖
      </button>
      <div className="route-stats-panel__row">
        <div className="route-stats-panel__stat">
          <span className="route-stats-panel__value">{formatDistance(result.distanceMeters)}</span>
          <span className="route-stats-panel__label">Distance</span>
        </div>
        {ascentMeters !== undefined && (
          <div className="route-stats-panel__stat">
            <span className="route-stats-panel__value">↑ {formatElevation(ascentMeters)}</span>
            <span className="route-stats-panel__label">Ascent</span>
          </div>
        )}
        {descentMeters !== undefined && (
          <div className="route-stats-panel__stat">
            <span className="route-stats-panel__value">↓ {formatElevation(descentMeters)}</span>
            <span className="route-stats-panel__label">Descent</span>
          </div>
        )}
        {maxSlopePercent !== undefined && (
          <div className="route-stats-panel__stat">
            <span className="route-stats-panel__value">{formatSlope(maxSlopePercent)}</span>
            <span className="route-stats-panel__label">Max slope</span>
          </div>
        )}
        {avgSlopePercent !== undefined && (
          <div className="route-stats-panel__stat">
            <span className="route-stats-panel__value">{formatSlope(avgSlopePercent)}</span>
            <span className="route-stats-panel__label">Avg slope</span>
          </div>
        )}
        {durationSeconds !== undefined && (
          <div className="route-stats-panel__stat">
            <span className="route-stats-panel__value">
              {isDurationEstimated ? "~" : ""}
              {formatDuration(durationSeconds)}
            </span>
            <span className="route-stats-panel__label">{isDurationEstimated ? "Est. time" : "Time"}</span>
          </div>
        )}
        <div className="route-stats-panel__stat">
          <span className="route-stats-panel__value">{waypointCount}</span>
          <span className="route-stats-panel__label">Waypoints</span>
        </div>
      </div>

      {profile.length > 1 && <ElevationProfileChart profile={profile} onHover={onProfileHover} />}

      {categorySummary && (
        <div className="route-stats-panel__breakdown">
          <div className="route-stats-panel__breakdown-bar">
            {categorySummary.map(([category, pct]) => (
              <div
                key={category}
                style={{ width: `${pct}%`, background: CATEGORY_COLOR[category] }}
                title={`${CATEGORY_LABEL[category]}: ${pct.toFixed(1)}%`}
              />
            ))}
          </div>
          <div className="route-stats-panel__legend">
            {categorySummary.map(([category, pct]) => (
              <span key={category} className="route-stats-panel__legend-item">
                <span className="route-stats-panel__legend-swatch" style={{ background: CATEGORY_COLOR[category] }} />
                {CATEGORY_LABEL[category]} {pct.toFixed(0)}%
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
