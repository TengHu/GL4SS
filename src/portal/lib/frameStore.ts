/**
 * FRAME STORE — IndexedDB persistence for generated frames.
 *
 * Every frame costs real money and 5–30s to produce, and until now all of it was
 * thrown away on reload. That made the portal amnesiac: you could not come back
 * to a place you had already paid to see, and revisiting a URL rolled the dice
 * again rather than showing you what you saw before.
 *
 * Deliberately NOT reusing v1's history store, which was keyed by an
 * opaque jump id with a timestamp index, and shaped around a whole GeneratedView
 * with three panels. The portal's identity is place+year+style — the same key the
 * engine already caches on — and it needs to answer "what do I have for THIS
 * place across all years", which is the query the comparison feature is built on.
 * Bending v1's schema to that would have broken v1's history panel.
 *
 * Scope note: IndexedDB is per-browser, so this gives the *owner* memory and
 * reproducible revisits. It cannot make a link resolve to the same image for
 * someone else — that needs a backend and is a separate decision.
 */

import type { Coordinates } from '../../types';

const DB_NAME = 'looking-glass-portal';
/**
 * v2 splits the multi-megabyte hero out of the metadata record.
 *
 * v1 kept `heroUrl` on the same row as everything else, so loadIndex() — which
 * only ever wanted a key -> bytes map — called getAll() and materialised EVERY
 * stored photograph into memory to build it. At the 220MB budget that is a
 * multi-hundred-megabyte allocation on boot, and evict() did it a second time
 * immediately after. The failure got worse the more the app succeeded: a desktop
 * stall, a tab kill on mobile Safari, and once the tab dies during load the store
 * is no smaller next attempt, so the app becomes unopenable without clearing site
 * data.
 *
 * Now metadata lives in `frames` (small, scanned freely) and the image bytes live
 * in `blobs` (read only for the one frame being displayed).
 */
const DB_VERSION = 2;
const STORE = 'frames';
const BLOBS = 'blobs';

/** Index value grouping every frame taken at the same spot. */
export function placeKey(coordinates: Coordinates): string {
  return `${coordinates.lat.toFixed(3)}|${coordinates.lng.toFixed(3)}`;
}

/**
 * The metadata row. Deliberately small: every field here is scanned in bulk by
 * loadIndex() and evict(), so nothing large may be added to this interface.
 * The image bytes live in the `blobs` store, keyed by the same `key`.
 */
export interface StoredFrame {
  /** sceneKey() — place + year + style. Primary key. */
  key: string;
  /** Grouping key for "this place across time". Indexed. */
  place: string;
  coordinates: Coordinates;
  year: number;
  location: string;
  styleId: string;
  /**
   * The frame itself, as a data URL or a provider URL.
   *
   * Populated on read by getFrame(), which joins the blob store. It is stripped
   * before writing — putFrame() splits it out — so a row sitting in `frames` on
   * disk never carries it.
   */
  heroUrl: string;
  /**
   * The scene direction that produced this frame. Persisted so that `widen()`
   * still works on a restored frame: widen needs the left/right subjects, and
   * without them the button was a silent no-op on everything from disk.
   */
  direction?: unknown;
  narrative?: string;
  atmosphere?: string;
  /** Set when a moderation rescue rendered on a different model than selected. */
  modelUsed?: string;
  /** Approximate cost in bytes, used for quota accounting without re-measuring. */
  bytes: number;
  /**
   * Whether the user actually settled on this station, as opposed to it being a
   * speculative prefetch they scrubbed straight past. Drives eviction order:
   * frames you actually looked at are the last thing we throw away.
   */
  viewed: boolean;
  createdAt: number;
  lastSeenAt: number;
}

/**
 * Soft ceiling. Hero frames run 0.3–2MB, so a long session genuinely can reach
 * hundreds of MB and browsers start refusing writes. We evict toward this rather
 * than waiting for QuotaExceededError, and still handle the error for the case
 * where the budget is tighter than we assumed (private browsing, low disk).
 */
const TARGET_BYTES = 220 * 1024 * 1024;

let dbPromise: Promise<IDBDatabase> | null = null;

