import { useEffect, useRef, useState } from "react";
import { useTheme, type Theme } from "../theme/ThemeContext";
import { useUnits } from "../units/UnitsContext";
import { useExitTransition } from "../theme/useExitTransition";
import "./TerrainControls.css";
import "./SettingsMenu.css";

const CLOSE_ANIMATION_MS = 200;

const THEME_OPTIONS: { value: Theme; label: string }[] = [
  { value: "dark", label: "Dark" },
  { value: "light", label: "Light" },
  { value: "glass", label: "Liquid Glass" },
];

export default function SettingsMenu() {
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
          <div className="settings-menu__theme-row">
            {THEME_OPTIONS.map((opt) => (
              <button
                key={opt.value}
                className={
                  theme === opt.value ? "settings-menu__theme-btn settings-menu__theme-btn--active" : "settings-menu__theme-btn"
                }
                onClick={() => setTheme(opt.value)}
              >
                {opt.label}
              </button>
            ))}
          </div>
          <div className="settings-menu__divider" />
          <div className="terrain-controls__row" style={{ justifyContent: "space-between" }}>
            <span>Units</span>
            <button className="settings-menu__units-btn" onClick={toggle} title="Toggle units">
              {system === "metric" ? "km / m" : "mi / ft"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
