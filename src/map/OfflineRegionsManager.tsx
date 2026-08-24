import { useEffect, useState } from "react";
import { listRegions, renameRegion, type OfflineRegion } from "../cache/persistentCache";
import {
  getActiveJob,
  pauseRegionDownload,
  resumeRegionDownload,
  startRegionDownload,
  cancelRegionDownload,
  type DownloadProgress,
} from "../offline/downloadManager";
import type { Bbox } from "../offline/regionTiles";
import "./OfflineRegionsManager.css";

const esriApiKey = import.meta.env.VITE_ESRI_API_KEY as string | undefined;
const REFRESH_MS = 2000;

function formatBytes(bytes: number): string {
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export interface OfflineRegionsManagerProps {
  hasEsri: boolean;
  onClose: () => void;
  onFlyTo?: (bbox: Bbox) => void;
}

/** Lists every saved offline region with live progress (reattaching to any
 * job already running in this session), storage usage, and rename/update/
 * delete/pause/resume actions. Also the entry point for restart recovery:
 * a region left "downloading" when the app was last closed shows a Resume
 * button rather than a misleading Pause (there's no live job for it until
 * the user asks to continue it). */
export default function OfflineRegionsManager({ hasEsri, onClose, onFlyTo }: OfflineRegionsManagerProps) {
  const [regions, setRegions] = useState<OfflineRegion[]>([]);
  const [tick, setTick] = useState(0);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState("");

  useEffect(() => {
    let cancelled = false;
    const refresh = async () => {
      const rows = await listRegions();
      if (!cancelled) {
        setRegions(rows);
        setTick((t) => t + 1);
      }
    };
    refresh();
    const timer = setInterval(refresh, REFRESH_MS);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, []);

  const handleRename = async (id: string) => {
    await renameRegion(id, editingName.trim() || "Untitled region");
    setEditingId(null);
    setRegions(await listRegions());
  };

  const handleDelete = async (id: string) => {
    await cancelRegionDownload(id);
    setRegions(await listRegions());
  };

  return (
    <div className="offline-regions-manager-backdrop" onClick={onClose}>
      <div className="offline-regions-manager" onClick={(e) => e.stopPropagation()}>
        <div className="offline-regions-manager__header">
          <span>Downloaded regions</span>
          <button className="offline-regions-manager__close" onClick={onClose} aria-label="Close">
            ×
          </button>
        </div>
        {regions.length === 0 ? (
          <div className="offline-regions-manager__empty">No offline regions yet — draw one on the map to get started.</div>
        ) : (
          <ul className="offline-regions-manager__list">
            {regions.map((region) => (
              <OfflineRegionRow
                key={region.id}
                region={region}
                tick={tick}
                editing={editingId === region.id}
                editingName={editingName}
                onStartEdit={() => {
                  setEditingId(region.id);
                  setEditingName(region.name);
                }}
                onEditingNameChange={setEditingName}
                onCommitEdit={() => handleRename(region.id)}
                onFlyTo={onFlyTo}
                onPause={() => pauseRegionDownload(region.id)}
                onResume={() => resumeRegionDownload(region, hasEsri ? esriApiKey : undefined)}
                onUpdate={() => startRegionDownload({ ...region, status: "paused" }, hasEsri ? esriApiKey : undefined)}
                onDelete={() => handleDelete(region.id)}
              />
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

interface OfflineRegionRowProps {
  region: OfflineRegion;
  /** Bumped by the parent's poll — forces this row to recheck
   * getActiveJob() even when the region's persisted status string hasn't
   * changed (e.g. right after clicking Resume, before the job's own
   * periodic persistence catches up). */
  tick: number;
  editing: boolean;
  editingName: string;
  onStartEdit: () => void;
  onEditingNameChange: (value: string) => void;
  onCommitEdit: () => void;
  onFlyTo?: (bbox: Bbox) => void;
  onPause: () => void;
  onResume: () => void;
  onUpdate: () => void;
  onDelete: () => void;
}

function OfflineRegionRow({
  region,
  tick,
  editing,
  editingName,
  onStartEdit,
  onEditingNameChange,
  onCommitEdit,
  onFlyTo,
  onPause,
  onResume,
  onUpdate,
  onDelete,
}: OfflineRegionRowProps) {
  const [progress, setProgress] = useState<DownloadProgress | null>(null);
  const isLive = Boolean(getActiveJob(region.id));

  useEffect(() => {
    const job = getActiveJob(region.id);
    if (!job) {
      setProgress(null);
      return;
    }
    return job.onProgress(setProgress);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [region.id, tick]);

  const status = progress?.status ?? region.status;
  const total = progress?.totalTiles || region.expectedTiles || 0;
  const done = progress?.downloadedTiles ?? region.downloadedTiles;
  const bytes = progress?.downloadedBytes ?? region.downloadedBytes;
  const pct = total > 0 ? Math.min(100, Math.round((done / total) * 100)) : status === "complete" ? 100 : 0;
  // "downloading" with no live job means the app was closed/crashed mid-run
  // — not actually in progress right now, needs an explicit Resume.
  const interrupted = status === "downloading" && !isLive;

  return (
    <li className="offline-regions-manager__row">
      <div className="offline-regions-manager__row-main">
        {editing ? (
          <input
            autoFocus
            value={editingName}
            onChange={(e) => onEditingNameChange(e.target.value)}
            onBlur={onCommitEdit}
            onKeyDown={(e) => e.key === "Enter" && onCommitEdit()}
            className="offline-regions-manager__name-input"
          />
        ) : (
          <button className="offline-regions-manager__name" onClick={() => onFlyTo?.(region.bbox)} title="Fly to this region">
            {region.name}
          </button>
        )}
        <button className="offline-regions-manager__icon-btn" onClick={onStartEdit} title="Rename" aria-label="Rename">
          ✎
        </button>
      </div>
      <div className="offline-regions-manager__meta">
        <span>
          {region.layers.length} layer{region.layers.length === 1 ? "" : "s"}
        </span>
        <span>
          z{region.minZoom}–{region.maxZoom}
        </span>
        <span>{formatBytes(bytes)}</span>
        <span className={`offline-regions-manager__status offline-regions-manager__status--${interrupted ? "paused" : status}`}>
          {interrupted ? "interrupted" : status}
        </span>
      </div>
      {(status === "downloading" || status === "paused") && (
        <div className="offline-download-panel__progress-track">
          <div className="offline-download-panel__progress-fill" style={{ width: `${pct}%` }} />
        </div>
      )}
      <div className="offline-regions-manager__actions">
        {status === "downloading" && isLive && <button onClick={onPause}>Pause</button>}
        {(interrupted || status === "paused" || status === "error") && <button onClick={onResume}>Resume</button>}
        {status === "complete" && <button onClick={onUpdate}>Update</button>}
        <button onClick={onDelete}>Delete</button>
      </div>
    </li>
  );
}