function openDb(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise<IDBDatabase>((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = (event) => {
      const db = req.result;
      const tx = req.transaction!;

      if (!db.objectStoreNames.contains(STORE)) {
        const store = db.createObjectStore(STORE, { keyPath: 'key' });
        store.createIndex('place', 'place', { unique: false });
        store.createIndex('lastSeenAt', 'lastSeenAt', { unique: false });
      }
      if (!db.objectStoreNames.contains(BLOBS)) {
        db.createObjectStore(BLOBS);
      }

      // v1 -> v2: lift heroUrl off each metadata row into the blob store. Done
      // with a cursor rather than getAll so the migration itself does not do the
      // very thing this version exists to stop.
      if (event.oldVersion === 1) {
        const frames = tx.objectStore(STORE);
        const blobs = tx.objectStore(BLOBS);
        const cursorReq = frames.openCursor();
        cursorReq.onsuccess = () => {
          const cursor = cursorReq.result;
          if (!cursor) return;
          const row = cursor.value as StoredFrame;
          if (row.heroUrl) {
            blobs.put(row.heroUrl, row.key);
            const rest: Partial<StoredFrame> = { ...row };
            delete rest.heroUrl;
            cursor.update(rest);
          }
          cursor.continue();
        };
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error ?? new Error('portal frame DB open failed'));
    req.onblocked = () => reject(new Error('portal frame DB blocked'));
  });
  return dbPromise;
}

function tx(db: IDBDatabase, mode: IDBTransactionMode): IDBObjectStore {
  return db.transaction(STORE, mode).objectStore(STORE);
}

function wrap<T>(req: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error ?? new Error('IndexedDB request failed'));
  });
}

/**
 * Every key we hold, plus its byte size. Loaded once at startup so the engine
 * can answer "do I have this?" SYNCHRONOUSLY — which is what lets request() stay
 * synchronous and avoid a flash of the wrong frame on a cache hit.
 */
export interface FrameIndex {
  keys: Map<string, number>;
  totalBytes: number;
}

export async function loadIndex(): Promise<FrameIndex> {
  const keys = new Map<string, number>();
  let totalBytes = 0;
  try {
    const db = await openDb();
    // Reads the metadata store only. Since v2 that store no longer carries
    // heroUrl, so this is a scan of small rows rather than of every photograph
    // the user has ever generated.
    const rows = await wrap(tx(db, 'readonly').getAll() as IDBRequest<StoredFrame[]>);
    for (const row of rows) {
      keys.set(row.key, row.bytes);
      totalBytes += row.bytes;
    }
  } catch {
    // A browser with IndexedDB blocked (private mode, hardened settings) should
    // degrade to a memory-only session, not fail to boot.
    return { keys: new Map(), totalBytes: 0 };
  }
  return { keys, totalBytes };
}

/** Metadata + image bytes, joined. The only path that reads a hero. */
export async function getFrame(key: string): Promise<StoredFrame | undefined> {
  try {
    const db = await openDb();
    const t = db.transaction([STORE, BLOBS], 'readonly');
    const meta = await wrap(t.objectStore(STORE).get(key) as IDBRequest<StoredFrame | undefined>);
    if (!meta) return undefined;
    const heroUrl = await wrap(t.objectStore(BLOBS).get(key) as IDBRequest<string | undefined>);
    // Metadata without its blob is a torn record — treat it as absent so the
    // caller regenerates rather than rendering an empty frame.
    if (!heroUrl) return undefined;
    return { ...meta, heroUrl };
  } catch {
    return undefined;
  }
}

/** All frames taken at one spot, newest year first. Backs the comparison view. */
export async function listByPlace(place: string): Promise<StoredFrame[]> {
  try {
    const db = await openDb();
    const idx = tx(db, 'readonly').index('place');
    const rows = await wrap(idx.getAll(place) as IDBRequest<StoredFrame[]>);
    return rows.sort((a, b) => a.year - b.year);
  } catch {
    return [];
  }
}

