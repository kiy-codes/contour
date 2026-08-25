import { useEffect, useRef, useState, type ReactElement } from "react";
import { useTheme, type Theme } from "../theme/ThemeContext";
import { clampRenderSettings, type RenderSettings } from "../render/renderSettings";
import type { GeolocationStatus } from "../geo/useGeolocation";
import { useUnits } from "../units/UnitsContext";
import { useCoordinateFormat } from "../geo/CoordinateFormatContext";
import { useExitTransition } from "../theme/useExitTransition";
import CacheControls from "./CacheControls";
import "./TerrainControls.css";
import "./SettingsMenu.css";

const CLOSE_ANIMATION_MS = 200;

function SunIcon() {
  return (
    <svg viewBox="0 0 24 24" width="15" height="15" aria-hidden="true">
      <circle cx="12" cy="12" r="4" fill="none" stroke="currentColor" strokeWidth="2" />
      <path
        d="M12 2v2.5M12 19.5V22M4.22 4.22l1.77 1.77M18 18l1.78 1.78M2 12h2.5M19.5 12H22M4.22 19.78 6 18M18 6l1.78-1.78"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
      />
    </svg>
  );
}

function MoonIcon() {
  return (
    <svg viewBox="0 0 24 24" width="15" height="15" aria-hidden="true">
      <path d="M20 14.3A8.5 8.5 0 1 1 9.7 4a7 7 0 0 0 10.3 10.3Z" fill="none" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" />
    </svg>
  );
}

function DropletIcon() {
  return (
    <svg viewBox="0 0 24 24" width="15" height="15" aria-hidden="true">
      <path
        d="M12 3.2s6.8 7.3 6.8 11.8a6.8 6.8 0 1 1-13.6 0c0-4.5 6.8-11.8 6.8-11.8Z"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinejoin="round"
      />
    </svg>
  );
}

const THEME_OPTIONS: { value: Theme; label: string; icon: () => ReactElement }[] = [
  { value: "dark", label: "Dark", icon: MoonIcon },
  { value: "light", label: "Light", icon: SunIcon },
  { value: "glass", label: "Liquid Glass", icon: DropletIcon },
];

export interface SettingsMenuProps {
  /** Desktop-only entry point into the offline-regions manager — omitted
   * on mobile, which leaves that surface untouched. */
  onOpenOfflineManager?: () => void;
  /** Desktop-only GPS status — when sharing is active, this shows a "Stop
   * sharing" action (see LocationControl, which is now just the trigger
   * icon; turning it back off lives here instead). Omitted on mobile. */
  locationStatus?: GeolocationStatus;
  onStopSharingLocation?: () => void;
  /** Mobile-only for now — makes tile resolution fall off faster toward the
   * horizon (see MapCanvas's performanceMode handling) to cut down the tile
   * churn behind the lag/obvious-reloading confirmed live in 3D on a real
   * device. Omitted on desktop, which isn't affected the same way. */
  performanceMode?: boolean;
  onPerformanceModeChange?: (enabled: boolean) => void;
  /** Rendering knobs — see src/render/renderSettings.ts. */
  renderSettings?: RenderSettings;
  onRenderSettingsChange?: (settings: RenderSettings) => void;
}

/** A labelled numeric field that only commits a valid, in-range value.
 * Kept as local state while typing so a half-typed "1." or a briefly-empty
 * box doesn't get clamped out from under the cursor. */
function NumberSetting({
  label,
  hint,
  value,
  step,
  onCommit,
}: {
  label: string;
  hint: string;
  value: number;
  step: number;
  onCommit: (value: number) => void;
}) {
  const [draft, setDraft] = useState(String(value));
  useEffect(() => setDraft(String(value)), [value]);
  const commit = () => {
    const parsed = Number(draft);
    if (Number.isFinite(parsed)) onCommit(parsed);
    else setDraft(String(value));
  };
  return (
    <label className="terrain-controls__row" style={{ justifyContent: "space-between" }} title={hint}>
      <span>{label}</span>
      <input
        type="number"
        inputMode="decimal"
        step={step}
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === "Enter") e.currentTarget.blur();
        }}
        style={{ width: "4.5rem" }}
      />
    </label>
  );
}

