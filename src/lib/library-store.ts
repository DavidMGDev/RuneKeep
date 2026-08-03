/**
 * Library persistence (v0.10.0) — one JSON file per EXPANSION under documents/library/, mirroring
 * character-store. App-level, independent of any character. Export/import use the shared `.rkp`
 * envelope through the OS share sheet + document picker (the same stack characters already use).
 * Web uses `lib/web-store` (IndexedDB) with the same surface.
 */
import { Platform } from 'react-native';

import { type Expansion, type LibraryCard, mergeDecision } from './library';
import { parseRkp, type RkpContent, RUNE_EXT, serializeRkp } from './rkp';
import { webGet, webSet } from './web-store';

const WEB_KEY = 'runekeep.library';

type FS = typeof import('expo-file-system');
// eslint-disable-next-line @typescript-eslint/no-require-imports
const fs = (): FS => require('expo-file-system') as FS;

function libraryDir() {
  const { Directory, Paths } = fs();
  const dir = new Directory(Paths.document, 'library');
  if (!dir.exists) dir.create({ intermediates: true });
  return dir;
}

function webList(): Expansion[] {
  try {
    return JSON.parse(webGet(WEB_KEY) ?? '[]') as Expansion[];
  } catch {
    return [];
  }
}
function webWrite(all: Expansion[]) {
  webSet(WEB_KEY, JSON.stringify(all));
}

export async function listExpansions(): Promise<Expansion[]> {
  if (Platform.OS === 'web') return webList().sort((a, b) => a.name.localeCompare(b.name));
  const { File } = fs();
  const files = libraryDir()
    .list()
    .filter((f): f is InstanceType<typeof File> => f instanceof File && f.name.endsWith('.json'));
  const out: Expansion[] = [];
  for (const f of files) {
    try {
      out.push(JSON.parse(f.textSync()) as Expansion);
    } catch {
      // a corrupt/foreign file is simply not listed
    }
  }
  return out.sort((a, b) => a.name.localeCompare(b.name));
}

export async function saveExpansion(exp: Expansion): Promise<void> {
  if (Platform.OS === 'web') {
    webWrite([...webList().filter((e) => e.id !== exp.id), exp]);
    return;
  }
  new (fs().File)(libraryDir(), `${exp.id}.json`).write(JSON.stringify(exp, null, 2));
}

export async function getExpansion(id: string): Promise<Expansion | null> {
  if (Platform.OS === 'web') return webList().find((e) => e.id === id) ?? null;
  const f = new (fs().File)(libraryDir(), `${id}.json`);
  if (!f.exists) return null;
  try {
    return JSON.parse(f.textSync()) as Expansion;
  } catch {
    return null;
  }
}

/** Enable/disable an installed expansion (v0.10.3): non-destructive — only hides its content from
 *  creation + ADD GEAR. Characters already using its cards keep them (they're embedded on the file). */
export async function setExpansionEnabled(id: string, enabled: boolean): Promise<void> {
  const exp = await getExpansion(id);
  if (exp) await saveExpansion({ ...exp, enabled });
}

export async function deleteExpansion(id: string): Promise<void> {
  if (Platform.OS === 'web') {
    webWrite(webList().filter((e) => e.id !== id));
    return;
  }
  const f = new (fs().File)(libraryDir(), `${id}.json`);
  if (f.exists) f.delete();
}

/**
 * Can this device hand a file to ANOTHER APP, or only save it? (v0.32.0)
 *
 * Native always can: `expo-sharing` opens the OS share sheet. A browser can only if it implements
 * the Web Share API for files, which phones do (Android Chrome, iOS Safari, including installed
 * PWAs) and desktops generally do not. That difference is worth surfacing, because "Share File" is a
 * promise: on a desktop the file goes to the downloads folder and nothing else happens, and calling
 * that sharing would be a small lie repeated every time.
 */
export function canShareFiles(): boolean {
  if (Platform.OS !== 'web') return true;
  try {
    const n = navigator as Navigator & { canShare?: (d: { files?: File[] }) => boolean };
    if (typeof n.share !== 'function' || typeof n.canShare !== 'function' || typeof (globalThis as { File?: unknown }).File === 'undefined') return false;
    // The spec requires testing with a real file: several browsers expose `share` but refuse files.
    return n.canShare({ files: [webShareFile('.', `probe.${RUNE_EXT}`)] });
  } catch {
    return false;
  }
}

/** A browser `File`, reached through globalThis because `File` in these modules is expo-file-system's. */
export const webShareFile = (text: string, name: string): File => new (globalThis as unknown as { File: typeof File }).File([text], name, { type: 'application/json' });

/** "Share File" where it will really share; "Export to File" where it can only save. */
export const shareFileLabel = (): string => (canShareFiles() ? 'Share File' : 'Export to File');

