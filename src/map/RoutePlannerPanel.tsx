import { useState } from "react";
import type { LngLat } from "../providers/types";
import type { RouteResult, RouteConstraints } from "../providers/RoutingProvider";
import type { RoutingMode } from "../providers/RoutingProvider";
import { buildOutAndBack } from "../routing/routePlanning";
import { describeNetworkError } from "../net/fetchTimeout";
import { useUnits } from "../units/UnitsContext";
import "./TerrainControls.css";
import "./RoutePlannerPanel.css";

type RouteShape = "loop" | "outAndBack" | "pointToPoint";
type PlannerActivity = Extract<RoutingMode, "walking" | "hiking" | "cycling">;

export interface RoutePlannerPanelProps {
  hasRoundTrip: boolean;
  startPoint: LngLat | null;
  startLabel: string;
  hasGpsFix: boolean;
  onUseGpsStart: () => void;
  onUseMapCenterStart: () => void;
  pickedEndPoint: LngLat | null;
  pickPointActive: boolean;
  onTogglePickPoint: () => void;
  onClearEndPoint: () => void;
  planRoundTrip: (lengthMeters: number, mode: RoutingMode, constraints: RouteConstraints, seed: number) => Promise<RouteResult>;
  planRoute: (waypoints: LngLat[], mode: RoutingMode, constraints: RouteConstraints) => Promise<RouteResult>;
  onGenerated: (result: RouteResult, label: string) => void;
  onClose: () => void;
}

interface Candidate {
  seed: number;
  result: RouteResult;
}

