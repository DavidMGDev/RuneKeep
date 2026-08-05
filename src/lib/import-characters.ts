/**
 * Importing a character who is already here (v0.35, owner).
 *
 * A character carries its id with it, so a player sending their DM an updated sheet sends back the
 * same id they were given. Up to now that silently overwrote whatever was on the device, which is
 * either exactly right (the sheet has been updated between sessions) or the loss of an evening's
 * bookkeeping (you wanted both). The app never asked, so it was right by luck.
 *
 * This is the decision, kept pure so every branch is testable: given what is arriving and what is
 * already on the roster, what are the choices and what does each one produce.
 *
 * Two rules from the owner:
 *  1. An UPDATE keeps the character where it is (its folder, its parties) and drops every DM
 *     modifier, because those were made against the sheet being replaced and would otherwise be
 *     applied on top of a sheet that may already include them.
 *  2. A COPY is a new character: a new id, a numbered name, and no folder or party, so it cannot
 *     quietly become a second member of a party that already has the original.
 */

import type { CharacterFile } from './character-file';
import { stripDmCards } from './dm-cards';

/** What one incoming file would do to the roster. */
export interface ImportPlanEntry {
  file: CharacterFile;
  /** True when a character with this id is already on the device. */
  collides: boolean;
}

export interface RosterEntry {
  id: string;
  name: string;
}

export function planImports(incoming: CharacterFile[], roster: RosterEntry[]): ImportPlanEntry[] {
  const ids = new Set(roster.map((c) => c.id));
  return incoming.map((file) => ({ file, collides: ids.has(file.id) }));
}

/**
 * The name a copy takes: the original's, then a space and the lowest free number.
 *
 * Counting existing copies rather than adding one to the highest, so deleting "Auren 2" makes that
 * name available again instead of leaving a permanent gap. Names are compared trimmed, because a
 * trailing space is not a different character.
 */
export function copyName(name: string, roster: RosterEntry[]): string {
  const base = name.trim() || 'Character';
  const taken = new Set(roster.map((c) => c.name.trim()));
  if (!taken.has(base)) return base;
  for (let n = 2; n < 500; n++) {
    const candidate = `${base} ${n}`;
    if (!taken.has(candidate)) return candidate;
  }
  return `${base} ${roster.length + 1}`;
}

/**
 * The file to save as a COPY: a fresh id and a numbered name.
 *
 * DM cards are stripped here too. They belong to the character the DM has been running, and a copy is
 * a different character from the moment it is made.
 */
export function asCopy(file: CharacterFile, roster: RosterEntry[], newId: string): CharacterFile {
  return { ...stripDmCards(file), id: newId, name: copyName(file.name, roster) };
}

/** The file to save as an UPDATE: exactly what arrived, minus anything a DM had layered on top. */
export function asUpdate(file: CharacterFile): CharacterFile {
  return stripDmCards(file);
}
