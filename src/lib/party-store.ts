/**
 * Party persistence (v0.15.0) — one JSON file per party under documents/parties/, mirroring
 * character-store. Device-local, no sharing (DM data doesn't travel). Web (verify pipeline) uses a
 * localStorage shim with the same surface.
 */
import { Platform } from 'react-native';

import { type Party } from './party';
import { webGet, webSet } from './web-store';

const WEB_KEY = 'runekeep.parties';
type FS = typeof import('expo-file-system');
// eslint-disable-next-line @typescript-eslint/no-require-imports
const fs = (): FS => require('expo-file-system') as FS;

function partiesDir() {
  const { Directory, Paths } = fs();
  const dir = new Directory(Paths.document, 'parties');
  if (!dir.exists) dir.create({ intermediates: true });
  return dir;
}

function webList(): Party[] {
  try {
    return JSON.parse(webGet(WEB_KEY) ?? '[]') as Party[];
  } catch {
    return [];
  }
}
function webWrite(all: Party[]) {
  webSet(WEB_KEY, JSON.stringify(all));
}

export async function listParties(): Promise<Party[]> {
  if (Platform.OS === 'web') return webList().sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  const { File } = fs();
  const files = partiesDir().list().filter((f): f is InstanceType<typeof File> => f instanceof File && f.name.endsWith('.json'));
  const out: Party[] = [];
  for (const f of files) {
    try {
      out.push(JSON.parse(f.textSync()) as Party);
    } catch {
      // corrupt/foreign file is simply not listed
    }
  }
  return out.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export async function saveParty(party: Party): Promise<void> {
  if (Platform.OS === 'web') {
    webWrite([...webList().filter((p) => p.id !== party.id), party]);
    return;
  }
  new (fs().File)(partiesDir(), `${party.id}.json`).write(JSON.stringify(party, null, 2));
}

export async function getParty(id: string): Promise<Party | null> {
  if (Platform.OS === 'web') return webList().find((p) => p.id === id) ?? null;
  const f = new (fs().File)(partiesDir(), `${id}.json`);
  if (!f.exists) return null;
  try {
    return JSON.parse(f.textSync()) as Party;
  } catch {
    return null;
  }
}

/**
 * Make one party the ACTIVE party (v0.18.0 item 1) — exclusive: exactly one party is active at a time
 * (the `enabled` flag now means "active"). Sets the target active, clears every other, persists only the
 * ones that changed, and returns the full updated list.
 */
export async function setActiveParty(id: string): Promise<Party[]> {
  const all = await listParties();
  const next = all.map((p) => ({ ...p, enabled: p.id === id }));
  for (let i = 0; i < all.length; i++) {
    if (all[i].enabled !== next[i].enabled) await saveParty(next[i]);
  }
  return next;
}

export async function deleteParty(id: string): Promise<void> {
  if (Platform.OS === 'web') {
    webWrite(webList().filter((p) => p.id !== id));
    return;
  }
  const f = new (fs().File)(partiesDir(), `${id}.json`);
  if (f.exists) f.delete();
}
