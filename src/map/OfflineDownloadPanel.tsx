import { useEffect, useState } from "react";
import {
  OFFLINE_LAYERS,
  MAX_REGION_TILES,
  estimateRegionSize,
  type OfflineLayerId,
  type Bbox,
  type RegionSizeEstimate,
} from "../offline/regionTiles";
import { createRegion, type OfflineRegion } from "../cache/persistentCache";
import {
  startRegionDownload,
  pauseRegionDownload,
  resumeRegionDownload,
  cancelRegionDownload,
  getActiveJob,
  type DownloadProgress,
} from "../offline/downloadManager";
import "./TerrainControls.css";
import "./OfflineDownloadPanel.css";

const esriApiKey = import.meta.env.VITE_ESRI_API_KEY as string | undefined;

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function formatSpeed(bytesPerSecond: number): string {
  return bytesPerSecond > 0 ? `${formatBytes(bytesPerSecond)}/s` : "—";
}

export interface OfflineDownloadPanelProps {
  bbox: Bbox;
  hasEsri: boolean;
  onClose: () => void;
}

/** Region setup form (name, zoom range, layers, live size estimate) that
 * switches into a live progress view once "Start download" is pressed. The
 * download itself runs in downloadManager regardless of whether this panel
 * stays open — closing it doesn't cancel anything; OfflineRegionsManager
 * shows the same live progress for any region, reattaching to the same job. */
