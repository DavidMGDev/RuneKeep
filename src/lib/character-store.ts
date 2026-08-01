/**
 * Character persistence — one JSON file per character (sharable by design, PRODUCT.md 6).
 * Native: documents/characters/*.json via expo-file-system. Web (the verify pipeline): a
 * browser store with the same surface (`lib/web-store`, IndexedDB), so every screen renders identically.
 * Export = share the JSON via the OS sheet; import = document picker -> parse -> save.
 */

import { Platform } from 'react-native';

import { type CharacterFile, parseCharacterFile, serializeCharacterFile } from './character-file';
import { embedCharacterImages } from './image-embed';
import { parseRkp, RUNE_EXT, serializeRkp } from './rkp';
import { webGet, webSet } from './web-store';

const WEB_KEY = 'runekeep.characters';

// expo-file-system's File/Directory API is native-only — a top-level import breaks the web bundle
// (the verify pipeline renders blank). Lazy-require it behind the platform check instead.
type FS = typeof import('expo-file-system');
// eslint-disable-next-line @typescript-eslint/no-require-imports
const fs = (): FS => require('expo-file-system') as FS;

function charactersDir() {
  const { Directory, Paths } = fs();
  const dir = new Directory(Paths.document, 'characters');
  if (!dir.exists) dir.create({ intermediates: true });
  return dir;
}

// --- web shim (verify pipeline + dev in browser) ---
function webList(): CharacterFile[] {
  try {
    return JSON.parse(webGet(WEB_KEY) ?? '[]') as CharacterFile[];
  } catch {
    return [];
  }
}
function webWrite(all: CharacterFile[]) {
  webSet(WEB_KEY, JSON.stringify(all));
}

/**
 * Writes waiting to reach the disk (v0.27.4).
 *
 * expo-file-system's modern API has no asynchronous write, so persisting a character means
 * `JSON.stringify` plus a whole-file write, on the JS thread, with nothing else able to run. A
 * character carries its history, and history is up to 120 SNAPSHOTS of the whole character, so that
 * is commonly a few hundred kilobytes. It used to happen on every save: every tap on the HP track
 * (after its debounce), every card toggled, every item equipped.
 *
 * The browser build pays none of it. It swaps a value in an in-memory map and persists in the
 * background, which is a fair part of why the same character feels quicker in a browser than in the
 * app built for the device.
 *
 * So do what the browser does: keep the newest version in memory, answer reads from there, and write
 * once the writes stop. Everything that reads goes through this module, so an unflushed character is
 * never visible as stale. `flushCharacters()` forces it out, and the app calls that when it goes to
 * the background, which is where a process gets killed.
 */
const pending = new Map<string, CharacterFile>();
let flushTimer: ReturnType<typeof setTimeout> | null = null;
const FLUSH_MS = 300;

function writeNow(file: CharacterFile): void {
  try {
    new (fs().File)(charactersDir(), `${file.id}.json`).write(serializeCharacterFile(file));
  } catch {
    // Keep it queued rather than lose it: the next flush tries again.
    return;
  }
  if (pending.get(file.id) === file) pending.delete(file.id);
}

/** Write every queued character out now. Safe to call at any time; a no-op when nothing is queued. */
export function flushCharacters(): void {
  if (flushTimer) {
    clearTimeout(flushTimer);
    flushTimer = null;
  }
  for (const file of [...pending.values()]) writeNow(file);
}

