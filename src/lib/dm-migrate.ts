/**
 * Reading DM data written by an OLDER build (v0.41.4, owner) — the whole of "nothing may be lost".
 *
 * The owner's rule is stated as strongly as any rule in this project: "It is priority that the
 * migration / update of older versions (even not the latest one, maybe a few versions back) be
 * flawless so that no data is lost. Nothing can break, no data can be lost even if an error occurs."
 *
 * ## Why this is a READ and not a rewrite
 *
 * The obvious shape for a migration is a one-shot pass on startup that rewrites every record. It has
 * a moment in the middle where the old data is gone and the new data is not yet on disk, and if the
 * app dies in that moment the DM's campaign dies with it. A tolerant READ has no such moment: the
 * same record is repaired every time it is loaded, for as long as nobody writes it back, and a build
 * that crashes mid-load has changed nothing at all.
 *
 * It also survives skipping versions, which the owner asked for specifically. There is no chain of
 * migrations to walk, because every function here takes a value of unknown shape and answers the same
 * question: is there a usable record in this, and what are its missing fields?
 *
 * ## What it does NOT do
 *
 * It does not delete unknown fields. A build older than the store is a real case (the owner tests on
 * a phone and a browser that update at different times), and dropping a field this version has not
 * heard of would turn "your new build read my data" into "your new build ate my data".
 */

import { type Encounter, type Session } from './session';
import { type Party } from './party';

/** A record with no id or no createdAt cannot be addressed or ordered, and is not a record. */
const str = (v: unknown): string | undefined => (typeof v === 'string' && v.length > 0 ? v : undefined);
const num = (v: unknown): number | undefined => (typeof v === 'number' && Number.isFinite(v) ? v : undefined);

/** A colour we can paint with, or nothing. Anything else in the field is treated as absent. */
const color = (v: unknown): string | undefined => (typeof v === 'string' && /^#[0-9a-fA-F]{3,8}$/.test(v) ? v : undefined);

const EPOCH = '1970-01-01T00:00:00.000Z';

/**
 * A party, from any version.
 *
 * `enabled` is FORCED TRUE (v0.41.4). It used to mean "this is the active party", the one whose
 * sessions the Sessions screen was looking at, and a party without it could not be opened at all. The
 * concept is gone, so a party that was not the chosen one must not stay locked out: that is exactly
 * the "no data lost" case, because those sessions were still on disk and simply unreachable.
 *
 * The field itself is kept rather than deleted so a record written here is still well formed to an
 * older build that reads it.
 */
export function migrateParty(raw: unknown): Party | null {
  if (!raw || typeof raw !== 'object') return null;
  const p = raw as Record<string, unknown>;
  const id = str(p.id);
  if (!id) return null;
  return {
    ...(p as unknown as Party),
    id,
    schemaVersion: num(p.schemaVersion) ?? 1,
    createdAt: str(p.createdAt) ?? EPOCH,
    name: str(p.name) ?? 'Campaign',
    color: color(p.color) ?? '#8A8F98',
    memberIds: Array.isArray(p.memberIds) ? (p.memberIds.filter((x) => typeof x === 'string') as string[]) : [],
    present: p.present && typeof p.present === 'object' ? (p.present as Record<string, boolean>) : {},
    enabled: true,
    global: p.global && typeof p.global === 'object' ? (p.global as Party['global']) : {},
    description: str(p.description),
    imageUri: str(p.imageUri),
  };
}

/** A session, from any version. Identity fields are optional and simply absent on an old record. */
export function migrateSession(raw: unknown): Session | null {
  if (!raw || typeof raw !== 'object') return null;
  const s = raw as Record<string, unknown>;
  const id = str(s.id);
  const partyId = str(s.partyId);
  if (!id || !partyId) return null;
  return {
    ...(s as unknown as Session),
    id,
    partyId,
    schemaVersion: num(s.schemaVersion) ?? 1,
    createdAt: str(s.createdAt) ?? EPOCH,
    name: str(s.name) ?? 'Session',
    description: str(s.description),
    color: color(s.color),
    imageUri: str(s.imageUri),
  };
}

/**
 * An encounter, from any version.
 *
 * The lists are rebuilt defensively because they are the part with real content in them: an encounter
 * whose `adversaries` came back as something other than an array would take the whole encounter list
 * down at render, and one bad fight must never cost a DM the rest of the night.
 */
export function migrateEncounter(raw: unknown): Encounter | null {
  if (!raw || typeof raw !== 'object') return null;
  const e = raw as Record<string, unknown>;
  const id = str(e.id);
  const sessionId = str(e.sessionId);
  if (!id || !sessionId) return null;
  const status = e.status === 'active' || e.status === 'completed' || e.status === 'prepared' ? e.status : 'prepared';
  return {
    ...(e as unknown as Encounter),
    id,
    sessionId,
    schemaVersion: num(e.schemaVersion) ?? 1,
    index: num(e.index) ?? 1,
    createdAt: str(e.createdAt) ?? EPOCH,
    name: str(e.name) ?? 'Encounter',
    status,
    allies: Array.isArray(e.allies) ? (e.allies as Encounter['allies']) : [],
    adversaries: Array.isArray(e.adversaries) ? (e.adversaries as Encounter['adversaries']) : [],
    log: Array.isArray(e.log) ? (e.log as Encounter['log']) : [],
    options: e.options && typeof e.options === 'object' ? (e.options as Encounter['options']) : { globalSync: false, autoLog: true },
    description: str(e.description),
    color: color(e.color),
    imageUri: str(e.imageUri),
    // v0.42.0: an order written by a newer build survives, and a malformed one is simply absent.
    order: e.order && typeof e.order === 'object' ? (e.order as Encounter['order']) : undefined,
  };
}

/**
 * Map a whole list through one of the above and drop what could not be repaired.
 *
 * A single unreadable record must cost that record and nothing else. This is the reason the stores
 * call a mapper rather than a cast: a cast is a promise about data we did not write.
 */
export function migrateList<T>(raw: unknown, one: (v: unknown) => T | null): T[] {
  if (!Array.isArray(raw)) return [];
  const out: T[] = [];
  for (const item of raw) {
    try {
      const r = one(item);
      if (r) out.push(r);
    } catch {
      // A record that throws on repair is a record we cannot have. Skip it; keep the list.
    }
  }
  return out;
}
