import type { GeolocationStatus } from "../geo/useGeolocation";
import "./LocationControl.css";

function CrosshairIcon() {
  return (
    <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true">
      <circle cx="12" cy="12" r="6" fill="none" stroke="currentColor" strokeWidth="2" />
      <circle cx="12" cy="12" r="1.6" fill="currentColor" stroke="none" />
      <path d="M12 2v3M12 19v3M2 12h3M19 12h3" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

export interface LocationControlProps {
  status: GeolocationStatus;
  errorMessage: string | null;
  onEnable: () => void;
  onRecenter: () => void;
}

/** Desktop-only "my location" trigger — a single icon button, same visual
 * language as the Settings gear. idle/error → click starts watching;
 * active → click recenters; locating → shows a spinner in place of the
 * icon. Turning sharing back off lives in Settings instead of here (see
 * SettingsMenu's Location section) — this button is purely "get/find me",
 * not a whole control panel. */
export default function LocationControl({ status, errorMessage, onEnable, onRecenter }: LocationControlProps) {
  const isErrorState = status === "denied" || status === "unavailable" || status === "error";

  const handleClick = () => {
    if (status === "locating") return;
    if (status === "active") onRecenter();
    else onEnable();
  };

  const title =
    status === "active"
      ? "Recenter on my location"
      : status === "locating"
        ? "Locating…"
        : isErrorState
          ? (errorMessage ?? "Location unavailable — retry")
          : "Show my location";

  const className = [
    "location-control__trigger",
    status === "active" && "location-control__trigger--active",
    isErrorState && "location-control__trigger--error",
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <button className={className} onClick={handleClick} title={title} aria-label={title}>
      {status === "locating" ? <span className="location-control__spinner" aria-hidden="true" /> : <CrosshairIcon />}
    </button>
  );
}
