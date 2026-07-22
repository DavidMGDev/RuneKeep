/**
 * Session + Encounter model (v0.15.0 DM Mode). Pure + serializable. A Session groups Encounters for one
 * Party; an Encounter holds allies (party members + NPCs) and adversaries, a markdown log, and the
 * global-vs-local sync machinery (PRD #34–37). Deep, isolated, unit-testable — no store/IO imports.
 */
import { type MemberMaxes, type MemberVitals, type PartyGlobalState, type Party, applyVitalDelta, presentMemberIds, setVital, type VitalKey } from './party';

export const SESSION_SCHEMA_VERSION = 1;

export interface Session {
  schemaVersion: number;
  id: string;
  partyId: string;
  createdAt: string; // ISO
  name: string;
  /** The one encounter that may write global state (PRD #35). Undefined = none active. */
  activeEncounterId?: string;
}

/** An adversary or NPC: a name + optional, individually-shown tracks. HP/Stress only (no armor/hope, PRD #42). */
export interface Combatant {
  id: string;
  name: string;
  hp?: number;
  maxHp?: number;
  thresholds?: { major: number; severe: number };
  stress?: number;
  maxStress?: number;
  description?: string;
  /** Which fields the DM chose to display for this combatant (PRD #32). */
  show: { hp: boolean; thresholds: boolean; stress: boolean; description: boolean };
  /** v0.16.0 (PRD #9): a downed adversary isn't deleted — it's "Fallen" with a Recover target HP. */
  fallen?: boolean;
  recoverHp?: number;
}

/** An ally is either a party member (vitals resolved via the party) or a manually-added NPC (PRD #30). */
export type Ally = { kind: 'member'; charId: string } | { kind: 'npc'; combatant: Combatant };

export interface LogEntry {
  id: string;
  at: string; // ISO
  kind: 'note' | 'stat';
  text: string; // markdown
}

export type EncounterStatus = 'prepared' | 'active' | 'completed';

export interface Encounter {
  schemaVersion: number;
  id: string;
  sessionId: string;
  index: number; // 1-based (PRD #26)
  createdAt: string; // ISO
  name: string;
  status: EncounterStatus;
  allies: Ally[];
  adversaries: Combatant[];
  log: LogEntry[];
  options: { globalSync: boolean; autoLog: boolean };
  /** Member vitals when NOT syncing to the party (PRD #37): a fully local copy for this encounter. */
  localVitals?: PartyGlobalState;
  /** Frozen party state at completion (PRD #36). Present only once completed. */
  archivedGlobal?: PartyGlobalState;
}

const rid = (p: string): string => `${p}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;

export const newSessionId = (): string => rid('se');
export const newSession = (partyId: string, name: string): Session => ({
  schemaVersion: SESSION_SCHEMA_VERSION,
  id: newSessionId(),
  partyId,
  createdAt: new Date().toISOString(),
  name: name.trim() || 'New Session',
});

/** Next 1-based encounter number for a session (PRD #26): existing count + 1. */
export const nextIndex = (encounters: Encounter[]): number => encounters.length + 1;

/**
 * A fresh encounter. Present party members are auto-added as member-allies (PRD #29). Defaults: synced,
 * auto-log on. When NOT syncing later, `localVitals` is seeded lazily on first write (see memberVitals).
 */
export function newEncounter(session: Session, party: Party, index: number): Encounter {
  return {
    schemaVersion: SESSION_SCHEMA_VERSION,
    id: rid('en'),
    sessionId: session.id,
    index,
    createdAt: new Date().toISOString(),
    name: `Encounter #${index}`,
    status: 'prepared',
    allies: presentMemberIds(party).map((charId) => ({ kind: 'member', charId })),
    adversaries: [],
    log: [],
    options: { globalSync: true, autoLog: true },
  };
}

/** Default adversary (PRD #31): "Adversary #X", no tracks shown until the DM enables them. */
export function newAdversary(existingCount: number): Combatant {
  return { id: rid('ad'), name: `Adversary #${existingCount + 1}`, hp: 0, maxHp: 10, stress: 0, maxStress: 6, thresholds: { major: 0, severe: 0 }, description: '', show: { hp: true, thresholds: false, stress: false, description: false } };
}

export function newNpc(name: string): Combatant {
  return { id: rid('np'), name: name.trim() || 'NPC', hp: 0, maxHp: 10, stress: 0, maxStress: 6, thresholds: { major: 0, severe: 0 }, description: '', show: { hp: true, thresholds: false, stress: false, description: false } };
}

// --- global vs local resolution (PRD #34-37) ------------------------------------------------------
// A synced ACTIVE encounter reads/writes the party's global state. A non-synced encounter keeps its
// own localVitals. A completed encounter reads its frozen archivedGlobal. A prepared (not-active)
// encounter reads the current global (stays in sync, PRD #33) but must not WRITE it (only the active
// encounter or the party overview may, PRD #35).