export default function SettingsMenu({
  onOpenOfflineManager,
  locationStatus,
  onStopSharingLocation,
  performanceMode,
  onPerformanceModeChange,
  renderSettings,
  onRenderSettingsChange,
}: SettingsMenuProps = {}) {
  const [open, setOpen] = useState(false);
  const { theme, setTheme } = useTheme();
  const { system, toggle } = useUnits();
  const { format: coordFormat, toggle: toggleCoordFormat } = useCoordinateFormat();
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
    <div className="settings-menu" ref={rootRef}>
      <button
        className={open ? "settings-menu__trigger settings-menu__trigger--open" : "settings-menu__trigger"}
        onClick={() => setOpen((o) => !o)}
        title="Settings"
        aria-label="Settings"
        aria-expanded={open}
      >
        ⚙
      </button>
      {rendered && (
        <div className={closing ? "terrain-controls settings-menu__panel settings-menu__panel--closing" : "terrain-controls settings-menu__panel"}>
          <span className="settings-menu__section-label">Appearance</span>
          <div className="settings-menu__theme-row" role="group" aria-label="Theme">
            {THEME_OPTIONS.map((opt) => {
              const Icon = opt.icon;
              return (
                <button
                  key={opt.value}
                  className={
                    theme === opt.value ? "settings-menu__theme-btn settings-menu__theme-btn--active" : "settings-menu__theme-btn"
                  }
                  onClick={() => setTheme(opt.value)}
                  title={opt.label}
                  aria-label={opt.label}
                  aria-pressed={theme === opt.value}
                >
                  <Icon />
                </button>
              );
            })}
          </div>
          <div className="settings-menu__divider" />
          <div className="terrain-controls__row" style={{ justifyContent: "space-between" }}>
            <span>Units</span>
            <button className="settings-menu__units-btn" onClick={toggle} title="Toggle units">
              {system === "metric" ? "km / m" : "mi / ft"}
            </button>
          </div>
          <div className="terrain-controls__row" style={{ justifyContent: "space-between" }}>
            <span>Coordinates</span>
            <button className="settings-menu__units-btn" onClick={toggleCoordFormat} title="Toggle coordinate format">
              {coordFormat === "dd" ? "Decimal" : "DMS"}
            </button>
          </div>
          {locationStatus === "active" && onStopSharingLocation && (
            <>
              <div className="settings-menu__divider" />
              <div className="terrain-controls__row" style={{ justifyContent: "space-between" }}>
                <span>Location sharing</span>
                <button className="settings-menu__units-btn" onClick={onStopSharingLocation}>
                  Stop
                </button>
              </div>
            </>
          )}
          {onPerformanceModeChange && (
            <>
              <div className="settings-menu__divider" />
              <span className="settings-menu__section-label">Performance</span>
              <label className="terrain-controls__row">
                <input
                  type="checkbox"
                  checked={performanceMode ?? false}
                  onChange={(e) => onPerformanceModeChange(e.target.checked)}
                />
                Reduce 3D terrain quality for smoother performance
              </label>
            </>
          )}
          {renderSettings && onRenderSettingsChange && (
            <>
              <div className="settings-menu__divider" />
              <span className="settings-menu__section-label">Rendering</span>
              <NumberSetting
                label="Resolution"
                hint="Canvas pixel ratio. Lower is much faster (cost scales with the square) and slightly softer. 2 is a good default even on a 2.8x display."
                value={renderSettings.pixelRatio}
                step={0.25}
                onCommit={(pixelRatio) => onRenderSettingsChange(clampRenderSettings({ ...renderSettings, pixelRatio }))}
              />
              <NumberSetting
                label="Distance falloff"
                hint="How fast detail drops off toward the horizon. Higher = coarser distant tiles = faster."
                value={renderSettings.maxZoomLevelsOnScreen}
                step={1}
                onCommit={(maxZoomLevelsOnScreen) =>
                  onRenderSettingsChange(clampRenderSettings({ ...renderSettings, maxZoomLevelsOnScreen }))
                }
              />
              <NumberSetting
                label="Tilt tile budget"
                hint="How many more tiles a tilted view may use than a top-down one. Higher = the ground near you stays sharp when you tilt down."
                value={renderSettings.tileCountMaxMinRatio}
                step={1}
                onCommit={(tileCountMaxMinRatio) =>
                  onRenderSettingsChange(clampRenderSettings({ ...renderSettings, tileCountMaxMinRatio }))
                }
              />
              <NumberSetting
                label="Terrain distance falloff"
                hint="Same as Distance falloff, but for 3D terrain geometry specifically. Higher = distant mountains use far less geometry = faster."
                value={renderSettings.terrainMaxZoomLevelsOnScreen}
                step={1}
                onCommit={(terrainMaxZoomLevelsOnScreen) =>
                  onRenderSettingsChange(clampRenderSettings({ ...renderSettings, terrainMaxZoomLevelsOnScreen }))
                }
              />
              <NumberSetting
                label="Terrain tilt budget"
                hint="Same as Tilt tile budget, but for 3D terrain geometry specifically. Lower = a harder cap on total terrain geometry when tilted."
                value={renderSettings.terrainTileCountMaxMinRatio}
                step={1}
                onCommit={(terrainTileCountMaxMinRatio) =>
                  onRenderSettingsChange(clampRenderSettings({ ...renderSettings, terrainTileCountMaxMinRatio }))
                }
              />
            </>
          )}
          <div className="settings-menu__divider" />
          <span className="settings-menu__section-label">Storage</span>
          <CacheControls />
          {onOpenOfflineManager && (
            <>
              <div className="settings-menu__divider" />
              <div className="terrain-controls__row" style={{ justifyContent: "space-between" }}>
                <span>Offline maps</span>
                <button className="settings-menu__units-btn" onClick={onOpenOfflineManager}>
                  Manage
                </button>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}
