import type { MapStyleMode } from "../providers/types";
import "./MapModeSwitcher.css";

interface ModeOption {
  mode: MapStyleMode;
  label: string;
  /** Why this mode isn't selectable yet; undefined means available now. */
  disabledReason?: string;
}

const ESRI_DISABLED_REASON = "Needs a free Esri API key — not configured yet";

const MODES: ModeOption[] = [
  { mode: "standard", label: "Standard" },
  { mode: "satellite", label: "Satellite", disabledReason: ESRI_DISABLED_REASON },
  { mode: "terrain", label: "Terrain" },
];

export interface MapModeSwitcherProps {
  mode: MapStyleMode;
  onChange: (mode: MapStyleMode) => void;
  hasEsri: boolean;
}

export default function MapModeSwitcher({ mode, onChange, hasEsri }: MapModeSwitcherProps) {
  return (
    <div className="mode-switcher" role="group" aria-label="Map mode">
      {MODES.map((opt) => {
        const disabled = Boolean(opt.disabledReason) && !(hasEsri && opt.disabledReason === ESRI_DISABLED_REASON);
        return (
          <button
            key={opt.mode}
            className={mode === opt.mode ? "mode-switcher__btn mode-switcher__btn--active" : "mode-switcher__btn"}
            disabled={disabled}
            title={disabled ? opt.disabledReason : opt.label}
            aria-pressed={mode === opt.mode}
            onClick={() => !disabled && onChange(opt.mode)}
          >
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}