/** Where a member-ally's vitals live for reading. */
export function memberVitals(encounter: Encounter, party: Party, charId: string): MemberVitals | undefined {
  if (encounter.status === 'completed') return encounter.archivedGlobal?.[charId] ?? party.global[charId];
  if (encounter.options.globalSync) return party.global[charId];
  return encounter.localVitals?.[charId] ?? party.global[charId];
}

/** Whether this encounter may currently change member vitals at all (PRD #35). */
export function canEditMembers(encounter: Encounter): boolean {
  return encounter.status === 'active';
}

/**
 * Apply a change to one member-ally's vitals. Returns the pieces that changed: an updated party (when
 * syncing) and/or an updated encounter (when local). No-op unless the encounter is active (PRD #35).
 */
export function writeMemberVitals(
  encounter: Encounter,
  party: Party,
  charId: string,
  next: MemberVitals,
): { party: Party; encounter: Encounter } {
  if (!canEditMembers(encounter)) return { party, encounter };
  if (encounter.options.globalSync) {
    return { party: { ...party, global: { ...party.global, [charId]: next } }, encounter };
  }
  const localVitals = { ...(encounter.localVitals ?? party.global), [charId]: next };
  return { party, encounter: { ...encounter, localVitals } };
}

export function memberDelta(encounter: Encounter, party: Party, charId: string, key: VitalKey, delta: number, maxes: MemberMaxes) {
  const cur = memberVitals(encounter, party, charId) ?? { hp: maxes.maxHp, stress: 0, hope: 0, armor: maxes.armorMax };
  return writeMemberVitals(encounter, party, charId, applyVitalDelta(cur, key, delta, maxes));
}

export function memberSet(encounter: Encounter, party: Party, charId: string, key: VitalKey, value: number, maxes: MemberMaxes) {
  const cur = memberVitals(encounter, party, charId) ?? { hp: maxes.maxHp, stress: 0, hope: 0, armor: maxes.armorMax };
  return writeMemberVitals(encounter, party, charId, setVital(cur, key, value, maxes));
}

// --- combatant (adversary/NPC) edits — always local to the encounter -------------------------------

const clamp = (n: number, max: number): number => Math.max(0, Math.min(max, Math.round(n)));

/** A combatant stat is `hp` or `stress`; each clamps to its own max. Others are untracked here. */
export type CombatantStat = 'hp' | 'stress';

export function mutateCombatant(list: Combatant[], id: string, fn: (c: Combatant) => Combatant): Combatant[] {
  return list.map((c) => (c.id === id ? fn(c) : c));
}

/** Apply the fallen state implied by an HP value (PRD #9): 0 → Fallen (recover to half); >0 → up. */
function withHp(c: Combatant, hp: number): Combatant {
  if (hp <= 0) return { ...c, hp: 0, fallen: true, recoverHp: c.fallen ? c.recoverHp : Math.max(1, Math.ceil((c.maxHp ?? 2) / 2)) };
  return { ...c, hp, fallen: false, recoverHp: undefined };
}

export function combatantDelta(c: Combatant, stat: CombatantStat, delta: number): Combatant {
  if (stat === 'hp') return withHp(c, clamp((c.hp ?? 0) + delta, c.maxHp ?? 0));
  return { ...c, stress: clamp((c.stress ?? 0) + delta, c.maxStress ?? 0) };
}

export function combatantSet(c: Combatant, stat: CombatantStat, value: number): Combatant {
  if (stat === 'hp') return withHp(c, clamp(value, c.maxHp ?? 0));
  return { ...c, stress: clamp(value, c.maxStress ?? 0) };
}

/** Down a combatant WITHOUT changing its stats (the X press, PRD #9): Recover restores current HP. */
export function fell(c: Combatant): Combatant {
  return { ...c, fallen: true, recoverHp: (c.hp ?? 0) > 0 ? c.hp : Math.max(1, Math.ceil((c.maxHp ?? 2) / 2)) };
}

/** Bring a fallen combatant back (PRD #9/#11): to its recover HP (half if it hit 0, else prior HP). */
export function recover(c: Combatant): Combatant {
  return { ...c, fallen: false, hp: c.recoverHp ?? c.hp ?? Math.max(1, Math.ceil((c.maxHp ?? 2) / 2)), recoverHp: undefined };
}

/** A fresh copy of a combatant for reuse (library spawn / encounter duplicate): new id, full HP, upright. */
export function cloneCombatant(c: Combatant, newName?: string): Combatant {
  return { ...c, id: rid('cb'), name: newName ?? c.name, hp: c.maxHp ?? c.hp ?? 0, stress: 0, fallen: false, recoverHp: undefined };
}

// --- log (PRD #43-46) ------------------------------------------------------------------------------

export function appendLog(encounter: Encounter, kind: LogEntry['kind'], text: string): Encounter {
  const entry: LogEntry = { id: rid('lg'), at: new Date().toISOString(), kind, text };
  return { ...encounter, log: [entry, ...encounter.log] }; // newest first (PRD #43)
}