/** Writes metadata and bytes together, in one transaction so they cannot tear. */
async function write(frame: StoredFrame): Promise<void> {
  const db = await openDb();
  const t = db.transaction([STORE, BLOBS], 'readwrite');
  const { heroUrl, ...meta } = frame;
  t.objectStore(STORE).put(meta);
  t.objectStore(BLOBS).put(heroUrl, frame.key);
  await new Promise<void>((resolve, reject) => {
    t.oncomplete = () => resolve();
    t.onerror = () => reject(t.error ?? new Error('frame write failed'));
    t.onabort = () => reject(t.error ?? new Error('frame write aborted'));
  });
}

export async function putFrame(frame: StoredFrame): Promise<boolean> {
  try {
    await write(frame);
    return true;
  } catch (err) {
    // Out of space: make room and try exactly once more. Retrying in a loop on a
    // genuinely full disk would just stall the app.
    if (err instanceof DOMException && err.name === 'QuotaExceededError') {
      await evict(TARGET_BYTES * 0.6);
      try {
        await write(frame);
        return true;
      } catch {
        return false;
      }
    }
    return false;
  }
}

export async function touchFrame(key: string, viewed: boolean): Promise<void> {
  try {
    const db = await openDb();
    const store = tx(db, 'readwrite');
    const existing = await wrap(store.get(key) as IDBRequest<StoredFrame | undefined>);
    if (!existing) return;
    existing.lastSeenAt = Date.now();
    // `viewed` only ever ratchets true — a frame you once looked at stays
    // privileged for eviction even if a later prefetch touches the same key.
    existing.viewed = existing.viewed || viewed;
    await wrap(store.put(existing) as IDBRequest);
  } catch {
    /* best effort */
  }
}

export async function deleteFrame(key: string): Promise<void> {
  try {
    const db = await openDb();
    const t = db.transaction([STORE, BLOBS], 'readwrite');
    // Both halves, or the blob store leaks the bytes we were trying to reclaim.
    t.objectStore(STORE).delete(key);
    t.objectStore(BLOBS).delete(key);
    await new Promise<void>((resolve) => {
      t.oncomplete = () => resolve();
      t.onerror = () => resolve();
      t.onabort = () => resolve();
    });
  } catch {
    /* best effort */
  }
}

/**
 * Evict down to a byte budget.
 *
 * Order: unviewed (speculative prefetches nobody looked at) oldest-first, then
 * viewed oldest-first. Prefetched frames were still paid for, so they are not
 * discarded on arrival — they are simply first in the queue to go.
 */
export async function evict(targetBytes: number = TARGET_BYTES): Promise<number> {
  try {
    const db = await openDb();
    const rows = await wrap(tx(db, 'readonly').getAll() as IDBRequest<StoredFrame[]>);
    let total = rows.reduce((n, r) => n + r.bytes, 0);
    if (total <= targetBytes) return 0;
    // Trim to 85% of target rather than exactly to it. Evicting to the line meant
    // the very next frame crossed it again, so past the cap EVERY write triggered
    // a full scan plus an index reload — the cost arrived per-frame instead of
    // once per batch.
    targetBytes = Math.floor(targetBytes * 0.85);

    const order = rows.sort((a, b) => {
      if (a.viewed !== b.viewed) return a.viewed ? 1 : -1;
      return a.lastSeenAt - b.lastSeenAt;
    });

    let removed = 0;
    for (const row of order) {
      if (total <= targetBytes) break;
      await deleteFrame(row.key);
      total -= row.bytes;
      removed++;
    }
    return removed;
  } catch {
    return 0;
  }
}

export async function clearAllFrames(): Promise<void> {
  try {
    const db = await openDb();
    const t = db.transaction([STORE, BLOBS], 'readwrite');
    t.objectStore(STORE).clear();
    t.objectStore(BLOBS).clear();
    await new Promise<void>((resolve) => {
      t.oncomplete = () => resolve();
      t.onerror = () => resolve();
      t.onabort = () => resolve();
    });
  } catch {
    /* best effort */
  }
}

/** Rough byte cost of a frame, for quota accounting. */
export function measure(heroUrl: string): number {
  // base64 carries ~6 bits per char; the rest of the record is negligible beside it.
  return heroUrl.startsWith('data:') ? Math.round((heroUrl.length * 3) / 4) : 2048;
}

export const FRAME_STORE_TARGET_BYTES = TARGET_BYTES;
