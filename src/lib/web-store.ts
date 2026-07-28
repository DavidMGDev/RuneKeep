/**
 * Browser persistence (v0.24.2).
 *
 * Every store on web wrote to `localStorage`, which is capped around 5 MB per origin. Characters are
 * a few KB each, so a roster is fine, but a portrait or a custom card image picked in a browser is
 * stored INLINE as a data URI, and a handful of those fills the quota. `localStorage` then throws
 * rather than degrading, so the failure is a save that silently does not happen.
 *
 * IndexedDB has no practical cap (browsers grant a share of free disk, typically hundreds of MB and
 * up), which is the actual fix. The awkward part is that it is asynchronous and several stores read
 * synchronously by design: `loadDraft`, `shouldShow`, `applyStoredMute` all answer during render.
 *
 * So this is a **synchronous in-memory map that persists asynchronously behind itself.** The map is
 * hydrated once from IndexedDB before the app renders (`_layout` blocks on it, alongside the fonts),
 * and every read after that is a map lookup. Writes update the map immediately and queue the
 * IndexedDB put. Every store therefore keeps the exact shape it already had, sync or async, and none
 * of them had to change beyond which three functions they call.
 *
 * If IndexedDB is unavailable (private mode in some browsers, ancient engines), it falls back to
 * `localStorage` and behaves exactly as it did before, quota and all. Existing browser data is
 * migrated on first hydrate, so nobody loses a roster to this change.
 *
 * Native never touches any of it: the callers are all inside `Platform.OS === 'web'` branches, and
 * `hydrateWebStore` returns immediately off web.
 */

import { Platform } from 'react-native';

const DB_NAME = 'runekeep';
const DB_VERSION = 1;
const STORE = 'kv';

/** The keys the app owns, so migration knows what to look for in `localStorage`. */
const OWNED_KEYS = [
  'runekeep.characters',
  'runekeep.library',
  'runekeep.adversaries',
  'runekeep.draft',
  'runekeep.parties',
  'runekeep.sessions',
  'runekeep.encounters',
  'runekeep.folders',
  'runekeep.onboarding',
  'runekeep.dmMode',
  'runekeep.uiMuted',
];

const mem = new Map<string, string>();
let backend: 'idb' | 'local' = 'local';
let hydration: Promise<void> | null = null;

function idb(): IDBFactory | null {
  const f = (globalThis as { indexedDB?: IDBFactory }).indexedDB;
  return f ?? null;
}

function open(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const factory = idb();
    if (!factory) return reject(new Error('no indexedDB'));
    const req = factory.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      if (!req.result.objectStoreNames.contains(STORE)) req.result.createObjectStore(STORE);
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error ?? new Error('indexedDB open failed'));
  });
}

function readAll(db: IDBDatabase): Promise<[IDBValidKey[], unknown[]]> {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readonly');
    const store = tx.objectStore(STORE);
    const keys = store.getAllKeys();
    const values = store.getAll();
    tx.oncomplete = () => resolve([keys.result, values.result]);
    tx.onerror = () => reject(tx.error ?? new Error('indexedDB read failed'));
  });
}

let db: IDBDatabase | null = null;

/**
 * Load everything into memory. Call once, before the first render.
 *
 * Resolves even when it fails: a browser that cannot give us IndexedDB still gets a working app on
 * `localStorage`, which is what it had before.
 */
export function hydrateWebStore(): Promise<void> {
  // Memoised, not flag-guarded: a flag set before the await lets a second caller through while the
  // first is still reading, and the gate would open on an empty map. React's dev-mode double effect
  // invocation is exactly that second caller.
  hydration ??= run();
  return hydration;
}

async function run(): Promise<void> {
  if (Platform.OS !== 'web') return;
  try {
    db = await open();
    backend = 'idb';
    const [keys, values] = await readAll(db);
    keys.forEach((k, i) => {
      const v = values[i];
      if (typeof k === 'string' && typeof v === 'string') mem.set(k, v);
    });
    // First run after the upgrade: bring across whatever the browser already had.
    if (mem.size === 0) migrateFromLocalStorage();
  } catch {
    backend = 'local';
    for (const key of OWNED_KEYS) {
      const v = globalThis.localStorage?.getItem(key);
      if (v != null) mem.set(key, v);
    }
  }
}

function migrateFromLocalStorage(): void {
  for (const key of OWNED_KEYS) {
    const v = globalThis.localStorage?.getItem(key);
    if (v == null) continue;
    mem.set(key, v);
    put(key, v);
  }
  // Deliberately NOT clearing localStorage: if this build is rolled back, the old one still reads.
}

function put(key: string, value: string | null): void {
  if (backend !== 'idb' || !db) {
    try {
      if (value == null) globalThis.localStorage?.removeItem(key);
      else globalThis.localStorage?.setItem(key, value);
    } catch {
      // The quota this module exists to escape. Memory still holds it for this session.
    }
    return;
  }
  try {
    const tx = db.transaction(STORE, 'readwrite');
    const store = tx.objectStore(STORE);
    if (value == null) store.delete(key);
    else store.put(value, key);
  } catch {
    // A failed put loses the write on reload, not in this session. Nothing to usefully retry.
  }
}

/** Read. Synchronous by design: several stores answer during render. */
export function webGet(key: string): string | null {
  return mem.get(key) ?? null;
}

/** Write. Visible immediately; persisted behind you. */
export function webSet(key: string, value: string): void {
  mem.set(key, value);
  put(key, value);
}

export function webRemove(key: string): void {
  mem.delete(key);
  put(key, null);
}

/** Which backend hydration settled on. For diagnostics and tests. */
export function webBackend(): 'idb' | 'local' {
  return backend;
}

/** Test seam. */
export function resetWebStore(): void {
  mem.clear();
  db = null;
  backend = 'local';
  hydration = null;
}
