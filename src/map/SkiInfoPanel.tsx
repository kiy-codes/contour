import type { SkiLift, SkiRun } from "../providers/SkiDataProvider";
import "./PlaceInfoPanel.css";

export type SkiInfoTarget = { kind: "run"; run: SkiRun } | { kind: "lift"; lift: SkiLift };

export interface SkiInfoPanelProps {
  target: SkiInfoTarget;
  onClose: () => void;
}

const DIFFICULTY_LABEL: Record<SkiRun["difficulty"], string> = {
  novice: "Novice",
  easy: "Easy",
  intermediate: "Intermediate",
  advanced: "Advanced",
  expert: "Expert",
  freeride: "Freeride",
  extreme: "Extreme",
  other: "Other",
  unknown: "Unknown",
};

const LIFT_TYPE_LABEL: Record<SkiLift["liftType"], string> = {
  gondola: "Gondola",
  chairlift: "Chairlift",
  drag: "Drag/T-bar lift",
  "cable-car": "Cable car",
  "magic-carpet": "Magic carpet",
  other: "Lift",
};

function elevationText(v: number | null | undefined): string {
  if (v === undefined) return "…";
  if (v === null) return "Not available";
  return `${Math.round(v)} m`;
}

export default function SkiInfoPanel({ target, onClose }: SkiInfoPanelProps) {
  const isRun = target.kind === "run";
  const run = isRun ? target.run : undefined;
  const lift = !isRun ? target.lift : undefined;

  return (
    <div className="place-info-panel">
      <button className="place-info-panel__close" onClick={onClose} aria-label="Close ski information">
        ×
      </button>
      <div className="place-info-panel__type">{isRun ? "Ski run" : LIFT_TYPE_LABEL[lift!.liftType]}</div>
      <h2 className="place-info-panel__name">
        {isRun ? run!.name ?? "Unnamed run" : lift!.nameAndType ?? "Unnamed lift"}
      </h2>

      <dl className="place-info-panel__facts">
        {isRun && (
          <>
            <dt>Difficulty</dt>
            <dd>{DIFFICULTY_LABEL[run!.difficulty]}</dd>
            <dt>Length</dt>
            <dd>{run!.lengthMeters !== undefined ? `${(run!.lengthMeters / 1000).toFixed(2)} km` : "…"}</dd>
          </>
        )}
        {!isRun && lift!.status && (
          <>
            <dt>Status</dt>
            <dd style={{ textTransform: "capitalize" }}>{lift!.status}</dd>
          </>
        )}
        <dt>Start elevation</dt>
        <dd>{elevationText(isRun ? run!.startElevation : lift!.startElevation)}</dd>
        <dt>End elevation</dt>
        <dd>{elevationText(isRun ? run!.endElevation : lift!.endElevation)}</dd>
      </dl>
    </div>
  );
}