export default function OfflineDownloadPanel({ bbox, hasEsri, onClose }: OfflineDownloadPanelProps) {
  const [name, setName] = useState(() => `Region ${new Date().toLocaleDateString()}`);
  const [minZoom, setMinZoom] = useState(8);
  const [maxZoom, setMaxZoom] = useState(13);
  const [layers, setLayers] = useState<OfflineLayerId[]>(["standard", "terrain"]);
  const [estimate, setEstimate] = useState<RegionSizeEstimate | null>(null);
  const [estimating, setEstimating] = useState(false);
  const [region, setRegion] = useState<OfflineRegion | null>(null);
  const [progress, setProgress] = useState<DownloadProgress | null>(null);

  useEffect(() => {
    if (region) return;
    let cancelled = false;
    setEstimating(true);
    estimateRegionSize(bbox, [minZoom, maxZoom], layers, hasEsri ? esriApiKey : undefined).then((result) => {
      if (!cancelled) {
        setEstimate(result);
        setEstimating(false);
      }
    });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bbox, minZoom, maxZoom, layers.join(","), region]);

  useEffect(() => {
    if (!region) return;
    const job = getActiveJob(region.id) ?? startRegionDownload(region, hasEsri ? esriApiKey : undefined);
    return job.onProgress(setProgress);
  }, [region, hasEsri]);

  const toggleLayer = (id: OfflineLayerId) => {
    setLayers((prev) => (prev.includes(id) ? prev.filter((l) => l !== id) : [...prev, id]));
  };

  const handleStart = async () => {
    if (!estimate || estimate.exceedsLimit || layers.length === 0) return;
    const newRegion: OfflineRegion = {
      id: crypto.randomUUID(),
      name: name.trim() || "Untitled region",
      bbox,
      minZoom,
      maxZoom,
      layers,
      status: "downloading",
      createdAt: Date.now(),
      updatedAt: Date.now(),
      expectedTiles: estimate.totalTiles,
      downloadedTiles: 0,
      downloadedBytes: 0,
    };
    await createRegion(newRegion);
    setRegion(newRegion);
  };

  if (region) {
    const status = progress?.status ?? region.status;
    const total = progress?.totalTiles || region.expectedTiles || 1;
    const done = progress?.downloadedTiles ?? 0;
    const pct = Math.min(100, Math.round((done / total) * 100));
    return (
      <div className="terrain-controls offline-download-panel">
        <div className="offline-download-panel__title">{region.name}</div>
        <div className="offline-download-panel__progress-track">
          <div className="offline-download-panel__progress-fill" style={{ width: `${pct}%` }} />
        </div>
        <div className="terrain-controls__row" style={{ justifyContent: "space-between" }}>
          <span>Tiles</span>
          <span className="terrain-controls__value">
            {done} / {total}
          </span>
        </div>
        <div className="terrain-controls__row" style={{ justifyContent: "space-between" }}>
          <span>Downloaded</span>
          <span className="terrain-controls__value">{formatBytes(progress?.downloadedBytes ?? 0)}</span>
        </div>
        <div className="terrain-controls__row" style={{ justifyContent: "space-between" }}>
          <span>Speed</span>
          <span className="terrain-controls__value">{formatSpeed(progress?.bytesPerSecond ?? 0)}</span>
        </div>
        {progress && progress.failedTiles > 0 && (
          <div className="offline-download-panel__warning">{progress.failedTiles} tile(s) failed</div>
        )}
        <div className="terrain-controls__row">
          {status === "downloading" && (
            <button className="glass-btn" onClick={() => pauseRegionDownload(region.id)}>
              Pause
            </button>
          )}
          {status === "paused" && (
            <button className="glass-btn glass-btn--primary" onClick={() => resumeRegionDownload(region, hasEsri ? esriApiKey : undefined)}>
              Resume
            </button>
          )}
          {(status === "downloading" || status === "paused") && (
            <button
              className="glass-btn"
              onClick={async () => {
                await cancelRegionDownload(region.id);
                onClose();
              }}
            >
              Cancel
            </button>
          )}
          {(status === "complete" || status === "error") && (
            <button className="glass-btn glass-btn--primary" onClick={onClose}>
              Done
            </button>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="terrain-controls offline-download-panel">
      <div className="terrain-controls__row">
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Region name"
          className="offline-download-panel__name"
        />
      </div>

      <div className="terrain-controls__row terrain-controls__row--slider">
        <span>Min zoom</span>
        <input
          type="range"
          min={0}
          max={maxZoom}
          value={minZoom}
          onChange={(e) => setMinZoom(Math.min(Number(e.target.value), maxZoom))}
        />
        <span className="terrain-controls__value">{minZoom}</span>
      </div>
      <div className="terrain-controls__row terrain-controls__row--slider">
        <span>Max zoom</span>
        <input
          type="range"
          min={minZoom}
          max={19}
          value={maxZoom}
          onChange={(e) => setMaxZoom(Math.max(Number(e.target.value), minZoom))}
        />
        <span className="terrain-controls__value">{maxZoom}</span>
      </div>

      <div className="offline-download-panel__layers">
        {OFFLINE_LAYERS.map((layer) => {
          const disabled = layer.needsEsriKey && !hasEsri;
          return (
            <label
              key={layer.id}
              className="terrain-controls__row"
              title={disabled ? "Needs a free Esri API key — not configured yet" : layer.description}
            >
              <input
                type="checkbox"
                checked={layers.includes(layer.id)}
                disabled={disabled}
                onChange={() => toggleLayer(layer.id)}
              />
              {layer.label}
            </label>
          );
        })}
      </div>

      <div className="terrain-controls__row" style={{ justifyContent: "space-between" }}>
        <span>Estimated size</span>
        <span className="terrain-controls__value">
          {estimating ? "…" : estimate ? `${formatBytes(estimate.estimatedBytes)} / ${estimate.totalTiles} tiles` : "—"}
        </span>
      </div>
      {estimate?.exceedsLimit && (
        <div className="offline-download-panel__warning">
          That's over the {MAX_REGION_TILES.toLocaleString()}-tile limit for one region — shrink the area, zoom range, or layers.
        </div>
      )}

      <div className="terrain-controls__row">
        <button className="glass-btn" onClick={onClose}>
          Cancel
        </button>
        <button
          className="glass-btn glass-btn--primary"
          onClick={handleStart}
          disabled={estimating || !estimate || estimate.exceedsLimit || layers.length === 0}
        >
          Start download
        </button>
      </div>
    </div>
  );
}
