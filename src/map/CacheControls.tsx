import { useEffect, useState } from "react";
import { cacheStats, cacheClear, cacheSetMaxBytes, type CacheStats } from "../cache/persistentCache";
import "./TerrainControls.css";
import "./CacheControls.css";

const MAX_OPTIONS_MB = [100, 250, 500, 1000, 2000];

function formatBytes(bytes: number): string {
  return bytes < 1024 * 1024 ? `${(bytes / 1024).toFixed(0)} KB` : `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/** Shows the size of the on-disk (IndexedDB-backed) tile/geocode cache with
 * a max-size picker and a clear button. Reads null (rendered as
 * "unavailable") if IndexedDB itself throws for some reason, rather than
 * throwing here too — should be rare, since IndexedDB works the same in
 * the browser preview as in the real app, unlike the old Tauri-IPC-backed
 * cache this replaced.
 *
 * Renders inline content only (no wrapping glass card) — it lives inside
 * the Settings panel's "Storage" section, not as its own floating panel. */
export default function CacheControls() {
  const [stats, setStats] = useState<CacheStats | null | "loading">("loading");
  const [busy, setBusy] = useState(false);

  const refresh = async () => setStats(await cacheStats());

  useEffect(() => {
    refresh();
    const timer = setInterval(refresh, 5000);
    return () => clearInterval(timer);
  }, []);

  const handleClear = async () => {
    setBusy(true);
    await cacheClear();
    await refresh();
    setBusy(false);
  };

  const handleMaxChange = async (mb: number) => {
    setBusy(true);
    await cacheSetMaxBytes(mb * 1024 * 1024);
    await refresh();
    setBusy(false);
  };

  if (stats === "loading") return null;

  return (
    <>
      {stats === null ? (
        <span style={{ opacity: 0.6 }}>Cache unavailable</span>
      ) : (
        <>
          <div className="terrain-controls__row" style={{ justifyContent: "space-between" }}>
            <span>Cached tiles/search</span>
            <span className="terrain-controls__value">
              {formatBytes(stats.total_bytes)} / {stats.entry_count}
            </span>
          </div>
          <div className="terrain-controls__row" style={{ justifyContent: "space-between" }}>
            <span>Max size</span>
            <select
              value={Math.round(stats.max_bytes / (1024 * 1024))}
              onChange={(e) => handleMaxChange(Number(e.target.value))}
              disabled={busy}
              style={{ background: "transparent", color: "var(--text-primary)", border: "none", fontFamily: "inherit" }}
            >
              {MAX_OPTIONS_MB.map((mb) => (
                <option key={mb} value={mb} style={{ color: "#000" }}>
                  {mb} MB
                </option>
              ))}
            </select>
          </div>
          <div className="terrain-controls__row" style={{ justifyContent: "flex-end" }}>
            <button className="cache-controls__clear" onClick={handleClear} disabled={busy || stats.entry_count === 0}>
              Clear cache
            </button>
          </div>
        </>
      )}
    </>
  );
}
