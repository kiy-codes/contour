import * as maplibregl from "maplibre-gl";
import { cacheGetBytes, cachePutBytes } from "./persistentCache";

export const CACHE_SCHEME = "wmcache";

let registered = false;

// Bounds how many cache-miss network fetches run at once across every tile
// source sharing this protocol (base map, DEM, satellite, topo, ski,
// waymarked trails) — MapLibre itself has no concurrency cap on custom
// protocols, so a fast pan/zoom across several sources at once could
// otherwise burst dozens of simultaneous requests against a single
// provider. 6 matches the classic per-origin HTTP/1.1 browser limit — high
// enough that normal panning stays smooth (cache hits below don't queue at
// all), low enough to behave as a good citizen of free tile providers with
// modest published limits (see architecture.md). Requests already in the
// queue are dropped without ever fetching if MapLibre aborts them first
// (panned away before their turn) — no point spending a network request or
// a queue slot on a tile that's no longer needed.
const MAX_CONCURRENT_FETCHES = 6;
let activeFetches = 0;
const waitQueue: (() => void)[] = [];

function acquireFetchSlot(signal: AbortSignal): Promise<void> {
  if (activeFetches < MAX_CONCURRENT_FETCHES) {
    activeFetches++;
    return Promise.resolve();
  }
  return new Promise<void>((resolve, reject) => {
    const onAbort = () => {
      const idx = waitQueue.indexOf(grant);
      if (idx !== -1) waitQueue.splice(idx, 1);
      reject(new DOMException("Aborted", "AbortError"));
    };
    const grant = () => {
      signal.removeEventListener("abort", onAbort);
      activeFetches++;
      resolve();
    };
    signal.addEventListener("abort", onAbort, { once: true });
    waitQueue.push(grant);
  });
}

function releaseFetchSlot() {
  activeFetches--;
  const next = waitQueue.shift();
  if (next) next();
}

/** Registers a MapLibre custom protocol that transparently persists
 * whatever it fetches through the app's IndexedDB tile cache (see
 * persistentCache.ts), keyed by the real URL. A tile source opts in by
 * using withCacheScheme() on its URL template instead of the plain https
 * URL. Idempotent — safe to call from multiple modules at load time. */
export function registerTileCacheProtocol() {
  if (registered) return;
  registered = true;

  maplibregl.addProtocol(CACHE_SCHEME, async (params, abortController) => {
    const realUrl = params.url.slice(`${CACHE_SCHEME}://`.length);
    const key = tileCacheKey(realUrl);

    let buffer: ArrayBuffer;
    const cached = await cacheGetBytes(key);
    if (cached) {
      buffer = cached.bytes.buffer as ArrayBuffer;
    } else if (!navigator.onLine) {
      // No point waiting on a connection that isn't there — fail fast
      // instead of letting the browser hang on DNS/connect until its own
      // timeout. MapLibre treats this exactly like any other failed tile
      // request (renders the tile blank, keeps going).
      throw new Error(`Offline and not cached: ${realUrl}`);
    } else {
      await acquireFetchSlot(abortController.signal);
      try {
        const response = await fetch(realUrl, { signal: abortController.signal });
        if (!response.ok) throw new Error(`Tile fetch failed: ${response.status} ${realUrl}`);
        buffer = await response.arrayBuffer();
        // The buffer we return below is transferred (not copied) to MapLibre's
        // tile worker, detaching it here — so the cache must get its own copy,
        // made now while the original is still attached. Fire-and-forget: the
        // copy is immune to the transfer, and awaiting the IndexedDB write
        // would block this tile's render on a disk round-trip (measurably
        // slower on-device, confirmed live).
        void cachePutBytes(key, new Uint8Array(buffer.slice(0)), response.headers.get("content-type"));
      } finally {
        releaseFetchSlot();
      }
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

/** The cache key a given real URL is stored/looked-up under — same
 * convention the protocol handler above uses internally. Exported so
 * anything that needs to pre-populate or check the cache for a specific
 * URL (e.g. the offline region downloader) stays in sync with it rather
 * than duplicating the "tile:" prefix as a magic string. */
export function tileCacheKey(url: string): string {
  return `tile:${url}`;
}
