import { useState } from "react";
import MapModeSwitcher, { type MapModeSwitcherProps } from "./MapModeSwitcher";
import TerrainControls, { type TerrainControlsProps } from "./TerrainControls";
import OutdoorControls, { type OutdoorControlsProps } from "./OutdoorControls";
import SkiControls, { type SkiControlsProps } from "./SkiControls";
import { useExitTransition } from "../theme/useExitTransition";
import "./LayersSheet.css";

const CLOSE_ANIMATION_MS = 220;

type LayersSheetProps = MapModeSwitcherProps & TerrainControlsProps & OutdoorControlsProps & SkiControlsProps;

/** Mobile equivalent of the desktop right-hand stack of glass panels —
 * everything's the same components/state/handlers, just gathered into one
 * bottom sheet behind a single FAB instead of four permanently-visible
 * floating boxes, which is what actually made the phone screenshot
 * unusable (the panel stack covered two-thirds of the display). */
export default function LayersSheet(props: LayersSheetProps) {
  const [open, setOpen] = useState(false);
  const { rendered, closing } = useExitTransition(open, CLOSE_ANIMATION_MS);

  return (
    <>
      <button className="layers-fab" onClick={() => setOpen((o) => !o)} title="Map layers" aria-label="Map layers" aria-expanded={open}>
        <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true">
          <path
            d="M12 2 2 7l10 5 10-5-10-5Z M2 12l10 5 10-5 M2 17l10 5 10-5"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinejoin="round"
            strokeLinecap="round"
          />
        </svg>
      </button>
      {rendered && (
        <>
          <div className={closing ? "sheet-backdrop sheet-backdrop--closing" : "sheet-backdrop"} onClick={() => setOpen(false)} />
          <div className={closing ? "layers-sheet layers-sheet--closing" : "layers-sheet"}>
            <div className="layers-sheet__handle" />
            <div className="layers-sheet__scroll">
              <MapModeSwitcher mode={props.mode} onChange={props.onChange} hasEsri={props.hasEsri} />
              <TerrainControls
                terrainEnabled={props.terrainEnabled}
                onTerrainEnabledChange={props.onTerrainEnabledChange}
                exaggeration={props.exaggeration}
                onExaggerationChange={props.onExaggerationChange}
                contoursEnabled={props.contoursEnabled}
                onContoursEnabledChange={props.onContoursEnabledChange}
              />
              <OutdoorControls
                hikingTrailsEnabled={props.hikingTrailsEnabled}
                onHikingTrailsEnabledChange={props.onHikingTrailsEnabledChange}
                longDistanceTrailsEnabled={props.longDistanceTrailsEnabled}
                onLongDistanceTrailsEnabledChange={props.onLongDistanceTrailsEnabledChange}
                trailNamesEnabled={props.trailNamesEnabled}
                onTrailNamesEnabledChange={props.onTrailNamesEnabledChange}
              />
              <SkiControls
                runsEnabled={props.runsEnabled}
                onRunsEnabledChange={props.onRunsEnabledChange}
                difficultyColoursEnabled={props.difficultyColoursEnabled}
                onDifficultyColoursEnabledChange={props.onDifficultyColoursEnabledChange}
                liftsEnabled={props.liftsEnabled}
                onLiftsEnabledChange={props.onLiftsEnabledChange}
                runNamesEnabled={props.runNamesEnabled}
                onRunNamesEnabledChange={props.onRunNamesEnabledChange}
                liftNamesEnabled={props.liftNamesEnabled}
                onLiftNamesEnabledChange={props.onLiftNamesEnabledChange}
              />
            </div>
          </div>
        </>
      )}
    </>
  );
}
