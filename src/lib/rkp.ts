/**
 * `.rune` — RuneKeep's one file format (v0.10.0). A single JSON envelope carries any of three payloads:
 *   - `character`  → a CharacterFile (a hero)
 *   - `card`       → a single LibraryCard
 *   - `expansion`  → an Expansion (a versioned bundle of cards)
 *
 * Files were named `.rkp` up to v0.29.1 and are `.rune` from v0.30.0 (owner: it says what it is).
 * Parsing is content-based, so a renamed file still works and every `.rkp` anyone was already sent
 * still opens.
 *
 * The envelope's own `format` tag stays `"rkp"` deliberately. It is invisible to players, and keeping
 * it means a file exported from v0.30 still opens on a phone that has not updated yet, which matters
 * at a table where one player upgrades before the others. `"rune"` is accepted on the way in, so
 * nothing stops us writing it later.
 *
 * This module is pure; the filesystem/share lives in the stores.
 */
import { type CharacterFile, parseCharacterFile, serializeCharacterFile } from './character-file';
import { type Expansion, type LibraryCard, validateExpansion } from './library';

export const RKP_VERSION = 1;
/** The extension exports are written with, and the one shown to players. */
export const RUNE_EXT = 'rune';
export type RkpKind = 'character' | 'card' | 'expansion';

export interface RkpEnvelope {
  format: 'rkp' | 'rune';
  rkpVersion: number;
  kind: RkpKind;
  payload: unknown;
}

/** Both spellings of the envelope tag: `rkp` is what every file before v0.30.0 carries. */
const isEnvelope = (f: unknown): f is RkpEnvelope['format'] => f === 'rkp' || f === 'rune';

export type RkpContent =
  | { kind: 'character'; payload: CharacterFile }
  | { kind: 'card'; payload: LibraryCard }
  | { kind: 'expansion'; payload: Expansion };

export function serializeRkp(content: RkpContent): string {
  // Characters route through their own serializer so the envelope payload is a validated CharacterFile.
  const payload = content.kind === 'character' ? JSON.parse(serializeCharacterFile(content.payload)) : content.payload;
  // See the header: the tag stays `rkp` so a v0.30 export still opens on a phone running v0.29.
  const env: RkpEnvelope = { format: 'rkp', rkpVersion: RKP_VERSION, kind: content.kind, payload };
  return JSON.stringify(env, null, 2);
}

function validateCard(o: unknown): LibraryCard {
  // A single card reuses the expansion validator by wrapping it in a throwaway 1-card expansion.
  const exp = validateExpansion({ id: '_', name: '_', cards: [o] });
  return exp.cards[0];
}

/** Parse + validate a `.rune` (or the older `.rkp`, or any RuneKeep JSON). Throws a clear error on
 *  anything malformed — the single trust boundary for imported files. */
export function parseRkp(text: string): RkpContent {
  let env: RkpEnvelope;
  try {
    env = JSON.parse(text) as RkpEnvelope;
  } catch {
    throw new Error('Not a valid RuneKeep file (bad JSON).');
  }
  if (!env || typeof env !== 'object' || !isEnvelope(env.format)) {
    throw new Error('Not a RuneKeep (.rune) file.');
  }
  switch (env.kind) {
    case 'character':
      return { kind: 'character', payload: parseCharacterFile(JSON.stringify(env.payload)) };
    case 'card':
      return { kind: 'card', payload: validateCard(env.payload) };
    case 'expansion':
      return { kind: 'expansion', payload: validateExpansion(env.payload) };
    default:
      throw new Error(`Unknown .rune content kind: ${String(env.kind)}`);
  }
}

/** Peek the kind without fully validating (for routing UI). Returns null if it isn't a RuneKeep file. */
export function rkpKind(text: string): RkpKind | null {
  try {
    const env = JSON.parse(text) as RkpEnvelope;
    return isEnvelope(env?.format) && (env.kind === 'character' || env.kind === 'card' || env.kind === 'expansion') ? env.kind : null;
  } catch {
    return null;
  }
}
