/**
 * Library persistence (v0.10.0) — one JSON file per EXPANSION under documents/library/, mirroring
 * character-store. App-level, independent of any character. Export/import use the shared `.rkp`
 * envelope through the OS share sheet + document picker (the same stack characters already use).
 * Web (verify pipeline) uses a localStorage shim with the same surface.
 */
import { Platform } from 'react-native';

import { type Expansion, mergeDecision } from './library';
import { parseRkp, type RkpContent, serializeRkp } from './rkp';

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
    return JSON.parse(globalThis.localStorage?.getItem(WEB_KEY) ?? '[]') as Expansion[];
  } catch {
    return [];
  }
}
function webWrite(all: Expansion[]) {
  globalThis.localStorage?.setItem(WEB_KEY, JSON.stringify(all));
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

export async function deleteExpansion(id: string): Promise<void> {
  if (Platform.OS === 'web') {
    webWrite(webList().filter((e) => e.id !== id));
    return;
  }
  const f = new (fs().File)(libraryDir(), `${id}.json`);
  if (f.exists) f.delete();
}

/** Share an expansion (or any RkpContent) as a `.rkp` file via the OS share sheet. */
export async function exportRkp(content: RkpContent, filename: string): Promise<void> {
  if (Platform.OS === 'web') return; // no share target in the verify pipeline
  const { File, Paths } = fs();
  const safe = filename.replace(/[^\w-]+/g, '_').slice(0, 40) || 'runekeep';
  const out = new File(Paths.cache, `${safe}.rkp`);
  if (out.exists) out.delete();
  out.write(serializeRkp(content));
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
  if (content.kind !== 'expansion') throw new Error(`That .rkp is a ${content.kind}, not an expansion.`);
  const incoming = content.payload;
  const existing = (await getExpansion(incoming.id)) ?? undefined;
  const decision = mergeDecision(existing, incoming);
  if (decision === 'add' || decision === 'update' || decision === 'same' || force) {
    await saveExpansion(incoming);
    return { expansion: incoming, decision: force && decision === 'skip' ? 'update' : decision };
  }
  return { expansion: existing!, decision: 'skip' };
}

/** Open the document picker and parse the chosen file as `.rkp`. Returns null if cancelled. */
export async function pickRkp(): Promise<RkpContent | null> {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const DocumentPicker = require('expo-document-picker') as typeof import('expo-document-picker');
  // .rkp has no registered MIME on Android (resolves to octet-stream) so we accept any file and
  // validate by content — restricting to application/json would grey out .rkp files in the picker.
  const res = await DocumentPicker.getDocumentAsync({ type: '*/*', copyToCacheDirectory: true });
  if (res.canceled || !res.assets[0]) return null;
  if (Platform.OS === 'web') return null; // device-only flow
  return parseRkp(new (fs().File)(res.assets[0].uri).textSync());
}