export async function listCharacters(): Promise<CharacterFile[]> {
  if (Platform.OS === 'web') return webList();
  const { File } = fs();
  const files = charactersDir()
    .list()
    .filter((f): f is InstanceType<typeof File> => f instanceof File && f.name.endsWith('.json'));
  const out: CharacterFile[] = [];
  for (const f of files) {
    try {
      out.push(parseCharacterFile(f.textSync()));
    } catch {
      // A corrupt/foreign file never takes the roster down; it is simply not listed.
    }
  }
  // A character whose newest version has not reached the disk yet must not be listed as it was.
  const merged = out.map((c) => pending.get(c.id) ?? c);
  const known = new Set(merged.map((c) => c.id));
  for (const [id, c] of pending) if (!known.has(id)) merged.push(c);
  return merged.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export async function saveCharacter(file: CharacterFile): Promise<void> {
  if (Platform.OS === 'web') {
    webWrite([...webList().filter((c) => c.id !== file.id), file]);
    return;
  }
  pending.set(file.id, file);
  if (!flushTimer) {
    flushTimer = setTimeout(() => {
      flushTimer = null;
      for (const queued of [...pending.values()]) writeNow(queued);
    }, FLUSH_MS);
  }
}

export async function getCharacter(id: string): Promise<CharacterFile | null> {
  if (Platform.OS === 'web') return webList().find((c) => c.id === id) ?? null;
  const queued = pending.get(id);
  if (queued) return queued;
  const f = new (fs().File)(charactersDir(), `${id}.json`);
  if (!f.exists) return null;
  try {
    return parseCharacterFile(f.textSync());
  } catch {
    return null;
  }
}

export async function deleteCharacter(id: string): Promise<void> {
  if (Platform.OS === 'web') {
    webWrite(webList().filter((c) => c.id !== id));
    return;
  }
  pending.delete(id); // a queued write must never resurrect a deleted character
  const f = new (fs().File)(charactersDir(), `${id}.json`);
  if (f.exists) f.delete();
}

/**
 * Share the character as a `.rune` file through the OS share sheet (the export path, v0.10.0).
 *
 * v0.30.1: a browser downloads it instead, the same way card and expansion exports do. It returned
 * silently before, so Export did nothing and said nothing, and a browser player had no way to get a
 * character off the machine at all. Art is left as it is on web: the images are already stored in the
 * browser rather than behind a `file://` that means nothing elsewhere.
 */
export async function exportCharacter(file: CharacterFile): Promise<void> {
  const safe = file.name.replace(/[^\w-]+/g, '_').slice(0, 40) || 'character';
  if (Platform.OS === 'web') {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([serializeRkp({ kind: 'character', payload: file })], { type: 'application/json' }));
    a.download = `${safe}.${RUNE_EXT}`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 10000);
    return;
  }
  const { File, Paths } = fs();
  const out = new File(Paths.cache, `${safe}.${RUNE_EXT}`);
  if (out.exists) out.delete();
  // v0.22.0: history travels WITH the file (owner). A shared character carries its whole story, so
  // a friend importing it — or you restoring your own backup — gets the timeline too, not just the
  // final state. Characters are never shared over NFC (only cards are), so the ~60KB tag ceiling
  // that governs card sharing does not apply here.
  // v0.23.0: the portrait and every custom card image travel WITH the file. The picker only ever
  // gave us a `file://` into this app's cache, which means nothing on the recipient's phone, so a
  // shared character used to arrive with blank art and no indication anything was missing.
  const withArt = await embedCharacterImages(file);
  out.write(serializeRkp({ kind: 'character', payload: withArt }));
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const Sharing = require('expo-sharing') as typeof import('expo-sharing');
  await Sharing.shareAsync(out.uri, { mimeType: 'application/octet-stream', dialogTitle: `Share ${file.name}` });
}

/** Read a character from text — accepts both the new `.rkp` envelope and a legacy bare CharacterFile JSON. */
export function readCharacterText(text: string): CharacterFile {
  try {
    const content = parseRkp(text);
    if (content.kind === 'character') return content.payload;
    throw new Error(`That file is a ${content.kind}, not a character.`);
  } catch (e) {
    // Not an rkp envelope — fall back to the legacy `.runekeep.json` (bare CharacterFile) format.
    if (e instanceof Error && /not a character/i.test(e.message)) throw e;
    return parseCharacterFile(text);
  }
}

/**
 * Pick a `.rune` (or the older `.rkp`/`.json`), validate it, save it into the roster. Returns the
 * imported character, or null if the picker was cancelled.
 *
 * v0.30.1: this WORKS in a browser. It used to open the picker, take the file, and return null the
 * moment it saw web, which is the worst shape a failure can have: the roster simply carried on as if
 * nothing had been chosen, and there was nothing to report because nothing had gone wrong. A browser
 * hands the picked file back as a `File` object rather than a path, which is all the difference
 * amounted to.
 */
export async function importCharacter(): Promise<CharacterFile | null> {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const DocumentPicker = require('expo-document-picker') as typeof import('expo-document-picker');
  // accept any file (.rune has no registered MIME) and validate by content
  const res = await DocumentPicker.getDocumentAsync({ type: '*/*', copyToCacheDirectory: true });
  if (res.canceled || !res.assets[0]) return null;
  const asset = res.assets[0] as { uri: string; file?: { text: () => Promise<string> } };
  // `fetch` covers the blob: URL a browser gives when the asset carries no File handle.
  const text = Platform.OS === 'web' ? (asset.file ? await asset.file.text() : await (await fetch(asset.uri)).text()) : new (fs().File)(asset.uri).textSync();
  const file = readCharacterText(text);
  await saveCharacter(file);
  return file;
}
