import type { RouteResult, WaytypeSegment } from "../providers/RoutingProvider";
import type { ProfilePoint, SteepSection } from "../routing/elevationProfile";
import type { LngLat } from "../providers/types";
import { estimateDifficulty, DIFFICULTY_LABEL } from "../routing/routeDifficulty";
import { formatCoordinate } from "../geo/coordinateFormat";
import { useCoordinateFormat } from "../geo/CoordinateFormatContext";
import { useUnits } from "../units/UnitsContext";
import ElevationProfileChart from "./ElevationProfileChart";
import "./RouteStatsPanel.css";

export interface RouteStatsPanelProps {
  result: RouteResult | null;
  error: string | null;
  waypointCount: number;
  waypoints: LngLat[];
  profile: ProfilePoint[];
  ascentMeters?: number;
  descentMeters?: number;
  maxSlopePercent?: number;
  avgSlopePercent?: number;
  minElevationMeters?: number;
  maxElevationMeters?: number;
  steepSections: SteepSection[];
  durationSeconds?: number;
  isDurationEstimated: boolean;
  onProfileHover: (point: ProfilePoint | null) => void;
  onReturnToRoute: () => void;
  /** Reordering only makes sense for a live, editable waypoint list — omit
   * both to render the waypoint summary read-only (e.g. for an imported/
   * generated route, which isn't waypoint-editable). */
  isEditing?: boolean;
  onReorderWaypoint?: (from: number, to: number) => void;
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
  waypoints,
  profile,
  ascentMeters,
  descentMeters,
  maxSlopePercent,
  avgSlopePercent,
  minElevationMeters,
  maxElevationMeters,
  steepSections,
  durationSeconds,
  isDurationEstimated,
  onProfileHover,
  onReturnToRoute,
  isEditing = false,
  onReorderWaypoint,
}: RouteStatsPanelProps) {
  const { formatDistance, formatElevation, formatSlope } = useUnits();
  const { format: coordFormat } = useCoordinateFormat();

  if (error) {
    return <div className="route-stats-panel route-stats-panel--error">Route could not be calculated: {error}</div>;
  }
  if (!result) return null;

  const categorySummary = result.waytypeBreakdown ? summarizeByCategory(result.waytypeBreakdown) : null;
  const difficulty =
    ascentMeters !== undefined && maxSlopePercent !== undefined
      ? estimateDifficulty(result.distanceMeters, ascentMeters, maxSlopePercent)
      : null;

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
        {minElevationMeters !== undefined && maxElevationMeters !== undefined && (
          <div className="route-stats-panel__stat">
            <span className="route-stats-panel__value">
              {formatElevation(minElevationMeters)}–{formatElevation(maxElevationMeters)}
            </span>
            <span className="route-stats-panel__label">Elevation range</span>
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

      {(difficulty || steepSections.length > 0 || waypoints.length > 0) && (
        <details className="route-stats-panel__analysis">
          <summary>Route analysis</summary>
          {difficulty && (
            <p className="route-stats-panel__analysis-line">
              <strong>Estimated difficulty: {DIFFICULTY_LABEL[difficulty.level]}</strong> — {difficulty.reason} (rough estimate, not an
              official trail rating or safety assessment)
            </p>
          )}
          {steepSections.length > 0 && (
            <div className="route-stats-panel__analysis-line">
              <strong>Steep sections</strong> ({steepSections.length >= 6 ? "steepest shown" : "≥15% grade"}):
              <ul className="route-stats-panel__steep-list">
                {steepSections.map((s, i) => (
                  <li key={i}>
                    {formatDistance(s.startDistanceMeters)}–{formatDistance(s.endDistanceMeters)} — avg {formatSlope(s.avgSlopePercent)}
                  </li>
                ))}
              </ul>
            </div>
          )}
          {waypoints.length > 0 && (
            <div className="route-stats-panel__analysis-line">
              <strong>Waypoints</strong> ({waypoints.length}):
              <ol className="route-stats-panel__waypoint-list">
                {waypoints.map((w, i) => (
                  <li key={i} className="route-stats-panel__waypoint-row">
                    <span>
                      {i === 0 ? "Start" : i === waypoints.length - 1 ? "Finish" : `Waypoint ${i + 1}`} — {formatCoordinate(w, coordFormat)}
                    </span>
                    {isEditing && onReorderWaypoint && waypoints.length > 1 && (
                      <span className="route-stats-panel__waypoint-actions">
                        <button
                          className="route-stats-panel__waypoint-btn"
                          disabled={i === 0}
                          onClick={() => onReorderWaypoint(i, i - 1)}
                          title="Move earlier"
                          aria-label="Move waypoint earlier"
                        >
                          ▲
                        </button>
                        <button
                          className="route-stats-panel__waypoint-btn"
                          disabled={i === waypoints.length - 1}
                          onClick={() => onReorderWaypoint(i, i + 1)}
                          title="Move later"
                          aria-label="Move waypoint later"
                        >
                          ▼
                        </button>
                      </span>
                    )}
                  </li>
                ))}
              </ol>
            </div>
          )}
        </details>
      )}
    </div>
  );
}
