// In-memory byte LRU in front of the IndexedDB tile cache (persistentCache.ts).
// A cache "hit" there still costs a full IndexedDB transaction — measurably
// slow on Android, confirmed live ("tile loading from cache is slow"). This
// sits in front of it so panning back over recently-seen ground doesn't pay
// a disk round-trip per tile, only the first time.
//
// Deliberately simple: two size-tiered Maps used as LRUs (JS Map preserves
// insertion order; delete+re-set on touch moves an entry to the back), no
// timestamps, no persistence — this is a hot-path accelerator, not a second
// source of truth. Losing everything in it (a reload, a tab kill) is always
// safe; the disk cache underneath is unaffected.
//
// THE ONE HAZARD: MapLibre transfers (not copies) the ArrayBuffer a protocol
// handler returns, detaching it in this context. memGet must never return
// the stored buffer itself — only a copy — or the second reader of a hot
// tile gets a zero-length buffer. Already hit this bug once this session
// (see the cachePutBytes fix in persistentCache.ts) — same class of mistake,
// don't repeat it here.
import { isAndroid } from "../platform";

interface MemEntry {
  buf: ArrayBuffer;
  contentType: string | null;
}

// Nothing tile-sized needs more than this; anything bigger just isn't cached
// in memory (still works, just always goes to disk/network).
const MAX_ENTRY_BYTES = 2 * 1024 * 1024;
const SMALL_ENTRY_BYTES = 64 * 1024;

// Split into two tiers so a burst of large satellite/DEM tiles during a pan
// can't flush small, frequently-reused entries (glyphs, small vector tiles,
// the style/sprite JSON) out of RAM. Total budget kept well under what
// already forced maxTileCacheSize down on Android (this app's own decoded-
// tile pool already competes for the same process memory).
const SMALL_BUDGET = isAndroid ? 6 * 1024 * 1024 : 16 * 1024 * 1024;
const LARGE_BUDGET = isAndroid ? 18 * 1024 * 1024 : 48 * 1024 * 1024;

const smallEntries = new Map<string, MemEntry>();
const largeEntries = new Map<string, MemEntry>();
let smallBytes = 0;
let largeBytes = 0;

function tierFor(size: number): { map: Map<string, MemEntry>; budget: number; getBytes: () => number; setBytes: (n: number) => void } {
  return size <= SMALL_ENTRY_BYTES
    ? { map: smallEntries, budget: SMALL_BUDGET, getBytes: () => smallBytes, setBytes: (n) => (smallBytes = n) }
    : { map: largeEntries, budget: LARGE_BUDGET, getBytes: () => largeBytes, setBytes: (n) => (largeBytes = n) };
}

/** Returns a fresh copy of the cached bytes, or null on a miss. Never
 * returns the stored buffer itself — see the detachment hazard above. */
export function memGet(key: string): { bytes: Uint8Array; contentType: string | null } | null {
  for (const map of [smallEntries, largeEntries]) {
    const entry = map.get(key);
    if (entry) {
      map.delete(key);
      map.set(key, entry); // move to the back (most-recently-used)
      return { bytes: new Uint8Array(entry.buf.slice(0)), contentType: entry.contentType };
    }
  }
  return null;
}

/** Takes ownership of `buf` — caller must not retain or transfer it after
 * this call. */
export function memPut(key: string, buf: ArrayBuffer, contentType: string | null): void {
  const size = buf.byteLength;
  if (size > MAX_ENTRY_BYTES) return;
  memDelete(key); // in case it's already present in the other tier
  const { map, budget, getBytes, setBytes } = tierFor(size);
  map.set(key, { buf, contentType });
  let total = getBytes() + size;
  while (total > budget && map.size > 0) {
    const oldestKey = map.keys().next().value as string;
    const oldest = map.get(oldestKey);
    map.delete(oldestKey);
    total -= oldest?.buf.byteLength ?? 0;
  }
  setBytes(total);
}

export function memDelete(key: string): void {
  const small = smallEntries.get(key);
  if (small) {
    smallEntries.delete(key);
    smallBytes -= small.buf.byteLength;
  }
  const large = largeEntries.get(key);
  if (large) {
    largeEntries.delete(key);
    largeBytes -= large.buf.byteLength;
  }
}

export function memClear(): void {
  smallEntries.clear();
  largeEntries.clear();
  smallBytes = 0;
  largeBytes = 0;
}
