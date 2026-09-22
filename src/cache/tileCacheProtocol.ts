import * as maplibregl from "maplibre-gl";
import { invoke } from "@tauri-apps/api/core";
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

// OpenSkiMap's tile CDN (Cloudflare) serves a near-empty placeholder tile
// (~193 bytes vs a real tile's tens of KB) for requests carrying an Origin
// header it doesn't recognise — confirmed directly against their live
// endpoint: no Origin, or Tauri's own app origin, both get the placeholder;
// a browser-typical Origin (their own domain, or any plain "http://
// localhost:<port>") gets the real tile every time. access-control-allow-
// origin on their response is "*", so this isn't a CORS/security boundary
// being crossed — it reads as an anti-hotlink/bandwidth heuristic that
// wasn't written with a shipped app's non-browser origin in mind, not an
// access restriction we're bypassing.
//
// A page's own fetch() cannot set Origin itself — it's on the Fetch spec's
// forbidden-header list and the browser silently drops it. @tauri-apps/
// plugin-http's fetch() *can* on desktop (its header list is built from a
// bare Headers object, not tied to a spec-compliant Request there) — but on
// Android its underlying Request/Headers construction enforces the
// forbidden-name list anyway, silently dropping Origin before the request
// reaches Rust at all. Confirmed on-device: status 200, but the exact
// ~193-byte placeholder every time despite the header being set in JS. See
// fetch_with_origin_header in src-tauri/src/lib.rs for the platform-
// independent fix — a raw reqwest call, no browser header object involved.
// Every other tile host keeps using plain fetch() unchanged.
const ORIGIN_SPOOF_HOSTS: Record<string, string> = {
  "tiles.openskimap.org": "http://localhost",
};

// The Cloudflare placeholder this host serves when it doesn't like the
// Origin header is ~193 bytes. A real tile over a run/lift-free area (most
// of the world, since this is opt-in and only fetched at all once the ski
// layer is on) can still be a genuinely tiny near-empty MVT payload, so this
// stays close to the known placeholder size rather than a round "small tile"
// number — enough margin to catch the placeholder, not so much that a
// legitimately sparse real tile gets misclassified as one.
const MIN_PLAUSIBLE_TILE_BYTES = 250;

async function fetchTileBytes(url: string, signal: AbortSignal): Promise<Response> {
  const spoofOrigin = ORIGIN_SPOOF_HOSTS[new URL(url).hostname];
  if (spoofOrigin) {
    // No AbortSignal plumbing into the Rust side here — these requests are
    // short (single tile), and acquireFetchSlot already bounds how many run
    // at once, so a panned-away abort just means the result gets discarded
    // when it lands rather than being cancelled mid-flight. Not worth a
    // cancellable-command mechanism for that.
    if (signal.aborted) throw new DOMException("Aborted", "AbortError");
    const bytes = await invoke<number[]>("fetch_with_origin_header", { url, origin: spoofOrigin });
    return new Response(new Uint8Array(bytes));
  }
  return fetch(url, { signal });
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
        const response = await fetchTileBytes(realUrl, abortController.signal);
        if (!response.ok) throw new Error(`Tile fetch failed: ${response.status} ${realUrl}`);
        buffer = await response.arrayBuffer();
        // Belt-and-suspenders against the anti-hotlink placeholder Origin-
        // spoofed hosts (see ORIGIN_SPOOF_HOSTS above) serve when a spoof
        // doesn't take: still 200 OK, so the check above doesn't catch it.
        // Silently caching that as "the tile" would permanently poison this
        // URL's cache entry with an empty result, so treat implausibly small
        // bytes from these hosts as a failure instead — MapLibre retries a
        // failed tile on the next viewport change; a cached one it never
        // retries.
        if (ORIGIN_SPOOF_HOSTS[new URL(realUrl).hostname] && buffer.byteLength < MIN_PLAUSIBLE_TILE_BYTES) {
          throw new Error(`Suspiciously small tile (${buffer.byteLength}B, Origin spoof likely rejected): ${realUrl}`);
        }
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
