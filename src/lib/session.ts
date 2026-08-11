/**
 * Session + Encounter model (v0.15.0 DM Mode). Pure + serializable. A Session groups Encounters for one
 * Party; an Encounter holds allies (party members + NPCs) and adversaries, a markdown log, and the
 * global-vs-local sync machinery (PRD #34–37). Deep, isolated, unit-testable — no store/IO imports.
 */
import { type AdversaryFeature, type AdversaryRole } from '@/data/adversaries';
import { type MemberMaxes, type MemberVitals, type PartyGlobalState, type Party, applyVitalDelta, presentMemberIds, setGlobalEffects, setVital, type VitalKey } from './party';
import { type AdversaryCounter, resetCounter, restartCountdowns, stepCounter } from './dm-counters';
import { type CardEffect } from './modifiers';

export const SESSION_SCHEMA_VERSION = 1;

export interface Session {
  schemaVersion: number;
  id: string;
  partyId: string;
  createdAt: string; // ISO
  name: string;
  /** v0.41.4: the same identity a campaign carries. See `lib/dm-identity`. */
  description?: string;
  color?: string;
  imageUri?: string;
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
  /** v0.16.0 (PRD #9): a downed adversary isn't deleted, it's "Fallen" with a Recover target HP. */
  fallen?: boolean;
  recoverHp?: number;
  // --- v0.17.0: full SRD stat-block detail (base-game roster + custom). All optional/additive so old
  //     saved encounters keep working; shown in the panel's expandable detail + fully editable.
  /** An image for the adversary (item 8), like a player portrait; tap to view fullscreen. */
  portraitUri?: string;
  role?: AdversaryRole;
  tier?: 1 | 2 | 3 | 4;
  difficulty?: number;
  atkMod?: string;
  attack?: { name: string; range: string; damage: string };
  damageType?: 'Physical' | 'Magic';
  motives?: string;
  experience?: string;
  features?: AdversaryFeature[];
  /**
   * COUNTERS (v0.41.3, owner): numbers this entry carries that no stat block has a place for.
   *
   * Charges, rounds, hostages, ritual steps. Additive and optional like everything else here, and
   * one of them may TAKE OVER the entry entirely, which is how a bare timer gets into an encounter
   * without pretending to be a creature. See `lib/dm-counters` for what one is and what it does.
   */
  counters?: AdversaryCounter[];
  hordeNote?: string;
  /** Provenance: the BASE_ADVERSARIES id this was spawned from (item 12). Undefined = fully custom. */
  baseGameId?: string;
  /**
   * CHARACTERIZED (v0.36, owner): this entry is backed by a real character file.
   *
   * The combatant stays where it is, on whichever side it was fighting on, and the encounter draws it
   * as a character panel instead of a stat block: real hit points, stress, hope and armor, and the
   * DM's modifier and card tools on a hold, exactly as a party member has. Keeping it a `Combatant`
   * rather than moving it into `allies` is what lets a characterized ADVERSARY go on being an
   * adversary; a character on the players' side of the fight would be the wrong fight.
   *
   * Its vitals live on the encounter (`charVitals`), not on the party, because it does not have to
   * be in the party and usually is not.
   */
  charId?: string;
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
  /** v0.41.4: the same identity a campaign and a session carry. See `lib/dm-identity`. */
  description?: string;
  color?: string;
  imageUri?: string;
  status: EncounterStatus;
  allies: Ally[];
  adversaries: Combatant[];
  log: LogEntry[];
  options: { globalSync: boolean; autoLog: boolean };
  /** Member vitals when NOT syncing to the party (PRD #37): a fully local copy for this encounter. */
  localVitals?: PartyGlobalState;
  /** Frozen party state at completion (PRD #36). Present only once completed. */
  archivedGlobal?: PartyGlobalState;
  /**
   * v0.35.1 (owner): the MODIFIERS in force when the encounter finished, frozen with the vitals.
   *
   * Modifiers themselves live where they belong (a character's on their file, the party's on the
   * party), so they already carry from one encounter to the next without help. What was missing is
   * the record: rolling back to a finished encounter's snapshot restored everyone's hit points to
   * what they were and left them under whatever modifiers happen to be in force now, which is a
   * different fight from the one being restarted.
   */
  archivedEffects?: { party: CardEffect[]; members: Record<string, CardEffect[]> };
  /** v0.36: vitals for the CHARACTERIZED entries in this encounter, keyed by character id. They are
   *  not party members, so `party.global` has nowhere to hold them and an absent entry means full. */
  charVitals?: PartyGlobalState;
  /** v0.23.0: TEMPORARY max bonuses the DM granted for this fight only — bonus HP, a bigger stress
   *  track, extra armor slots. Encounter-scoped by definition, so it evaporates with the encounter
   *  and never touches the player's character file. A PERMANENT raise lives on the party instead. */
  maxBonus?: Record<string, Partial<Record<VitalKey, number>>>;
}

