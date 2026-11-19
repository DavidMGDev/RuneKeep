/**
 * What the desktop table remembers in this browser (v0.47.0): the deck's look, the looks saved by name, where the
 * dice were left, and the cards laid out on the felt for each character. Device furniture, not character data,
 * so none of it goes in the .rune file. Every read survives a missing or broken value.
 */
import { cleanLook, type DeckLook } from './deck-look';

const LOOK = 'runekeep.table.look';
const SAVED = 'runekeep.table.looks';
const DICE = 'runekeep.table.dice';
const BOARD = 'runekeep.table.board.';

function read<T>(key: string, fallback: T): T {
  try {
    const raw = typeof localStorage !== 'undefined' ? localStorage.getItem(key) : null;
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}
function write(key: string, value: unknown): void {
  try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* private window: forget it */ }
}

/**
 * Each character keeps the table they last played at (owner, v0.47.11). One with none yet starts from the table last
 * used by anyone, which is also kept, so a new character sits down at a familiar table.
 */
export const loadLook = (characterId?: string): DeckLook => {
  const own = characterId ? read<unknown>(LOOK + '.' + characterId, null) : null;
  return cleanLook(own ?? read(LOOK, {}));
};
export const saveLook = (l: DeckLook, characterId?: string): void => {
  if (characterId) write(LOOK + '.' + characterId, l);
  write(LOOK, l);
};

export interface SavedLook { name: string; look: DeckLook }
export const loadSavedLooks = (): SavedLook[] =>
  read<unknown[]>(SAVED, []).flatMap((s) => (s && typeof s === 'object' && typeof (s as SavedLook).name === 'string' ? [{ name: (s as SavedLook).name.slice(0, 40), look: cleanLook((s as SavedLook).look) }] : []));
export const saveSavedLooks = (list: SavedLook[]): void => write(SAVED, list);

/** Dice positions as shares of the felt, so a resized window keeps the layout. */
export type DicePlaces = Record<string, { fx: number; fy: number }>;
export const loadDicePlaces = (): DicePlaces => read<DicePlaces>(DICE, {});
export const saveDicePlaces = (p: DicePlaces): void => write(DICE, p);

/** A card laid on the felt: which card, where its centre is (shares of the felt) and how wide it is (px). */
export interface BoardCard { uid: string; id: string; fx: number; fy: number; w: number; face?: number; /** Degrees, clockwise. */ rot?: number; /** Knocked about by dice like a piece (v0.47.3). */ phys?: boolean }
export const loadBoard = (characterId: string): BoardCard[] =>
  read<unknown[]>(BOARD + characterId, []).flatMap((c) => {
    const b = c as BoardCard;
    return b && typeof b.id === 'string' && Number.isFinite(b.fx) && Number.isFinite(b.fy) && Number.isFinite(b.w) ? [{ uid: String(b.uid ?? Math.random()), id: b.id, fx: b.fx, fy: b.fy, w: b.w, face: b.face, rot: Number.isFinite(b.rot) ? b.rot : 0, phys: b.phys === true }] : [];
  });
export const saveBoard = (characterId: string, cards: BoardCard[]): void => write(BOARD + characterId, cards);

/**
 * The hand laid out on the table (v0.47.3, the Laid out hand): where each card of the decks lies, by card id. A card
 * not in here yet is dealt into the next free place of a grid.
 */
export type SpreadPlace = { fx: number; fy: number; w: number; rot?: number; phys?: boolean; face?: number };
const SPREAD = 'runekeep.table.spread.';
export const loadSpread = (characterId: string): Record<string, SpreadPlace> => {
  const raw = read<Record<string, SpreadPlace>>(SPREAD + characterId, {});
  const out: Record<string, SpreadPlace> = {};
  for (const [id, p] of Object.entries(raw ?? {})) if (p && Number.isFinite(p.fx) && Number.isFinite(p.fy) && Number.isFinite(p.w)) out[id] = { fx: p.fx, fy: p.fy, w: p.w, rot: Number.isFinite(p.rot) ? p.rot : 0, phys: p.phys === true, face: p.face };
  return out;
};
export const saveSpread = (characterId: string, s: Record<string, SpreadPlace>): void => write(SPREAD + characterId, s);
