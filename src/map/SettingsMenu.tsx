import { useEffect, useRef, useState, type ReactElement } from "react";
import { useTheme, type Theme } from "../theme/ThemeContext";
import type { GeolocationStatus } from "../geo/useGeolocation";
import { useUnits } from "../units/UnitsContext";
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
}

export default function SettingsMenu({ onOpenOfflineManager, locationStatus, onStopSharingLocation }: SettingsMenuProps = {}) {
  const [open, setOpen] = useState(false);
  const { theme, setTheme } = useTheme();
  const { system, toggle } = useUnits();
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
