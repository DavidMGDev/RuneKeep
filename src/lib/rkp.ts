/**
 * `.rkp` — RuneKeep's one file format (v0.10.0). A single JSON envelope carries any of three payloads:
 *   - `character`  → a CharacterFile (a hero)
 *   - `card`       → a single LibraryCard
 *   - `expansion`  → an Expansion (a versioned bundle of cards)
 *
 * `.rkp` is an otherwise-unused extension (only prior art is an Age of Empires keybind/profile, no
 * real-world conflict). Parsing is content-based, so a renamed file still works. This module is pure;
 * the filesystem/share lives in the stores.
 */
import { type CharacterFile, parseCharacterFile, serializeCharacterFile } from './character-file';
import { type Expansion, type LibraryCard, validateExpansion } from './library';

export const RKP_VERSION = 1;
export type RkpKind = 'character' | 'card' | 'expansion';

export interface RkpEnvelope {
  format: 'rkp';
  rkpVersion: number;
  kind: RkpKind;
  payload: unknown;
}

export type RkpContent =
  | { kind: 'character'; payload: CharacterFile }
  | { kind: 'card'; payload: LibraryCard }
  | { kind: 'expansion'; payload: Expansion };

export function serializeRkp(content: RkpContent): string {
  // Characters route through their own serializer so the envelope payload is a validated CharacterFile.
  const payload = content.kind === 'character' ? JSON.parse(serializeCharacterFile(content.payload)) : content.payload;
  const env: RkpEnvelope = { format: 'rkp', rkpVersion: RKP_VERSION, kind: content.kind, payload };
  return JSON.stringify(env, null, 2);
}

function validateCard(o: unknown): LibraryCard {
  // A single card reuses the expansion validator by wrapping it in a throwaway 1-card expansion.
  const exp = validateExpansion({ id: '_', name: '_', cards: [o] });
  return exp.cards[0];
}

/** Parse + validate an `.rkp` (or any RuneKeep JSON). Throws a clear error on anything malformed —
 *  the single trust boundary for imported files. */
export function parseRkp(text: string): RkpContent {
  let env: RkpEnvelope;
  try {
    env = JSON.parse(text) as RkpEnvelope;
  } catch {
    throw new Error('Not a valid RuneKeep file (bad JSON).');
  }
  if (!env || typeof env !== 'object' || env.format !== 'rkp') {
    throw new Error('Not a RuneKeep (.rkp) file.');
  }
  switch (env.kind) {
    case 'character':
      return { kind: 'character', payload: parseCharacterFile(JSON.stringify(env.payload)) };
    case 'card':
      return { kind: 'card', payload: validateCard(env.payload) };
    case 'expansion':
      return { kind: 'expansion', payload: validateExpansion(env.payload) };
    default:
      throw new Error(`Unknown .rkp content kind: ${String(env.kind)}`);
  }
}

/** Peek the kind without fully validating (for routing UI). Returns null if it isn't an `.rkp`. */
export function rkpKind(text: string): RkpKind | null {
  try {
    const env = JSON.parse(text) as RkpEnvelope;
    return env?.format === 'rkp' && (env.kind === 'character' || env.kind === 'card' || env.kind === 'expansion') ? env.kind : null;
  } catch {
    return null;
  }
}
