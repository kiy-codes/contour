import "./TerrainControls.css";

export interface SkiControlsProps {
  runsEnabled: boolean;
  onRunsEnabledChange: (enabled: boolean) => void;
  difficultyColoursEnabled: boolean;
  onDifficultyColoursEnabledChange: (enabled: boolean) => void;
  liftsEnabled: boolean;
  onLiftsEnabledChange: (enabled: boolean) => void;
  runNamesEnabled: boolean;
  onRunNamesEnabledChange: (enabled: boolean) => void;
  liftNamesEnabled: boolean;
  onLiftNamesEnabledChange: (enabled: boolean) => void;
}

export default function SkiControls({
  runsEnabled,
  onRunsEnabledChange,
  difficultyColoursEnabled,
  onDifficultyColoursEnabledChange,
  liftsEnabled,
  onLiftsEnabledChange,
  runNamesEnabled,
  onRunNamesEnabledChange,
  liftNamesEnabled,
  onLiftNamesEnabledChange,
}: SkiControlsProps) {
  return (
    <div className="terrain-controls">
      <label className="terrain-controls__row">
        <input type="checkbox" checked={runsEnabled} onChange={(e) => onRunsEnabledChange(e.target.checked)} />
        Ski runs
      </label>
      <label className="terrain-controls__row">
        <input
          type="checkbox"
          checked={difficultyColoursEnabled}
          disabled={!runsEnabled}
          onChange={(e) => onDifficultyColoursEnabledChange(e.target.checked)}
        />
        Difficulty colours
      </label>
      <label className="terrain-controls__row">
        <input type="checkbox" checked={liftsEnabled} onChange={(e) => onLiftsEnabledChange(e.target.checked)} />
        Ski lifts
      </label>
      <label className="terrain-controls__row">
        <input
          type="checkbox"
          checked={runNamesEnabled}
          disabled={!runsEnabled}
          onChange={(e) => onRunNamesEnabledChange(e.target.checked)}
        />
        Run names
      </label>
      <label className="terrain-controls__row">
        <input
          type="checkbox"
          checked={liftNamesEnabled}
          disabled={!liftsEnabled}
          onChange={(e) => onLiftNamesEnabledChange(e.target.checked)}
        />
        Lift names
      </label>
    </div>
  );
}
