/**
 * Character persistence — one JSON file per character (sharable by design, PRODUCT.md 6).
 * Native: documents/characters/*.json via expo-file-system. Web (the verify pipeline): a
 * localStorage shim with the same surface, so every screen renders + screenshots identically.
 * Export = share the JSON via the OS sheet; import = document picker -> parse -> save.
 */

import { Platform } from 'react-native';

import { type CharacterFile, parseCharacterFile, serializeCharacterFile } from './character-file';
import { embedCharacterImages } from './image-embed';
import { parseRkp, serializeRkp } from './rkp';

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
    return JSON.parse(globalThis.localStorage?.getItem(WEB_KEY) ?? '[]') as CharacterFile[];
  } catch {
    return [];
  }
}
function webWrite(all: CharacterFile[]) {
  globalThis.localStorage?.setItem(WEB_KEY, JSON.stringify(all));
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
  return out.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export async function saveCharacter(file: CharacterFile): Promise<void> {
  if (Platform.OS === 'web') {
    webWrite([...webList().filter((c) => c.id !== file.id), file]);
    return;
  }
  new (fs().File)(charactersDir(), `${file.id}.json`).write(serializeCharacterFile(file));
}

export async function getCharacter(id: string): Promise<CharacterFile | null> {
  if (Platform.OS === 'web') return webList().find((c) => c.id === id) ?? null;
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
  const f = new (fs().File)(charactersDir(), `${id}.json`);
  if (f.exists) f.delete();
}

/** Share the character as a `.rkp` file through the OS share sheet (the export path, v0.10.0). */
export async function exportCharacter(file: CharacterFile): Promise<void> {
  if (Platform.OS === 'web') return; // no share target in the verify pipeline
  const { File, Paths } = fs();
  const safe = file.name.replace(/[^\w-]+/g, '_').slice(0, 40) || 'character';
  const out = new File(Paths.cache, `${safe}.rkp`);
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
    throw new Error(`That .rkp is a ${content.kind}, not a character.`);
  } catch (e) {
    // Not an rkp envelope — fall back to the legacy `.runekeep.json` (bare CharacterFile) format.
    if (e instanceof Error && /not a character/i.test(e.message)) throw e;
    return parseCharacterFile(text);
  }
}

/** Pick a .rkp/.json, validate it, save it into the roster. Returns the imported character or null if cancelled. */
export async function importCharacter(): Promise<CharacterFile | null> {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const DocumentPicker = require('expo-document-picker') as typeof import('expo-document-picker');
  // accept any file (.rkp has no registered MIME) and validate by content
  const res = await DocumentPicker.getDocumentAsync({ type: '*/*', copyToCacheDirectory: true });
  if (res.canceled || !res.assets[0]) return null;
  if (Platform.OS === 'web') return null; // import is a device flow; the web shim has no picker file API
  const file = readCharacterText(new (fs().File)(res.assets[0].uri).textSync());
  await saveCharacter(file);
  return file;
}
