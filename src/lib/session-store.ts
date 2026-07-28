/**
 * Session + Encounter persistence (v0.15.0) — sessions under documents/sessions/, encounters under
 * documents/encounters/ (each references its sessionId). Device-local; mirrors character-store. Encounter
 * mutations save immediately (PRD #27). Web uses `lib/web-store` shims.
 */
import { Platform } from 'react-native';

import { type Encounter, type Session } from './session';
import { webGet, webSet } from './web-store';

const SESSION_KEY = 'runekeep.sessions';
const ENCOUNTER_KEY = 'runekeep.encounters';
type FS = typeof import('expo-file-system');
// eslint-disable-next-line @typescript-eslint/no-require-imports
const fs = (): FS => require('expo-file-system') as FS;

function dir(name: string) {
  const { Directory, Paths } = fs();
  const d = new Directory(Paths.document, name);
  if (!d.exists) d.create({ intermediates: true });
  return d;
}
function webList<T>(key: string): T[] {
  try {
    return JSON.parse(webGet(key) ?? '[]') as T[];
  } catch {
    return [];
  }
}
function webWrite<T>(key: string, all: T[]) {
  webSet(key, JSON.stringify(all));
}
function diskList<T>(dirName: string): T[] {
  const { File } = fs();
  const files = dir(dirName).list().filter((f): f is InstanceType<typeof File> => f instanceof File && f.name.endsWith('.json'));
  const out: T[] = [];
  for (const f of files) {
    try {
      out.push(JSON.parse(f.textSync()) as T);
    } catch {
      /* skip corrupt */
    }
  }
  return out;
}

// --- sessions --------------------------------------------------------------------------------------

export async function listSessions(partyId: string): Promise<Session[]> {
  const all = Platform.OS === 'web' ? webList<Session>(SESSION_KEY) : diskList<Session>('sessions');
  return all.filter((s) => s.partyId === partyId).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export async function saveSession(session: Session): Promise<void> {
  if (Platform.OS === 'web') {
    webWrite(SESSION_KEY, [...webList<Session>(SESSION_KEY).filter((s) => s.id !== session.id), session]);
    return;
  }
  new (fs().File)(dir('sessions'), `${session.id}.json`).write(JSON.stringify(session, null, 2));
}

export async function getSession(id: string): Promise<Session | null> {
  if (Platform.OS === 'web') return webList<Session>(SESSION_KEY).find((s) => s.id === id) ?? null;
  const f = new (fs().File)(dir('sessions'), `${id}.json`);
  if (!f.exists) return null;
  try {
    return JSON.parse(f.textSync()) as Session;
  } catch {
    return null;
  }
}

export async function deleteSession(id: string): Promise<void> {
  if (Platform.OS === 'web') {
    webWrite(SESSION_KEY, webList<Session>(SESSION_KEY).filter((s) => s.id !== id));
    for (const e of webList<Encounter>(ENCOUNTER_KEY).filter((e) => e.sessionId === id)) await deleteEncounter(e.id);
    return;
  }
  const f = new (fs().File)(dir('sessions'), `${id}.json`);
  if (f.exists) f.delete();
  for (const e of diskList<Encounter>('encounters').filter((e) => e.sessionId === id)) await deleteEncounter(e.id);
}

// --- encounters ------------------------------------------------------------------------------------

export async function listEncounters(sessionId: string): Promise<Encounter[]> {
  const all = Platform.OS === 'web' ? webList<Encounter>(ENCOUNTER_KEY) : diskList<Encounter>('encounters');
  return all.filter((e) => e.sessionId === sessionId).sort((a, b) => a.index - b.index);
}

export async function saveEncounter(encounter: Encounter): Promise<void> {
  if (Platform.OS === 'web') {
    webWrite(ENCOUNTER_KEY, [...webList<Encounter>(ENCOUNTER_KEY).filter((e) => e.id !== encounter.id), encounter]);
    return;
  }
  new (fs().File)(dir('encounters'), `${encounter.id}.json`).write(JSON.stringify(encounter, null, 2));
}

export async function getEncounter(id: string): Promise<Encounter | null> {
  if (Platform.OS === 'web') return webList<Encounter>(ENCOUNTER_KEY).find((e) => e.id === id) ?? null;
  const f = new (fs().File)(dir('encounters'), `${id}.json`);
  if (!f.exists) return null;
  try {
    return JSON.parse(f.textSync()) as Encounter;
  } catch {
    return null;
  }
}

export async function deleteEncounter(id: string): Promise<void> {
  if (Platform.OS === 'web') {
    webWrite(ENCOUNTER_KEY, webList<Encounter>(ENCOUNTER_KEY).filter((e) => e.id !== id));
    return;
  }
  const f = new (fs().File)(dir('encounters'), `${id}.json`);
  if (f.exists) f.delete();
}
