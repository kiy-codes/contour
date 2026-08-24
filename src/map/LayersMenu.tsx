import { useEffect, useRef, useState } from "react";
import MapModeSwitcher, { type MapModeSwitcherProps } from "./MapModeSwitcher";
import TerrainControls, { type TerrainControlsProps } from "./TerrainControls";
import OutdoorControls, { type OutdoorControlsProps } from "./OutdoorControls";
import SkiControls, { type SkiControlsProps } from "./SkiControls";
import { useExitTransition } from "../theme/useExitTransition";
import "./TerrainControls.css";
import "./SettingsMenu.css";
import "./LayersMenu.css";

const CLOSE_ANIMATION_MS = 200;

type LayersMenuProps = MapModeSwitcherProps & TerrainControlsProps & OutdoorControlsProps & SkiControlsProps;

/** Desktop equivalent of the mobile LayersSheet — same four panels
 * (map mode, terrain, outdoor, ski), same props, just collapsed behind one
 * "Layers" trigger instead of always taking up the whole right-hand column.
 * That's the point: with everything always expanded, the column could run
 * taller than a modest window (worse once offline-region tools were added
 * below it), and only ever showing what's actually relevant to the current
 * moment matches how Settings already behaves. */
export default function LayersMenu(props: LayersMenuProps) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const { rendered, closing } = useExitTransition(open, CLOSE_ANIMATION_MS);

  useEffect(() => {
    if (!open) return;
    const handleOutside = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", handleOutside);
    return () => document.removeEventListener("mousedown", handleOutside);
  }, [open]);

  return (
    <div className="layers-menu" ref={rootRef}>
      <button
        className={open ? "layers-menu__trigger layers-menu__trigger--open" : "layers-menu__trigger"}
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
      >
        <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true">
          <path
            d="M12 2 2 7l10 5 10-5-10-5Z M2 12l10 5 10-5 M2 17l10 5 10-5"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinejoin="round"
            strokeLinecap="round"
          />
        </svg>
        Layers
      </button>
      {rendered && (
        <div className={closing ? "terrain-controls layers-menu__panel layers-menu__panel--closing" : "terrain-controls layers-menu__panel"}>
          <MapModeSwitcher mode={props.mode} onChange={props.onChange} hasEsri={props.hasEsri} />
          <div className="settings-menu__divider" />
          <TerrainControls
            terrainEnabled={props.terrainEnabled}
            onTerrainEnabledChange={props.onTerrainEnabledChange}
            exaggeration={props.exaggeration}
            onExaggerationChange={props.onExaggerationChange}
            contoursEnabled={props.contoursEnabled}
            onContoursEnabledChange={props.onContoursEnabledChange}
          />
          <div className="settings-menu__divider" />
          <OutdoorControls
            hikingTrailsEnabled={props.hikingTrailsEnabled}
            onHikingTrailsEnabledChange={props.onHikingTrailsEnabledChange}
            longDistanceTrailsEnabled={props.longDistanceTrailsEnabled}
            onLongDistanceTrailsEnabledChange={props.onLongDistanceTrailsEnabledChange}
            trailNamesEnabled={props.trailNamesEnabled}
            onTrailNamesEnabledChange={props.onTrailNamesEnabledChange}
          />
          <div className="settings-menu__divider" />
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
      )}
    </div>
  );
}
