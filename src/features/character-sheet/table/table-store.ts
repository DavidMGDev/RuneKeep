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

export const loadLook = (): DeckLook => cleanLook(read(LOOK, {}));
export const saveLook = (l: DeckLook): void => write(LOOK, l);

export interface SavedLook { name: string; look: DeckLook }
export const loadSavedLooks = (): SavedLook[] =>
  read<unknown[]>(SAVED, []).flatMap((s) => (s && typeof s === 'object' && typeof (s as SavedLook).name === 'string' ? [{ name: (s as SavedLook).name.slice(0, 40), look: cleanLook((s as SavedLook).look) }] : []));
export const saveSavedLooks = (list: SavedLook[]): void => write(SAVED, list);

/** Dice positions as shares of the felt, so a resized window keeps the layout. */
export type DicePlaces = Record<string, { fx: number; fy: number }>;
export const loadDicePlaces = (): DicePlaces => read<DicePlaces>(DICE, {});
export const saveDicePlaces = (p: DicePlaces): void => write(DICE, p);

/** A card laid on the felt: which card, where its centre is (shares of the felt) and how wide it is (px). */
export interface BoardCard { uid: string; id: string; fx: number; fy: number; w: number; face?: number; /** Degrees, clockwise. */ rot?: number }
export const loadBoard = (characterId: string): BoardCard[] =>
  read<unknown[]>(BOARD + characterId, []).flatMap((c) => {
    const b = c as BoardCard;
    return b && typeof b.id === 'string' && Number.isFinite(b.fx) && Number.isFinite(b.fy) && Number.isFinite(b.w) ? [{ uid: String(b.uid ?? Math.random()), id: b.id, fx: b.fx, fy: b.fy, w: b.w, face: b.face, rot: Number.isFinite(b.rot) ? b.rot : 0 }] : [];
  });
export const saveBoard = (characterId: string, cards: BoardCard[]): void => write(BOARD + characterId, cards);
