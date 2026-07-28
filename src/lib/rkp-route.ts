/**
 * Incoming `.rkp` routing (v0.22.0).
 *
 * Android can now hand RuneKeep a `.rkp` from WhatsApp, a file manager, an email client or a
 * download notification. That means a file can arrive at ANY moment — including while the player is
 * mid-edit on a character sheet — so the app has to decide what is safe to do rather than importing
 * whatever it was given.
 *
 * This module is that decision, kept pure so every branch is testable: it takes the parsed payload,
 * what already exists on the device, and what the user is currently doing, and returns one of a
 * small set of outcomes. It never touches disk and never imports anything itself.
 *
 * Two rules drive it, both from the owner:
 *
 *  1. Nothing imports without an explicit confirmation.
 *  2. If the user is inside something that could be corrupted by a route change (a character sheet,
 *     the creator with a live draft), the import DEFERS: it is parked, the user finishes what they
 *     were doing, and acts on it from the menu. Tearing that down mid-edit is how you lose work.
 */

import type { CharacterFile } from './character-file';
import { parseRkp, type RkpKind } from './rkp';

/** Where the user is when the file arrives. */
export type AppLocation =
  /** The main menu, roster, library or gallery — nothing in progress, safe to act immediately. */
  | 'idle'
  /** A character sheet is open and being played. */
  | 'sheet'
  /** Character creation with an in-progress draft. */
  | 'creating';

export type RouteOutcome =
  /** Ask to import a character; `replaces` is set when it collides with one already on the device. */
  | { action: 'confirm-character'; name: string; replaces: string | null }
  /** Ask to install/update an expansion. */
  | { action: 'confirm-expansion'; name: string }
  /** A single card can only be received onto a sheet; tell the user where it belongs. */
  | { action: 'explain-card'; message: string }
  /** Park it: the user is mid-edit and must not be interrupted. */
  | { action: 'defer'; reason: string }
  /** The file is unusable; `message` is written for a player, not a developer. */
  | { action: 'reject'; message: string };

export interface RouteInput {
  /** Raw text of the incoming file. */
  text: string;
  /** Where the user is right now. */
  location: AppLocation;
  /** Ids already on the roster, for collision detection. */
  existingCharacterIds: readonly string[];
}

/**
 * Turn a developer-shaped parse error into something a player can act on.
 *
 * The audit found four diagnostics leaking straight into a dialog ("Card 3 missing id", "Unknown
 * .rkp content kind: deck"). A player cannot do anything with those, and none of them offered a
 * next step.
 */
export function friendlyError(raw: string): string {
  const m = raw.toLowerCase();
  if (m.includes('bad json') || m.includes('not a json')) {
    return "That file isn't readable. It may have been renamed, or damaged in transit, ask for it again.";
  }
  if (m.includes('newer version')) {
    return 'That file was made by a newer version of RuneKeep. Update the app and try again.';
  }
  if (m.includes('older version')) {
    return "That file is from an older version RuneKeep can no longer read.";
  }
  if (m.includes('not a runekeep') || m.includes('unknown .rkp content kind')) {
    return "That isn't a RuneKeep file. RuneKeep opens .rkp files, characters, cards and expansions.";
  }
  if (m.includes('card') && m.includes('missing')) {
    return 'That expansion has a damaged card in it, so it cannot be installed. Ask whoever made it to export it again.';
  }
  if (m.includes('missing name') || m.includes('missing id') || m.includes('malformed') || m.includes('not an expansion')) {
    return 'That file is incomplete, so it cannot be opened. Ask whoever sent it to export it again.';
  }
  if (m.includes('unknown class') || m.includes('unknown card') || m.includes('unknown domain')) {
    return 'That character uses content this copy of RuneKeep does not have. Install the expansion it came from, then open it again.';
  }
  return 'That file could not be opened.';
}

const DEFER_REASON: Record<Exclude<AppLocation, 'idle'>, string> = {
  sheet: 'You have a character open. Finish up and import it from the main menu, nothing is lost.',
  creating: 'You are part-way through making a hero. Finish or save that first, then import from the main menu.',
};

export function routeIncoming({ text, location, existingCharacterIds }: RouteInput): RouteOutcome {
  let kind: RkpKind;
  let payload: unknown;
  try {
    const parsed = parseRkp(text);
    kind = parsed.kind;
    payload = parsed.payload;
  } catch (e) {
    return { action: 'reject', message: friendlyError(e instanceof Error ? e.message : String(e)) };
  }

  // A single card is received onto an open sheet, by design (that is what the NFC ceremony does).
  // Routing it from a file would need a target character and a category, which is a whole flow —
  // so say where it belongs rather than half-doing it.
  if (kind === 'card') {
    return { action: 'explain-card', message: 'That file is a single card. Open the character you want it on, then share it over NFC, or add it to an expansion in the Card Library.' };
  }

  // Anything that would change what is under the user's feet waits until they are somewhere safe.
  if (location !== 'idle') return { action: 'defer', reason: DEFER_REASON[location] };

  if (kind === 'character') {
    const file = payload as CharacterFile;
    const collides = existingCharacterIds.includes(file.id);
    return { action: 'confirm-character', name: file.name, replaces: collides ? file.name : null };
  }

  const exp = payload as { name?: string };
  return { action: 'confirm-expansion', name: exp.name ?? 'Expansion' };
}
