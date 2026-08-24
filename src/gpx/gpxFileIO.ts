import { save, open } from "@tauri-apps/plugin-dialog";
import { invoke } from "@tauri-apps/api/core";

const GPX_FILTER = { name: "GPX", extensions: ["gpx"] };

/** Opens the native Save dialog and writes the GPX content; returns false
 * if the user cancelled rather than throwing. Writes via a custom Rust
 * command rather than the fs plugin — the fs plugin's ACL only scopes a
 * fixed set of well-known directories and has no "wherever the user just
 * picked in this dialog" scope, which a Save dialog result generally isn't. */
export async function saveGpxFile(content: string, defaultFilename: string): Promise<boolean> {
  const path = await save({ defaultPath: defaultFilename, filters: [GPX_FILTER] });
  if (!path) return false;
  await invoke("write_gpx_file", { path, contents: content });
  return true;
}

/** Opens the native Open dialog and reads the chosen GPX file's text;
 * returns null if the user cancelled. */
export async function openGpxFile(): Promise<string | null> {
  const path = await open({ multiple: false, filters: [GPX_FILTER] });
  if (!path || Array.isArray(path)) return null;
  return await invoke<string>("read_gpx_file", { path });
}

const TRACK_FILTER = { name: "GPS tracks", extensions: ["gpx", "geojson", "json", "kml"] };

export interface OpenedTrackFile {
  path: string;
  contents: string;
}

/** Opens the native Open dialog accepting GPX, GeoJSON, or KML; returns the
 * path (so the caller can pick a parser by extension) and contents, or null
 * if the user cancelled. Reuses the same generic Rust read command GPX
 * import uses — it just reads bytes as UTF-8 text, nothing GPX-specific
 * about it despite the command's name. */
export async function openTrackFile(): Promise<OpenedTrackFile | null> {
  const path = await open({ multiple: false, filters: [TRACK_FILTER] });
  if (!path || Array.isArray(path)) return null;
  const contents = await invoke<string>("read_gpx_file", { path });
  return { path, contents };
}

/** Opens the native Save dialog and writes arbitrary text content — used
 * for GeoJSON export alongside the GPX-specific saveGpxFile above. */
export async function saveTextFile(content: string, defaultFilename: string, filter: { name: string; extensions: string[] }): Promise<boolean> {
  const path = await save({ defaultPath: defaultFilename, filters: [filter] });
  if (!path) return false;
  await invoke("write_gpx_file", { path, contents: content });
  return true;
}