export default function RoutePlannerPanel({
  hasRoundTrip,
  startPoint,
  startLabel,
  hasGpsFix,
  onUseGpsStart,
  onUseMapCenterStart,
  pickedEndPoint,
  pickPointActive,
  onTogglePickPoint,
  onClearEndPoint,
  planRoundTrip,
  planRoute,
  onGenerated,
  onClose,
}: RoutePlannerPanelProps) {
  const { formatDistance, formatElevation } = useUnits();
  const [shape, setShape] = useState<RouteShape>("loop");
  const [activity, setActivity] = useState<PlannerActivity>("hiking");
  const [distanceKm, setDistanceKm] = useState(5);
  const [maxElevationGainM, setMaxElevationGainM] = useState<string>("");
  const [avoidSteps, setAvoidSteps] = useState(false);
  const [avoidFords, setAvoidFords] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [warning, setWarning] = useState<string | null>(null);

  const showTerrainConstraints = activity !== "cycling";
  const needsEndPoint = shape !== "loop";
  const canGenerate = Boolean(startPoint) && (!needsEndPoint || Boolean(pickedEndPoint)) && distanceKm > 0 && !generating;

  const changeShape = (next: RouteShape) => {
    setShape(next);
    setCandidates([]);
    setWarning(null);
    if (next === "loop" && pickedEndPoint) onClearEndPoint();
  };

  const constraints: RouteConstraints = { avoidSteps: showTerrainConstraints && avoidSteps, avoidFords: showTerrainConstraints && avoidFords };

  const checkTargets = (result: RouteResult) => {
    const notes: string[] = [];
    const maxGain = Number(maxElevationGainM);
    if (Number.isFinite(maxGain) && maxGain > 0 && (result.ascentMeters ?? 0) > maxGain) {
      notes.push(`exceeds your max elevation gain (${formatElevation(result.ascentMeters ?? 0)} vs ${formatElevation(maxGain)})`);
    }
    if (shape === "loop") {
      const targetM = distanceKm * 1000;
      const deltaPct = Math.abs(result.distanceMeters - targetM) / targetM;
      if (deltaPct > 0.15) {
        notes.push(
          `distance target isn't exact — you asked for ${formatDistance(targetM)}, this route is ${formatDistance(result.distanceMeters)} (loop routing follows real trails/roads, so it approximates the target rather than matching it precisely)`,
        );
      }
    }
    setWarning(notes.length > 0 ? `Note: this route ${notes.join("; ")}.` : null);
  };

  const handleGenerate = async () => {
    if (!startPoint) return;
    setGenerating(true);
    setError(null);
    try {
      let result: RouteResult;
      if (shape === "loop") {
        const seed = Math.floor(Math.random() * 1_000_000);
        result = await planRoundTrip(distanceKm * 1000, activity, constraints, seed);
        setCandidates((c) => [...c, { seed, result }]);
      } else if (shape === "outAndBack" && pickedEndPoint) {
        const oneWay = await planRoute([startPoint, pickedEndPoint], activity, constraints);
        result = buildOutAndBack(oneWay);
      } else if (pickedEndPoint) {
        result = await planRoute([startPoint, pickedEndPoint], activity, constraints);
      } else {
        return;
      }
      checkTargets(result);
      onGenerated(result, shapeLabel(shape));
    } catch (err) {
      setError(describeNetworkError(err));
    } finally {
      setGenerating(false);
    }
  };

  const handleAnotherVariation = async () => {
    if (!startPoint || shape !== "loop") return;
    setGenerating(true);
    setError(null);
    try {
      const seed = Math.floor(Math.random() * 1_000_000);
      const result = await planRoundTrip(distanceKm * 1000, activity, constraints, seed);
      setCandidates((c) => [...c, { seed, result }]);
    } catch (err) {
      setError(describeNetworkError(err));
    } finally {
      setGenerating(false);
    }
  };

  return (
    <div className="terrain-controls route-planner-panel">
      <div className="route-planner-panel__header">
        <span className="settings-menu__section-label">Plan a route</span>
        <button className="place-info-panel__close" onClick={onClose} aria-label="Close route planner">
          ×
        </button>
      </div>

      {!hasRoundTrip && (
        <p className="route-planner-panel__hint route-planner-panel__hint--error">
          Needs a free OpenRouteService API key — not configured yet. Manual route drawing still works from "Start route".
        </p>
      )}

      {hasRoundTrip && (
        <>
          <div className="route-planner-panel__row-group" role="group" aria-label="Route shape">
            {(["loop", "outAndBack", "pointToPoint"] as RouteShape[]).map((s) => (
              <button
                key={s}
                className={shape === s ? "weather-controls__pill weather-controls__pill--active" : "weather-controls__pill"}
                onClick={() => changeShape(s)}
              >
                {shapeLabel(s)}
              </button>
            ))}
          </div>

          <div className="route-planner-panel__row-group" role="group" aria-label="Activity">
            {(["walking", "hiking", "cycling"] as PlannerActivity[]).map((a) => (
              <button
                key={a}
                className={activity === a ? "weather-controls__pill weather-controls__pill--active" : "weather-controls__pill"}
                onClick={() => setActivity(a)}
              >
                {a[0].toUpperCase() + a.slice(1)}
              </button>
            ))}
          </div>

          <label className="terrain-controls__row">
            <span>Start</span>
            <span className="route-planner-panel__start-label">{startLabel}</span>
          </label>
          <div className="route-planner-panel__row-group">
            <button className="glass-btn" onClick={onUseMapCenterStart}>
              Map center
            </button>
            <button className="glass-btn" onClick={onUseGpsStart} disabled={!hasGpsFix} title={hasGpsFix ? undefined : "Enable My location first"}>
              My location
            </button>
          </div>

          {needsEndPoint && (
            <div className="route-planner-panel__end-point">
              <button className={pickPointActive ? "glass-btn glass-btn--primary" : "glass-btn"} onClick={onTogglePickPoint}>
                {pickPointActive ? "Click the map…" : pickedEndPoint ? "Change end point" : "Pick end point on map"}
              </button>
              {pickedEndPoint && (
                <button className="glass-btn" onClick={onClearEndPoint}>
                  Clear
                </button>
              )}
            </div>
          )}

          {shape === "loop" && (
            <div className="terrain-controls__row terrain-controls__row--slider">
              <span>Target distance</span>
              <input
                type="range"
                min={1}
                max={30}
                step={0.5}
                value={distanceKm}
                onChange={(e) => setDistanceKm(Number(e.target.value))}
              />
              <span className="terrain-controls__value">{distanceKm} km</span>
            </div>
          )}

          <label className="terrain-controls__row">
            <span>Max elevation gain (optional)</span>
            <input
              type="number"
              min={0}
              placeholder="m"
              value={maxElevationGainM}
              onChange={(e) => setMaxElevationGainM(e.target.value)}
              className="route-planner-panel__number"
            />
          </label>

          {showTerrainConstraints && (
            <>
              <label className="terrain-controls__row">
                <input type="checkbox" checked={avoidSteps} onChange={(e) => setAvoidSteps(e.target.checked)} />
                Avoid steps
              </label>
              <label className="terrain-controls__row">
                <input type="checkbox" checked={avoidFords} onChange={(e) => setAvoidFords(e.target.checked)} />
                Avoid fords/river crossings
              </label>
            </>
          )}

          <div className="route-planner-panel__unsupported">
            <label className="terrain-controls__row" title="Not available — the routing provider has no data on viewpoints or scenery">
              <input type="checkbox" disabled />
              Prefer viewpoints
            </label>
            <label className="terrain-controls__row" title="Not available — the routing provider has no data on peaks as a routing target">
              <input type="checkbox" disabled />
              Prefer peaks
            </label>
            <label className="terrain-controls__row" title="Not available — the routing provider does not expose surface type as a preference">
              <input type="checkbox" disabled />
              Surface preference
            </label>
            <p className="route-planner-panel__hint">Greyed-out preferences aren't supported by the current routing provider — shown, not hidden, so it's clear they were considered.</p>
          </div>

          {error && <p className="route-planner-panel__hint route-planner-panel__hint--error">Could not generate route: {error}</p>}
          {warning && <p className="route-planner-panel__hint">{warning}</p>}

          {candidates.length > 0 && (
            <div className="route-planner-panel__candidates">
              <span className="route-planner-panel__candidates-label">Alternatives</span>
              {candidates.map((c, i) => (
                <button key={c.seed} className="glass-btn route-planner-panel__candidate" onClick={() => onGenerated(c.result, shapeLabel(shape))}>
                  #{i + 1}: {formatDistance(c.result.distanceMeters)}
                  {c.result.ascentMeters !== undefined ? ` · ↑${formatElevation(c.result.ascentMeters)}` : ""}
                </button>
              ))}
            </div>
          )}

          <div className="route-planner-panel__row-group">
            <button className="glass-btn glass-btn--primary" onClick={handleGenerate} disabled={!canGenerate}>
              {generating ? "Calculating…" : candidates.length > 0 ? "Generate & use" : "Generate route"}
            </button>
            {shape === "loop" && candidates.length > 0 && (
              <button className="glass-btn" onClick={handleAnotherVariation} disabled={generating}>
                Try another
              </button>
            )}
          </div>
        </>
      )}
    </div>
  );
}

function shapeLabel(shape: RouteShape): string {
  if (shape === "loop") return "Loop";
  if (shape === "outAndBack") return "Out & back";
  return "Point to point";
}