const STAT_LABEL: Record<VitalKey | CombatantStat, string> = { hp: 'HP', stress: 'Stress', hope: 'Hope', armor: 'Armor' };

/** The auto-log line for a stat change (PRD #45): who (side + name), what, and the resulting value. */
export function formatStatLog(side: 'Player' | 'Adversary', name: string, stat: VitalKey | CombatantStat, from: number, to: number): string {
  if (from === to) return `**${side} · ${name}** — ${STAT_LABEL[stat]} unchanged (${to})`;
  const arrow = to > from ? '▲' : '▼';
  return `**${side} · ${name}** — ${STAT_LABEL[stat]} ${arrow} ${from} → **${to}**`;
}

// --- lifecycle -------------------------------------------------------------------------------------

/** Make an encounter the session's active one (PRD #21/#35). Also flips its status to 'active'. */
export function setActive(session: Session, encounter: Encounter): { session: Session; encounter: Encounter } {
  return { session: { ...session, activeEncounterId: encounter.id }, encounter: { ...encounter, status: 'active' } };
}

/**
 * Complete an encounter (PRD #36): freeze the CURRENT party global state onto the encounter as
 * `archivedGlobal`, mark it completed, and clear it as the session's active encounter. The party's live
 * `global` is left untouched so it carries forward to the next encounter.
 */
export function completeEncounter(session: Session, encounter: Encounter, party: Party): { session: Session; encounter: Encounter } {
  const archivedGlobal: PartyGlobalState = encounter.options.globalSync ? { ...party.global } : { ...(encounter.localVitals ?? party.global) };
  return {
    session: session.activeEncounterId === encounter.id ? { ...session, activeEncounterId: undefined } : session,
    encounter: { ...encounter, status: 'completed', archivedGlobal },
  };
}

/** Session's encounters newest-first, but with the active one pinned to the top (PRD #21). */
export function sortedEncounters(encounters: Encounter[], activeId?: string): Encounter[] {
  const rest = encounters.filter((e) => e.id !== activeId).sort((a, b) => b.index - a.index);
  const active = encounters.find((e) => e.id === activeId);
  return active ? [active, ...rest] : rest;
}

/** Duplicate an encounter for reuse (PRD #9): fresh id, new index, prepared, upright combatants, no log. */
export function duplicateEncounter(enc: Encounter, index: number): Encounter {
  return {
    ...enc,
    id: rid('en'),
    index,
    createdAt: new Date().toISOString(),
    name: `Encounter #${index}`,
    status: 'prepared',
    allies: enc.allies.map((a) => (a.kind === 'npc' ? { kind: 'npc', combatant: cloneCombatant(a.combatant) } : a)),
    adversaries: enc.adversaries.map((c) => cloneCombatant(c)),
    log: [],
    localVitals: undefined,
    archivedGlobal: undefined,
  };
}

/** Move an encounter to another session (PRD #8) with a new index there. */
export function moveEncounterToSession(enc: Encounter, sessionId: string, index: number): Encounter {
  return { ...enc, sessionId, index, status: enc.status === 'active' ? 'prepared' : enc.status };
}

/**
 * Restart a completed encounter (PRD #11). `source` chooses which member state to continue from: 'party'
 * keeps the party's current live global; 'encounter' rewinds the party global to this encounter's archived
 * snapshot. Downed adversaries revive to half HP. Returns the pieces to persist.
 */
export function restartEncounter(session: Session, enc: Encounter, party: Party, source: 'party' | 'encounter'): { session: Session; encounter: Encounter; party: Party } {
  const nextParty = source === 'encounter' && enc.archivedGlobal && enc.options.globalSync ? { ...party, global: { ...party.global, ...enc.archivedGlobal } } : party;
  const adversaries = enc.adversaries.map((c) => (c.fallen ? recover({ ...c, recoverHp: Math.max(1, Math.ceil((c.maxHp ?? 2) / 2)) }) : c));
  const encounter: Encounter = { ...enc, status: 'active', archivedGlobal: undefined, adversaries };
  return { session: { ...session, activeEncounterId: enc.id }, encounter, party: nextParty };
}

/** Move a log entry to an earlier (lower index = newer) position (PRD #18: notes only, enforced by UI). */
export function moveLogEntry(log: LogEntry[], id: string, toIndex: number): LogEntry[] {
  const from = log.findIndex((e) => e.id === id);
  if (from < 0) return log;
  const next = [...log];
  const [entry] = next.splice(from, 1);
  next.splice(Math.max(0, Math.min(next.length, toIndex)), 0, entry);
  return next;
}

/** Edit a log entry's text in place (PRD #5). */
export function editLogEntry(log: LogEntry[], id: string, text: string): LogEntry[] {
  return log.map((e) => (e.id === id ? { ...e, text } : e));
}

/** Delete log entries by id (PRD #18: auto/stat entries deletable via multi-select). */
export function deleteLogEntries(log: LogEntry[], ids: Set<string>): LogEntry[] {
  return log.filter((e) => !ids.has(e.id));
}
