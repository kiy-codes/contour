import { useMemo, useState } from "react";
import type { RouteResult } from "../providers/RoutingProvider";
import type { LngLat } from "../providers/types";
import { buildGarminCourse, GARMIN_ACTIVITY_LABELS, type GarminActivityType } from "../garmin/garminCourse";
import { validateGarminCourse } from "../garmin/garminValidation";
import { buildGarminCourseGpx, suggestGarminGpxFilename } from "../garmin/garminGpxExport";
import { garminProvider } from "../garmin/garminInstance";
import { saveTextFile } from "../gpx/gpxFileIO";
import "./TerrainControls.css";
import "./GarminExportPanel.css";

export interface GarminExportPanelProps {
  result: RouteResult;
  waypoints: LngLat[];
  defaultName: string;
  onClose: () => void;
}

const ACTIVITY_OPTIONS: GarminActivityType[] = ["hiking", "walking", "cycling", "running", "other"];

export default function GarminExportPanel({ result, waypoints, defaultName, onClose }: GarminExportPanelProps) {
  const [name, setName] = useState(defaultName);
  const [description, setDescription] = useState("");
  const [activityType, setActivityType] = useState<GarminActivityType>("hiking");
  const [saved, setSaved] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const course = useMemo(
    () => buildGarminCourse(result, { name, description, activityType, waypoints }),
    [result, name, description, activityType, waypoints],
  );
  const validation = useMemo(() => validateGarminCourse(course), [course]);
  const connectionState = garminProvider.getConnectionState();

  const handleExport = async () => {
    if (validation.errors.length > 0) return;
    setError(null);
    setSaved(null);
    const xml = buildGarminCourseGpx(course);
    const filename = suggestGarminGpxFilename(course.name);
    try {
      const wasSaved = await saveTextFile(xml, filename, { name: "GPX course", extensions: ["gpx"] });
      if (wasSaved) setSaved(filename);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  };

  return (
    <div className="terrain-controls garmin-export-panel">
      <div className="garmin-export-panel__header">
        <span className="settings-menu__section-label">Export for Garmin</span>
        <button className="place-info-panel__close" onClick={onClose} aria-label="Close Garmin export">
          ×
        </button>
      </div>

      <div className="garmin-export-panel__connection">
        <span className={`garmin-export-panel__status garmin-export-panel__status--${connectionState.status}`}>
          {connectionState.status === "connected" ? "Connected" : "Not connected"}
        </span>
        {connectionState.reason && <p className="garmin-export-panel__hint">{connectionState.reason}</p>}
        <p className="garmin-export-panel__hint">
          Direct upload to your Garmin account isn't available yet — export a course file below and add it through Garmin Connect,
          Garmin Express, or your device's storage instead. This always works and needs no account connection.
        </p>
      </div>

      <div className="settings-menu__divider" />

      <label className="terrain-controls__row">
        <span>Name</span>
        <input className="garmin-export-panel__input" value={name} onChange={(e) => setName(e.target.value)} />
      </label>
      <label className="terrain-controls__row garmin-export-panel__desc-row">
        <span>Description</span>
        <textarea
          className="garmin-export-panel__textarea"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          rows={2}
        />
      </label>
      <div className="garmin-export-panel__row-group" role="group" aria-label="Activity type">
        {ACTIVITY_OPTIONS.map((a) => (
          <button
            key={a}
            className={activityType === a ? "weather-controls__pill weather-controls__pill--active" : "weather-controls__pill"}
            onClick={() => setActivityType(a)}
          >
            {GARMIN_ACTIVITY_LABELS[a]}
          </button>
        ))}
      </div>

      {validation.errors.length > 0 && (
        <div className="garmin-export-panel__issues garmin-export-panel__issues--error">
          {validation.errors.map((e, i) => (
            <p key={i}>⚠ {e}</p>
          ))}
        </div>
      )}
      {validation.warnings.length > 0 && (
        <div className="garmin-export-panel__issues garmin-export-panel__issues--warning">
          {validation.warnings.map((w, i) => (
            <p key={i}>{w}</p>
          ))}
        </div>
      )}

      {error && <p className="garmin-export-panel__hint garmin-export-panel__hint--error">Could not save file: {error}</p>}
      {saved && (
        <div className="garmin-export-panel__saved">
          <p>
            Saved <strong>{saved}</strong>.
          </p>
          <p className="garmin-export-panel__hint">
            To get it onto your device: open Garmin Connect (web or app) → <strong>Training</strong> → <strong>Courses</strong> →{" "}
            <strong>Import</strong>, and select this file. Or use Garmin Express, or copy it into the <code>Courses</code> (or{" "}
            <code>NewFiles</code>) folder on your device when connected via USB. Then sync your device with Garmin Connect as usual.
          </p>
        </div>
      )}

      <button className="glass-btn glass-btn--primary" onClick={handleExport} disabled={validation.errors.length > 0}>
        Export GPX course
      </button>
    </div>
  );
}
