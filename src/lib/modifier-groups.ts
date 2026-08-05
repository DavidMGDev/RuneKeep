/**
 * Modifier groups (v0.35, owner).
 *
 * A card can carry eight modifiers, and eight rows of "+2 Evasion" with nothing between them is a
 * wall. Groups file them the way the roster files characters into folders: a name, no colour, a
 * disclosure that remembers whether it was open, and, for a DM, one checkbox that switches everything
 * inside on or off.
 *
 * The group is a NAME on the effect rather than an entry in a table of its own. That is what makes it
 * survive everything a card already survives: export, an NFC tap, a history snapshot, a copy. There is
 * no second structure to keep in step and nothing to migrate.
 *
 * ponytail: a group with no modifiers in it cannot be stored, because a group IS its modifiers. The
 * editor keeps a freshly-created empty group on screen so it can be filled, and it is gone if it is
 * saved empty. If empty groups ever need to persist, they need a list of their own on the card.
 *
 * Pure: no React, no theme, no I/O.
 */

import type { CardEffect } from './modifiers';

/** One band of the editor: the ungrouped modifiers, or one named group's. */
export interface EffectGroup {
  /** null = the ungrouped band, which always leads. */
  name: string | null;
  /** The effects in this band, each with its index in the original list. */
  rows: { effect: CardEffect; index: number }[];
}

/** Split a card's effects into the ungrouped band and one band per group, in first-appearance order. */
export function groupEffects(effects: CardEffect[]): EffectGroup[] {
  const loose: EffectGroup = { name: null, rows: [] };
  const named = new Map<string, EffectGroup>();
  effects.forEach((effect, index) => {
    const g = effect.group?.trim();
    if (!g) { loose.rows.push({ effect, index }); return; }
    let band = named.get(g);
    if (!band) { band = { name: g, rows: [] }; named.set(g, band); }
    band.rows.push({ effect, index });
  });
  return [loose, ...named.values()];
}

/** Every group name currently in use, in first-appearance order. */
export function groupNames(effects: CardEffect[]): string[] {
  return groupEffects(effects).map((g) => g.name).filter((n): n is string => n !== null);
}

/**
 * Whether a group counts as ON: at least one modifier inside it is live.
 *
 * "Any" rather than "all", so a group the DM has half-switched still reads as doing something. The
 * checkbox then switches the whole group the other way, which is the behaviour a half-lit checkbox
 * should have.
 */
export function isGroupOn(effects: CardEffect[], group: string): boolean {
  return effects.some((e) => e.group === group && !e.off);
}

/** Switch every modifier in a group on or off. Effects outside it are untouched. */
export function setGroupOn(effects: CardEffect[], group: string, on: boolean): CardEffect[] {
  return effects.map((e) => (e.group === group ? { ...e, off: on ? undefined : true } : e));
}

/** Move one modifier into a group, or out of every group when `group` is null. */
export function moveToGroup(effects: CardEffect[], index: number, group: string | null): CardEffect[] {
  return effects.map((e, i) => (i === index ? { ...e, group: group?.trim() || undefined } : e));
}

/**
 * Delete a group WITHOUT deleting its modifiers: they come back out as ungrouped.
 *
 * Deleting the folder must never delete what was filed in it. A DM's modifiers can be the difference
 * between a character being alive and not, and a mis-tap on a disclosure row is not consent to lose
 * them. Deleting a modifier is still the ✕ on the modifier itself.
 */
export function deleteGroup(effects: CardEffect[], group: string): CardEffect[] {
  return effects.map((e) => (e.group === group ? { ...e, group: undefined } : e));
}

/** Rename a group in place, keeping its modifiers and their order. An empty name ungroups them. */
export function renameGroup(effects: CardEffect[], from: string, to: string): CardEffect[] {
  return effects.map((e) => (e.group === from ? { ...e, group: to.trim() || undefined } : e));
}

/** A name that is not already taken, so "New group" twice does not make one group. */
export function freeGroupName(effects: CardEffect[], base = 'Group'): string {
  const taken = new Set(groupNames(effects));
  if (!taken.has(base)) return base;
  for (let n = 2; n < 200; n++) if (!taken.has(`${base} ${n}`)) return `${base} ${n}`;
  return `${base} ${Date.now()}`;
}

// ---------------------------------------------------------------------------------------------
// Collapsed state
// ---------------------------------------------------------------------------------------------

/** The key a group's collapsed state is stored under: one card's one group. */
export function groupKey(cardRef: string, group: string): string {
  return `${cardRef}|${group}`;
}

/** Groups are OPEN by default, so only the closed ones are stored and an absent list means "all open". */
export function isGroupOpen(closed: string[] | undefined, cardRef: string, group: string): boolean {
  return !(closed ?? []).includes(groupKey(cardRef, group));
}

export function setGroupOpen(closed: string[] | undefined, cardRef: string, group: string, open: boolean): string[] {
  const key = groupKey(cardRef, group);
  const rest = (closed ?? []).filter((k) => k !== key);
  return open ? rest : [...rest, key];
}
