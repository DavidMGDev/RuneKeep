/**
 * Adversary library (v0.16.0, PRD #10/#17) — a device-local list of saved combatant templates. A single
 * held adversary can be saved here and later spawned into an encounter as an adversary OR an ally NPC.
 * Reducers are pure; load/save persist the one singleton (mirrors folders.ts).
 */
import { Platform } from 'react-native';

import { type BaseAdversary } from '@/data/adversaries';
import { type Combatant } from './session';

/** A stored template — the combatant shape minus its live/fallen state (reset on spawn via cloneCombatant). */
export type SavedAdversary = Combatant;

const rid = (): string => `sa-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;

/** Turn a Base Game roster entry into a fresh, full-HP Combatant instance (v0.17.0 items 10/11) —
 *  unique id so editing a spawned copy never touches the saved/base record. */
export function baseToCombatant(b: BaseAdversary): Combatant {
  const parts = b.thresholds.includes('/') ? b.thresholds.split('/').map((n) => parseInt(n, 10) || 0) : [0, 0];
  return {
    id: `ad-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`,
    name: b.name,
    hp: b.hp, maxHp: b.hp, stress: 0, maxStress: b.stress,
    thresholds: { major: parts[0], severe: parts[1] },
    description: b.description,
    show: { hp: true, thresholds: b.thresholds !== 'None', stress: b.stress > 0, description: true },
    role: b.role, tier: b.tier, difficulty: b.difficulty, atkMod: b.atk,
    attack: { name: b.attackName, range: b.attackRange, damage: b.attackDamage },
    damageType: b.damageType, motives: b.motives, experience: b.experience,
    features: b.features, hordeNote: b.hordeNote, baseGameId: b.id,
  };
}

// --- pure reducers ---------------------------------------------------------------------------------

export function addTemplate(list: SavedAdversary[], c: Combatant): SavedAdversary[] {
  return [...list, { ...c, id: rid(), fallen: false, recoverHp: undefined, hp: c.maxHp ?? c.hp ?? 0, stress: 0 }];
}

export function removeTemplates(list: SavedAdversary[], ids: Set<string>): SavedAdversary[] {
  return list.filter((t) => !ids.has(t.id));
}

// --- persistence (device-local singleton) ----------------------------------------------------------

const WEB_KEY = 'runekeep.adversaries';
type FS = typeof import('expo-file-system');
// eslint-disable-next-line @typescript-eslint/no-require-imports
const fs = (): FS => require('expo-file-system') as FS;
const file = () => new (fs().File)(fs().Paths.document, 'adversary-library.json');

export async function loadAdversaries(): Promise<SavedAdversary[]> {
  try {
    if (Platform.OS === 'web') return JSON.parse(globalThis.localStorage?.getItem(WEB_KEY) ?? '[]');
    const f = file();
    return f.exists ? (JSON.parse(f.textSync()) as SavedAdversary[]) : [];
  } catch {
    return [];
  }
}

export async function saveAdversaries(list: SavedAdversary[]): Promise<void> {
  if (Platform.OS === 'web') {
    globalThis.localStorage?.setItem(WEB_KEY, JSON.stringify(list));
    return;
  }
  file().write(JSON.stringify(list, null, 2));
}
