// IndexedDB-backed persistent cache for tiles and geocode results.
//
// Previously this went through Tauri IPC to a Rust/SQLite cache. That
// added, per lookup: an IPC serialization round-trip, base64 encode/decode
// (~33% size inflation), and lock contention on a single Mutex<Connection>
// — all paid on every one of the dozens of tile requests a single pan/zoom
// burst can fire. IndexedDB lives in the same process as this code (no IPC
// hop at all), stores raw bytes directly, and — as a bonus — works
// identically in the plain browser preview, not just the real Tauri
// window, since it's a standard Web API rather than a Tauri bridge.
const DB_NAME = "contour-cache";
const DB_VERSION = 1;
const STORE = "entries";
const META_STORE = "meta";
const DEFAULT_MAX_BYTES = 500 * 1024 * 1024; // 500 MB

export interface CacheStats {
  entry_count: number;
  total_bytes: number;
  max_bytes: number;
}

interface CacheEntry {
  key: string;
  bytes: ArrayBuffer;
  contentType: string | null;
  size: number;
  lastAccessed: number;
}

interface MetaRow {
  k: string;
  v: number;
}

let dbPromise: Promise<IDBDatabase> | null = null;

function openDb(): Promise<IDBDatabase> {
  if (!dbPromise) {
    dbPromise = new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains(STORE)) {
          const store = db.createObjectStore(STORE, { keyPath: "key" });
          store.createIndex("by_lastAccessed", "lastAccessed");
        }
        if (!db.objectStoreNames.contains(META_STORE)) {
          db.createObjectStore(META_STORE, { keyPath: "k" });
        }
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }
  return dbPromise;
}

function reqToPromise<T>(req: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function txDone(tx: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);
  });
}

async function getMeta(db: IDBDatabase, key: string, fallback: number): Promise<number> {
  const tx = db.transaction(META_STORE, "readonly");
  const row = (await reqToPromise(tx.objectStore(META_STORE).get(key))) as MetaRow | undefined;
  return row?.v ?? fallback;
}

/** Deletes least-recently-accessed entries (via the lastAccessed index)
 * until total size fits within the configured cap. Normally 0-1 deletes
 * per call, since this runs right after the put that might have crossed
 * the line. */
async function evictToFit(db: IDBDatabase): Promise<void> {
  const maxBytes = await getMeta(db, "maxBytes", DEFAULT_MAX_BYTES);
  let totalBytes = await getMeta(db, "totalBytes", 0);
  while (totalBytes > maxBytes) {
    const tx = db.transaction([STORE, META_STORE], "readwrite");
    const store = tx.objectStore(STORE);
    const cursor = await reqToPromise(store.index("by_lastAccessed").openCursor());
    if (!cursor) {
      await txDone(tx);
      break;
    }
    const oldest = cursor.value as CacheEntry;
    store.delete(oldest.key);
    totalBytes -= oldest.size;
    tx.objectStore(META_STORE).put({ k: "totalBytes", v: totalBytes } satisfies MetaRow);
    await txDone(tx);
  }
}

/** Reads a cached entry's raw bytes, touching its lastAccessed for LRU
 * purposes. Returns null on a miss, and also null (never throws) if
 * IndexedDB is unavailable for some reason, so callers can treat "no
 * cache" and "cache unavailable" the same way and fall back to network. */
export async function cacheGetBytes(key: string): Promise<{ bytes: Uint8Array; contentType: string | null } | null> {
  try {
    const db = await openDb();
    const tx = db.transaction(STORE, "readwrite");
    const store = tx.objectStore(STORE);
    const entry = (await reqToPromise(store.get(key))) as CacheEntry | undefined;
    if (!entry) {
      await txDone(tx);
      return null;
    }
    store.put({ ...entry, lastAccessed: Date.now() });
    await txDone(tx);
    return { bytes: new Uint8Array(entry.bytes), contentType: entry.contentType };
  } catch {
    return null;
  }
}

export async function cachePutBytes(key: string, bytes: Uint8Array, contentType?: string | null): Promise<void> {
  try {
    const db = await openDb();
    const tx = db.transaction([STORE, META_STORE], "readwrite");
    const store = tx.objectStore(STORE);
    const metaStore = tx.objectStore(META_STORE);

    const existing = (await reqToPromise(store.get(key))) as CacheEntry | undefined;
    const copy = bytes.slice(); // defensive copy — never alias a buffer the caller might reuse
    const size = copy.byteLength;
    store.put({ key, bytes: copy.buffer, contentType: contentType ?? null, size, lastAccessed: Date.now() } satisfies CacheEntry);

    const currentTotal = (await reqToPromise(metaStore.get("totalBytes"))) as MetaRow | undefined;
    const delta = size - (existing?.size ?? 0);
    metaStore.put({ k: "totalBytes", v: (currentTotal?.v ?? 0) + delta } satisfies MetaRow);

    await txDone(tx);
    await evictToFit(db);
  } catch {
    // Caching is best-effort — a failure here must never break the tile
    // fetch or search call that triggered it.
  }
}

export async function cacheGetJson<T>(key: string): Promise<T | null> {
  const hit = await cacheGetBytes(key);
  if (!hit) return null;
  try {
    return JSON.parse(new TextDecoder().decode(hit.bytes)) as T;
  } catch {
    return null;
  }
}

export async function cachePutJson(key: string, value: unknown): Promise<void> {
  await cachePutBytes(key, new TextEncoder().encode(JSON.stringify(value)), "application/json");
}

export async function cacheStats(): Promise<CacheStats | null> {
  try {
    const db = await openDb();
    const tx = db.transaction([STORE, META_STORE], "readonly");
    const count = await reqToPromise(tx.objectStore(STORE).count());
    const totalRow = (await reqToPromise(tx.objectStore(META_STORE).get("totalBytes"))) as MetaRow | undefined;
    const maxRow = (await reqToPromise(tx.objectStore(META_STORE).get("maxBytes"))) as MetaRow | undefined;
    await txDone(tx);
    return { entry_count: count, total_bytes: totalRow?.v ?? 0, max_bytes: maxRow?.v ?? DEFAULT_MAX_BYTES };
  } catch {
    return null;
  }
}

export async function cacheClear(): Promise<void> {
  const db = await openDb();
  const tx = db.transaction([STORE, META_STORE], "readwrite");
  tx.objectStore(STORE).clear();
  tx.objectStore(META_STORE).put({ k: "totalBytes", v: 0 } satisfies MetaRow);
  await txDone(tx);
}

export async function cacheSetMaxBytes(maxBytes: number): Promise<void> {
  const db = await openDb();
  const tx = db.transaction(META_STORE, "readwrite");
  tx.objectStore(META_STORE).put({ k: "maxBytes", v: maxBytes } satisfies MetaRow);
  await txDone(tx);
  await evictToFit(db);
}
