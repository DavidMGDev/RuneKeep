/**
 * Party model (v0.15.0 DM Mode) — a DM's named collection of device characters plus the party's
 * LIVING vitals ("global state", PRD #34). Pure + serializable: no requires, no derived state, no
 * character-file import (keeps it a deep, isolated, unit-testable module). Maxes are derived by the
 * caller from each character's sheet and passed IN, so this module clamps without knowing the sheet.
 */

/** One member's current tracked vitals. Maxes are derived live from the character file, never stored. */
export interface MemberVitals {
  hp: number;
  stress: number;
  hope: number;
  armor: number;
}
/** The ceilings each vital clamps to (from the character's computed sheet). */
export interface MemberMaxes {
  maxHp: number;
  stressMax: number;
  hopeMax: number;
  armorMax: number;
}
export type VitalKey = keyof MemberVitals;

/** Per-member current vitals — the party's shared "global" state (PRD #34). Keyed by character id. */
export type PartyGlobalState = Record<string, MemberVitals>;

export interface Party {
  /** v0.23.0: PERMANENT max bonuses the DM granted, per character. Kept on the party rather than
   *  written into the player's character file, which belongs to the player. */
  maxBonus?: Record<string, Partial<Record<VitalKey, number>>>;
  schemaVersion: number;
  id: string;
  createdAt: string; // ISO
  name: string;
  color: string;
  /** Character ids, in pick order. */
  memberIds: string[];
  /** Present/absent per member (PRD #16). Absent members aren't auto-added to encounters. */
  present: Record<string, boolean>;
  /** Enabled once populated (PRD #17) — gates the Sessions button for this party. */
  enabled: boolean;
  global: PartyGlobalState;
}

export const PARTY_SCHEMA_VERSION = 1;

/** Sampled identity colours (mirrors DomainColors) — party/folder colour is random from this set,
 *  re-rollable but never hand-picked (PRD #8), matching how the app assigns identity colour. */
export const RANDOM_COLORS = ['#905F9E', '#9E2E28', '#28699E', '#B43675', '#289E58', '#C8AA32', '#BA682E', '#7A56A0', '#A82A2A', '#B5B69E'] as const;

export function randomColor(): string {
  return RANDOM_COLORS[Math.floor(Math.random() * RANDOM_COLORS.length)];
}

export function newPartyId(): string {
  return `pt-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

export function newParty(name: string): Party {
  return {
    schemaVersion: PARTY_SCHEMA_VERSION,
    id: newPartyId(),
    createdAt: new Date().toISOString(),
    name: name.trim() || 'New Party',
    color: randomColor(),
    memberIds: [],
    present: {},
    enabled: false,
    global: {},
  };
}

const clamp = (n: number, max: number): number => Math.max(0, Math.min(max, Math.round(n)));

/** Clamp a whole vitals bag to its maxes (used when a member's sheet changed between sessions). */
export function clampVitals(v: MemberVitals, m: MemberMaxes): MemberVitals {
  return { hp: clamp(v.hp, m.maxHp), stress: clamp(v.stress, m.stressMax), hope: clamp(v.hope, m.hopeMax), armor: clamp(v.armor, m.armorMax) };
}

const MAX_FOR: Record<VitalKey, keyof MemberMaxes> = { hp: 'maxHp', stress: 'stressMax', hope: 'hopeMax', armor: 'armorMax' };

export function applyVitalDelta(v: MemberVitals, key: VitalKey, delta: number, m: MemberMaxes): MemberVitals {
  return { ...v, [key]: clamp(v[key] + delta, m[MAX_FOR[key]]) };
}

export function setVital(v: MemberVitals, key: VitalKey, value: number, m: MemberMaxes): MemberVitals {
  return { ...v, [key]: clamp(value, m[MAX_FOR[key]]) };
}

/** Add characters to the party (idempotent by id), seeding each one's global vitals + present flag. */
export function addMembers(party: Party, entries: { charId: string; vitals: MemberVitals }[]): Party {
  const memberIds = [...party.memberIds];
  const present = { ...party.present };
  const global = { ...party.global };
  for (const e of entries) {
    if (!memberIds.includes(e.charId)) memberIds.push(e.charId);
    if (present[e.charId] === undefined) present[e.charId] = true;
    if (global[e.charId] === undefined) global[e.charId] = e.vitals;
  }
  return { ...party, memberIds, present, global };
}

export function removeMember(party: Party, charId: string): Party {
  const present = { ...party.present };
  const global = { ...party.global };
  delete present[charId];
  delete global[charId];
  return { ...party, memberIds: party.memberIds.filter((id) => id !== charId), present, global };
}

export function togglePresent(party: Party, charId: string): Party {
  return { ...party, present: { ...party.present, [charId]: !(party.present[charId] ?? true) } };
}

export function isPresent(party: Party, charId: string): boolean {
  return party.present[charId] ?? true;
}

/** The character ids that join an encounter as allies by default (PRD #29): members toggled present. */
export function presentMemberIds(party: Party): string[] {
  return party.memberIds.filter((id) => isPresent(party, id));
}

export function partyIsPopulated(party: Party): boolean {
  return party.memberIds.length > 0;
}

/** Write one member's vitals into the party's global state (PRD #35: party overview / active encounter). */
export function setMemberVitals(party: Party, charId: string, v: MemberVitals): Party {
  return { ...party, global: { ...party.global, [charId]: v } };
}
