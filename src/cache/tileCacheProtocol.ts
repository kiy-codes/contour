import * as maplibregl from "maplibre-gl";
import { cacheGetBytes, cachePutBytes } from "./persistentCache";

export const CACHE_SCHEME = "wmcache";

let registered = false;

/** Registers a MapLibre custom protocol that transparently persists
 * whatever it fetches through the Rust-backed SQLite cache, keyed by the
 * real URL. A tile source opts in by using withCacheScheme() on its URL
 * template instead of the plain https URL. Idempotent — safe to call from
 * multiple modules at load time. */
export function registerTileCacheProtocol() {
  if (registered) return;
  registered = true;

  maplibregl.addProtocol(CACHE_SCHEME, async (params, abortController) => {
    const realUrl = params.url.slice(`${CACHE_SCHEME}://`.length);
    const key = `tile:${realUrl}`;

    let buffer: ArrayBuffer;
    const cached = await cacheGetBytes(key);
    if (cached) {
      buffer = cached.bytes.buffer as ArrayBuffer;
    } else {
      const response = await fetch(realUrl, { signal: abortController.signal });
      if (!response.ok) throw new Error(`Tile fetch failed: ${response.status} ${realUrl}`);
      buffer = await response.arrayBuffer();
      void cachePutBytes(key, new Uint8Array(buffer), response.headers.get("content-type"));
    }

    // MapLibre expects the response shaped per the request's declared type
    // — this matters once this protocol also handles the base style JSON,
    // sprite JSON, and TileJSON sources (via transformRequest in
    // MapCanvas), not just binary tiles/glyphs. Returning a raw ArrayBuffer
    // for a 'json'-typed request silently fails MapLibre's own schema
    // validation ("missing required property...") since it never gets
    // parsed into an object.
    if (params.type === "json") return { data: JSON.parse(new TextDecoder().decode(buffer)) };
    if (params.type === "string") return { data: new TextDecoder().decode(buffer) };
    return { data: buffer };
  });
}

/** Rewrites a real tile URL template to route through the cache protocol. */
export function withCacheScheme(url: string): string {
  return `${CACHE_SCHEME}://${url}`;
}
