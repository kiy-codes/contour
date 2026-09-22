// IndexedDB-backed library of user-saved routes — a separate small database
// from the tile cache (persistentCache.ts): different lifecycle entirely
// (user content that should never be evicted/cleared by a "Clear cache"
// action), so keeping it out of that DB's upgrade path avoids coupling two
// unrelated concerns to the same schema version.
import type { LngLat } from "../providers/types";
import type { RouteResult, RoutingMode } from "../providers/RoutingProvider";

const DB_NAME = "contour-routes";
const DB_VERSION = 1;
const STORE = "routes";

export interface SavedRoute {
  id: string;
  name: string;
  createdAt: number;
  updatedAt: number;
  starred: boolean;
  /** Pinned routes sort first, ahead of starred/recency — see sortSavedRoutes. */
  pinned: boolean;
  mode: RoutingMode;
  /** Present only for a manually-drawn/ORS multi-waypoint route — lets it
   * be restored back into the live, still-editable route editor (see
   * routeReducer's LOAD_WAYPOINTS). Absent for imported tracks and
   * planner-generated (round-trip) routes: neither has a click-added
   * waypoint list to speak of, only the final geometry in `result`. */
  waypoints?: LngLat[];
  result: RouteResult;
}

let dbPromise: Promise<IDBDatabase> | null = null;

function openDb(): Promise<IDBDatabase> {
  if (!dbPromise) {
    dbPromise = new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains(STORE)) {
          db.createObjectStore(STORE, { keyPath: "id" });
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

export async function listSavedRoutes(): Promise<SavedRoute[]> {
  const db = await openDb();
  const tx = db.transaction(STORE, "readonly");
  const rows = await reqToPromise(tx.objectStore(STORE).getAll());
  await txDone(tx);
  return rows as SavedRoute[];
}

export interface NewSavedRouteInput {
  name: string;
  mode: RoutingMode;
  waypoints?: LngLat[];
  result: RouteResult;
}

export async function createSavedRoute(input: NewSavedRouteInput): Promise<SavedRoute> {
  const now = Date.now();
  const route: SavedRoute = {
    id: crypto.randomUUID(),
    name: input.name,
    createdAt: now,
    updatedAt: now,
    starred: false,
    pinned: false,
    mode: input.mode,
    waypoints: input.waypoints,
    result: input.result,
  };
  const db = await openDb();
  const tx = db.transaction(STORE, "readwrite");
  tx.objectStore(STORE).put(route);
  await txDone(tx);
  return route;
}

/** Applies a partial update (rename, star/pin toggle, etc.) and bumps
 * updatedAt — returns the merged row, or undefined if the id no longer
 * exists (e.g. deleted from another tab/window in the same session). */
export async function updateSavedRoute(
  id: string,
  patch: Partial<Omit<SavedRoute, "id" | "createdAt">>,
): Promise<SavedRoute | undefined> {
  const db = await openDb();
  const tx = db.transaction(STORE, "readwrite");
  const store = tx.objectStore(STORE);
  const existing = (await reqToPromise(store.get(id))) as SavedRoute | undefined;
  if (!existing) {
    await txDone(tx);
    return undefined;
  }
  const updated: SavedRoute = { ...existing, ...patch, updatedAt: Date.now() };
  store.put(updated);
  await txDone(tx);
  return updated;
}

export async function deleteSavedRoute(id: string): Promise<void> {
  const db = await openDb();
  const tx = db.transaction(STORE, "readwrite");
  tx.objectStore(STORE).delete(id);
  await txDone(tx);
}

/** Pinned first, then starred, then most-recently-updated — the sort every
 * list view of saved routes should use, kept here so multiple UI surfaces
 * (a future search result, a compact picker, ...) can't drift apart on it. */
export function sortSavedRoutes(routes: SavedRoute[]): SavedRoute[] {
  return [...routes].sort((a, b) => {
    if (a.pinned !== b.pinned) return a.pinned ? -1 : 1;
    if (a.starred !== b.starred) return a.starred ? -1 : 1;
    return b.updatedAt - a.updatedAt;
  });
}