/**
 * Share an expansion (or any RkpContent) as a `.rune` file (v0.30.0, both platforms).
 *
 * Native goes through the OS share sheet, so the file can go straight into WhatsApp or Drive.
 * v0.32.0: a BROWSER does too, where it has one. A phone browser can hand the file to any app on the
 * device through the Web Share API, which is the same thing the native build does; a desktop cannot,
 * so it falls back to the download it always did.
 */
export async function exportRkp(content: RkpContent, filename: string): Promise<void> {
  const safe = filename.replace(/[^\w-]+/g, '_').slice(0, 40) || 'runekeep';
  const text = serializeRkp(content);
  if (Platform.OS === 'web') {
    if (canShareFiles()) {
      try {
        await navigator.share({ files: [webShareFile(text, `${safe}.${RUNE_EXT}`)], title: filename });
        return;
      } catch (e) {
        // Cancelling the share sheet is a decision, not a failure: do NOT then download it anyway.
        if ((e as { name?: string })?.name === 'AbortError') return;
        // Anything else (no handler, a browser that lied about canShare) falls through to the download.
      }
    }
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([text], { type: 'application/json' }));
    a.download = `${safe}.${RUNE_EXT}`;
    a.click();
    // Revoking immediately can cancel the download in Safari; a tick is enough everywhere.
    setTimeout(() => URL.revokeObjectURL(a.href), 10000);
    return;
  }
  const { File, Paths } = fs();
  const out = new File(Paths.cache, `${safe}.${RUNE_EXT}`);
  if (out.exists) out.delete();
  out.write(text);
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const Sharing = require('expo-sharing') as typeof import('expo-sharing');
  await Sharing.shareAsync(out.uri, { mimeType: 'application/octet-stream', dialogTitle: `Share ${filename}` });
}

export interface ImportExpansionResult {
  expansion: Expansion;
  /** What happened against the installed library: a fresh add, an in-place update, or skipped. */
  decision: 'add' | 'update' | 'skip' | 'same';
}

/**
 * Import an expansion `.rkp`, applying version-aware update-in-place. Returns the resulting expansion
 * and the decision taken. A `skip` (older incoming) leaves the library untouched; pass `force` to
 * overwrite anyway. Throws if the picked file isn't an expansion `.rkp`.
 */
export async function importExpansionRkp(force = false): Promise<ImportExpansionResult | null> {
  const content = await pickRkp();
  if (!content) return null;
  if (content.kind !== 'expansion') throw new Error(`That file is a ${content.kind}, not an expansion.`);
  const incoming = content.payload;
  const existing = (await getExpansion(incoming.id)) ?? undefined;
  const decision = mergeDecision(existing, incoming);
  if (decision === 'add' || decision === 'update' || decision === 'same' || force) {
    await saveExpansion(incoming);
    return { expansion: incoming, decision: force && decision === 'skip' ? 'update' : decision };
  }
  return { expansion: existing!, decision: 'skip' };
}

/** Open the document picker and parse the chosen file. Returns null if cancelled. Both platforms
 *  since v0.30.0: a browser hands back a `File`, a phone hands back a cached path. */
export async function pickRkp(): Promise<RkpContent | null> {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const DocumentPicker = require('expo-document-picker') as typeof import('expo-document-picker');
  // .rune has no registered MIME on Android (resolves to octet-stream) so we accept any file and
  // validate by content — restricting to application/json would grey out the files in the picker.
  const res = await DocumentPicker.getDocumentAsync({ type: '*/*', copyToCacheDirectory: true });
  if (res.canceled || !res.assets[0]) return null;
  const asset = res.assets[0] as { uri: string; file?: { text: () => Promise<string> } };
  if (Platform.OS === 'web') return parseRkp(asset.file ? await asset.file.text() : await (await fetch(asset.uri)).text());
  return parseRkp(new (fs().File)(asset.uri).textSync());
}

/**
 * Pick a file and read the CARDS out of it (v0.30.0), for importing straight onto a character.
 *
 * Any RuneKeep file that carries cards works, whether it holds one or a whole expansion, because the
 * person sending it should not have to know which kind they exported. A character file is the one
 * thing this cannot use: it is a hero, not a stack of cards, and saying so is more use than a
 * validation error.
 */
export async function pickCards(): Promise<LibraryCard[] | null> {
  const content = await pickRkp();
  if (!content) return null;
  if (content.kind === 'card') return [content.payload];
  if (content.kind === 'expansion') {
    if (!content.payload.cards.length) throw new Error('That file has no cards in it.');
    return content.payload.cards;
  }
  throw new Error('That file is a character, not cards. Import it from the Characters screen.');
}