/** Fold a DM-granted bonus into a member's derived maxes. */
export function bonusMaxes(base: MemberMaxes, bonus: Partial<Record<VitalKey, number>> | undefined): MemberMaxes {
  if (!bonus) return base;
  return {
    maxHp: base.maxHp + (bonus.hp ?? 0),
    stressMax: base.stressMax + (bonus.stress ?? 0),
    hopeMax: base.hopeMax + (bonus.hope ?? 0),
    armorMax: base.armorMax + (bonus.armor ?? 0),
  };
}

/** The bonus in force for a member: the encounter's temporary grant plus the party's permanent one. */
export function memberBonus(encounter: Encounter, party: Party, charId: string): Partial<Record<VitalKey, number>> {
  const tmp = encounter.maxBonus?.[charId] ?? {};
  const perm = party.maxBonus?.[charId] ?? {};
  const keys: VitalKey[] = ['hp', 'stress', 'hope', 'armor'];
  const out: Partial<Record<VitalKey, number>> = {};
  for (const k of keys) {
    const v = (tmp[k] ?? 0) + (perm[k] ?? 0);
    if (v) out[k] = v;
  }
  return out;
}

/** Grant a max bonus. `scope: 'encounter'` is the temporary one; `'party'` survives the fight. */
export function grantMaxBonus(encounter: Encounter, party: Party, charId: string, key: VitalKey, amount: number, scope: 'encounter' | 'party'): { encounter: Encounter; party: Party } {
  if (amount <= 0) return { encounter, party };
  if (scope === 'encounter') {
    const cur = encounter.maxBonus?.[charId] ?? {};
    return { encounter: { ...encounter, maxBonus: { ...encounter.maxBonus, [charId]: { ...cur, [key]: (cur[key] ?? 0) + amount } } }, party };
  }
  const cur = party.maxBonus?.[charId] ?? {};
  return { encounter, party: { ...party, maxBonus: { ...party.maxBonus, [charId]: { ...cur, [key]: (cur[key] ?? 0) + amount } } } };
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

/** Default adversary (PRD #31): "Adversary #X", starts at full 10/10 HP (v0.17.0 item 8). */
export function newAdversary(existingCount: number): Combatant {
  return { id: rid('ad'), name: `Adversary #${existingCount + 1}`, hp: 10, maxHp: 10, stress: 0, maxStress: 6, thresholds: { major: 0, severe: 0 }, description: '', show: { hp: true, thresholds: false, stress: false, description: false } };
}

export function newNpc(name: string): Combatant {
  return { id: rid('np'), name: name.trim() || 'NPC', hp: 10, maxHp: 10, stress: 0, maxStress: 6, thresholds: { major: 0, severe: 0 }, description: '', show: { hp: true, thresholds: false, stress: false, description: false } };
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

/**
 * Bring a fallen combatant back (PRD #9/#11): to its recover HP (half if it hit 0, else prior HP).
 *
 * v0.41.4 (owner): every COUNTDOWN winds back to its start as well, even one that does not loop.
 * That is the pair to the spent countdown's X: an entry that fell because its timer ran out comes
 * back with the timer reset, so a recurring threat is two presses rather than a trip to the editor.
 * Resource counters are left alone, because a supply that refills itself is not a supply.
 */
export function recover(c: Combatant): Combatant {
  return {
    ...c,
    fallen: false,
    hp: c.recoverHp ?? c.hp ?? Math.max(1, Math.ceil((c.maxHp ?? 2) / 2)),
    recoverHp: undefined,
    counters: restartCountdowns(c.counters),
  };
}

/** A fresh copy of a combatant for reuse (library spawn / encounter duplicate): new id, full HP, upright. */
export function cloneCombatant(c: Combatant, newName?: string): Combatant {
  return {
    ...c,
    id: rid('cb'),
    name: newName ?? c.name,
    hp: c.maxHp ?? c.hp ?? 0,
    stress: 0,
    fallen: false,
    recoverHp: undefined,
    // A fresh copy starts its counters where they were configured to start, for the same reason it
    // starts at full hit points: it is a new one of these, not the one that has been fighting.
    counters: c.counters?.map(resetCounter),
  };
}

/** Move one of a combatant's counters (v0.41.3). Unknown ids are left alone rather than throwing. */
export function counterDelta(c: Combatant, counterId: string, delta: number): Combatant {
  if (!c.counters) return c;
  return { ...c, counters: c.counters.map((x) => (x.id === counterId ? stepCounter(x, delta) : x)) };
}

// --- log (PRD #43-46) ------------------------------------------------------------------------------

export function appendLog(encounter: Encounter, kind: LogEntry['kind'], text: string): Encounter {
  const entry: LogEntry = { id: rid('lg'), at: new Date().toISOString(), kind, text };
  return { ...encounter, log: [entry, ...encounter.log] }; // newest first (PRD #43)
}

const STAT_LABEL: Record<VitalKey | CombatantStat, string> = { hp: 'HP', stress: 'Stress', hope: 'Hope', armor: 'Armor' };

/** The auto-log line for a stat change (PRD #45): who (side + name), what, and the resulting value. */
export function formatStatLog(side: 'Player' | 'Adversary', name: string, stat: VitalKey | CombatantStat, from: number, to: number): string {
  if (from === to) return `**${side} · ${name}**, ${STAT_LABEL[stat]} unchanged (${to})`;
  const arrow = to > from ? '▲' : '▼';
  return `**${side} · ${name}**, ${STAT_LABEL[stat]} ${arrow} ${from} → **${to}**`;
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
export function completeEncounter(session: Session, encounter: Encounter, party: Party, memberEffects: Record<string, CardEffect[]> = {}): { session: Session; encounter: Encounter } {
  const archivedGlobal: PartyGlobalState = encounter.options.globalSync ? { ...party.global } : { ...(encounter.localVitals ?? party.global) };
  // v0.35.1: the modifiers ride along with the vitals, so a rollback restores the whole fight rather
  // than half of it. Read from the caller, which is the side that can see character files.
  const archivedEffects = { party: party.globalEffects ?? [], members: memberEffects };
  return {
    session: session.activeEncounterId === encounter.id ? { ...session, activeEncounterId: undefined } : session,
    encounter: { ...encounter, status: 'completed', archivedGlobal, archivedEffects },
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
 * COPY an encounter into another session (v0.41.4, owner) — "just like cards when they get moved
 * around card categories in the character sheet".
 *
 * A copy is a NEW fight, so it is prepared whatever the original was, its adversaries and NPCs are
 * cloned rather than shared (so damage to one is not damage to the other) and it carries no log. The
 * original is untouched, which is the whole difference from a move.
 */
export function copyEncounterToSession(enc: Encounter, sessionId: string, index: number): Encounter {
  return {
    ...duplicateEncounter(enc, index),
    sessionId,
    // A duplicate names itself "Encounter #n", which is right in the session it came from and wrong
    // in a session it was deliberately copied INTO. A copy keeps the name that made it worth copying.
    name: enc.name,
  };
}

/**
 * Restart a completed encounter (PRD #11). `source` chooses which member state to continue from: 'party'
 * keeps the party's current live global; 'encounter' rewinds the party global to this encounter's archived
 * snapshot. Downed adversaries revive to half HP. Returns the pieces to persist.
 */
export function restartEncounter(session: Session, enc: Encounter, party: Party, source: 'party' | 'encounter'): { session: Session; encounter: Encounter; party: Party; restoreEffects?: { party: CardEffect[]; members: Record<string, CardEffect[]> } } {
  const rollback = source === 'encounter';
  let nextParty = rollback && enc.archivedGlobal && enc.options.globalSync ? { ...party, global: { ...party.global, ...enc.archivedGlobal } } : party;
  // Rolling back restores the modifiers the fight was fought under. The party's are ours to write;
  // the members' are on their character files, so they go back to the caller to apply.
  const restoreEffects = rollback && enc.archivedEffects ? enc.archivedEffects : undefined;
  if (restoreEffects) nextParty = setGlobalEffects(nextParty, restoreEffects.party);
  const adversaries = enc.adversaries.map((c) => (c.fallen ? recover({ ...c, recoverHp: Math.max(1, Math.ceil((c.maxHp ?? 2) / 2)) }) : c));
  const encounter: Encounter = { ...enc, status: 'active', archivedGlobal: undefined, adversaries };
  return { session: { ...session, activeEncounterId: enc.id }, encounter, party: nextParty, restoreEffects };
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

/** Keep ONLY the selected entries, erasing all others (v0.17.0 item 3: "Leave only selected"). */
export function keepOnlyLogEntries(log: LogEntry[], ids: Set<string>): LogEntry[] {
  return log.filter((e) => ids.has(e.id));
}
