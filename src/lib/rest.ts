/**
 * Rest moves (#165) — the short/long rest downtime system, verbatim from the rulebook rest rules.
 *
 * SHORT REST (~1 hour): choose two of the following moves (or the same move twice). Some use your
 * TIER as a value.
 *   - Tend to Wounds  — clear Hit Points equal to 1d4 + tier.
 *   - Clear Stress    — clear Stress equal to 1d4 + tier.
 *   - Repair Armor    — clear Armor Slots equal to 1d4 + tier.
 *   - Prepare         — gain a Hope (2 Hope if you Prepare with party members).
 *
 * LONG REST (make camp): choose two of the following moves (or the same move twice).
 *   - Tend to All Wounds — clear all Hit Points.
 *   - Clear All Stress   — clear all Stress.
 *   - Repair All Armor   — clear all Armor Slots.
 *   - Prepare            — gain a Hope (2 with party).
 *   - Work on a Project  — narrative downtime project (no mechanical sheet effect).
 *
 * Owner rule (#165): a rest may be taken with only ONE move instead of two, so a character with extra
 * downtime moves can rest for two and then "rest again" for one.
 *
 * This module is the pure, testable core: dice rolls are injected (`roll`), not generated here.
 */

import type { Character } from '@/features/character-sheet/character';

export type RestKind = 'short' | 'long';
export type RestEffect = 'hp' | 'stress' | 'armor' | 'hope' | 'project';

export interface RestMove {
  id: string;
  kind: RestKind;
  title: string;
  blurb: string;
  effect: RestEffect;
  /** 1d4 + tier amount (short-rest partial moves). */
  dice: boolean;
  /** Clears the whole track (long-rest moves). */
  all: boolean;
}

export const REST_MOVES: RestMove[] = [
  { id: 'tend', kind: 'short', title: 'Tend to Wounds', blurb: 'Clear 1d4 + tier Hit Points.', effect: 'hp', dice: true, all: false },
  { id: 'clear-stress', kind: 'short', title: 'Clear Stress', blurb: 'Clear 1d4 + tier Stress.', effect: 'stress', dice: true, all: false },
  { id: 'repair', kind: 'short', title: 'Repair Armor', blurb: 'Clear 1d4 + tier Armor Slots.', effect: 'armor', dice: true, all: false },
  { id: 'prepare', kind: 'short', title: 'Prepare', blurb: 'Gain a Hope (2 with party).', effect: 'hope', dice: false, all: false },
  { id: 'tend-all', kind: 'long', title: 'Tend to All Wounds', blurb: 'Clear all Hit Points.', effect: 'hp', dice: false, all: true },
  { id: 'clear-all-stress', kind: 'long', title: 'Clear All Stress', blurb: 'Clear all Stress.', effect: 'stress', dice: false, all: true },
  { id: 'repair-all', kind: 'long', title: 'Repair All Armor', blurb: 'Clear all Armor Slots.', effect: 'armor', dice: false, all: true },
  { id: 'prepare-long', kind: 'long', title: 'Prepare', blurb: 'Gain a Hope (2 with party).', effect: 'hope', dice: false, all: false },
  { id: 'project', kind: 'long', title: 'Work on a Project', blurb: 'Progress a downtime project.', effect: 'project', dice: false, all: false },
];

/** Tier of play (#165): T1 = lvl 1, T2 = 2-4, T3 = 5-7, T4 = 8-10. */
export function tierForLevel(level: number): number {
  return level <= 1 ? 1 : level <= 4 ? 2 : level <= 7 ? 3 : 4;
}

export function movesFor(kind: RestKind): RestMove[] {
  return REST_MOVES.filter((m) => m.kind === kind);
}
export function restMoveById(id: string): RestMove | undefined {
  return REST_MOVES.find((m) => m.id === id);
}

export interface RestSelection {
  moveId: string;
  /** The 1d4 result (1-4) for dice moves — injected by the caller. */
  roll?: number;
  /** Prepare with party → 2 Hope instead of 1. */
  withParty?: boolean;
}
export interface RestLogEntry {
  moveId: string;
  title: string;
  amount: number;
  note: string;
}

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

function applyOne(c: Character, tier: number, m: RestMove, sel: RestSelection): { character: Character; log: RestLogEntry } {
  const roll = sel.roll ?? 0;
  switch (m.effect) {
    case 'hp': {
      const target = m.all ? c.maxHp : clamp(c.hp + roll + tier, 0, c.maxHp);
      const amount = target - c.hp;
      return { character: { ...c, hp: target }, log: { moveId: m.id, title: m.title, amount, note: amount > 0 ? `+${amount} HP` : 'already full' } };
    }
    case 'stress': {
      const dec = m.all ? c.stress.active : roll + tier;
      const next = clamp(c.stress.active - dec, 0, c.stress.total);
      const amount = c.stress.active - next;
      return { character: { ...c, stress: { ...c.stress, active: next } }, log: { moveId: m.id, title: m.title, amount, note: amount > 0 ? `cleared ${amount} Stress` : 'no Stress to clear' } };
    }
    case 'armor': {
      const unlocked = c.armor.total - (c.armor.locked ?? 0);
      const target = m.all ? unlocked : clamp(c.armor.active + roll + tier, 0, unlocked);
      const amount = target - c.armor.active;
      return { character: { ...c, armor: { ...c.armor, active: target } }, log: { moveId: m.id, title: m.title, amount, note: amount > 0 ? `repaired ${amount} Armor` : 'armor full' } };
    }
    case 'hope': {
      const gain = sel.withParty ? 2 : 1;
      const next = clamp(c.hope.active + gain, 0, c.hope.total);
      const amount = next - c.hope.active;
      return { character: { ...c, hope: { ...c.hope, active: next } }, log: { moveId: m.id, title: m.title, amount, note: amount > 0 ? `+${amount} Hope` : 'Hope full' } };
    }
    default:
      return { character: c, log: { moveId: m.id, title: m.title, amount: 0, note: 'project progressed' } };
  }
}

/** Apply a rest's selected moves in order. Pure: same inputs (incl. injected rolls) → same output. */
export function applyRestMoves(c: Character, tier: number, selections: RestSelection[]): { character: Character; log: RestLogEntry[] } {
  let ch = c;
  const log: RestLogEntry[] = [];
  for (const sel of selections) {
    const m = restMoveById(sel.moveId);
    if (!m) continue;
    const res = applyOne(ch, tier, m, sel);
    ch = res.character;
    log.push(res.log);
  }
  return { character: ch, log };
}
