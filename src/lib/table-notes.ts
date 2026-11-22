/**
 * Sticky notes on the desktop table (v0.49.0, owner): pure, so the rules can be tested.
 *
 * A note is a physical card that carries writing: dice knock it about, tear it, cut it and burn it as they do a card.
 * A card that breaks is a copy and the real one is still in its deck. A note has no deck, so a broken one is only
 * marked `torn`: what was written comes back with Reset, and nothing but Delete throws it away.
 */

export const NOTE_PAPERS = ['gold', 'rose', 'sage', 'sky', 'linen'] as const;
export type NotePaper = (typeof NOTE_PAPERS)[number];

/** A note's own drawing size: square, where a card is 230 by 322. */
export const NOTE_SIZE = 230;
export const NOTE_MAX = 80;
/** How wide one lies until it is resized (v0.50.0, owner: much smaller). */
export const NOTE_W = 108;
/** What they were made at before. shortcut: one resized to exactly this comes back small too, keep a version if that matters. */
const OLD_W = 160;
export const NOTE_TEXT_MAX = 600;
const PREFIX = 'note-';

export interface TableNote {
  id: string;
  text: string;
  paper: NotePaper;
  /** Its centre, as shares of the felt. */
  fx: number;
  fy: number;
  w: number;
  rot: number;
  /** Knocked about and breakable, as a physical card is. A pinned note is neither. */
  phys: boolean;
  torn?: boolean;
}

/** A note's id is its uid on the table as well, so it never has a colon (the engine's keys are split on them). */
export const isNoteId = (id: string): boolean => id.startsWith(PREFIX);

export function newNote(serial: string, fx: number, fy: number, count: number): TableNote {
  // A slight lean, a different one each time, as a note slapped down has.
  return { id: `${PREFIX}${serial}`, text: '', paper: NOTE_PAPERS[count % NOTE_PAPERS.length], fx, fy, w: NOTE_W, rot: ((count * 5) % 9) - 4, phys: true };
}

const num = (v: unknown, fallback: number): number => (typeof v === 'number' && Number.isFinite(v) ? v : fallback);
const share = (v: unknown): number => Math.min(1, Math.max(0, num(v, 0.5)));

/** Notes as they were stored. One unreadable note costs that note; a note is never dropped for a bad position. */
export function cleanNotes(raw: unknown): TableNote[] {
  if (!Array.isArray(raw)) return [];
  return raw.flatMap((v) => {
    const n = v as Partial<TableNote> | null;
    if (!n || typeof n.id !== 'string' || !isNoteId(n.id) || n.id.includes(':') || typeof n.text !== 'string') return [];
    return [{
      id: n.id,
      text: n.text,
      paper: NOTE_PAPERS.includes(n.paper as NotePaper) ? (n.paper as NotePaper) : 'gold',
      fx: share(n.fx),
      fy: share(n.fy),
      w: n.w === OLD_W ? NOTE_W : Math.min(460, Math.max(96, num(n.w, NOTE_W))),
      rot: num(n.rot, 0),
      phys: n.phys !== false,
      ...(n.torn === true ? { torn: true } : {}),
    }];
  });
}

export const tearNote = (notes: TableNote[], id: string): TableNote[] => notes.map((n) => (n.id === id ? { ...n, torn: true } : n));
/** Every torn note whole again, upright enough to read. */
export const mendNotes = (notes: TableNote[]): TableNote[] => notes.map((n) => (n.torn ? { ...n, torn: undefined, rot: 0 } : n));
export const editNote = (notes: TableNote[], id: string, patch: Partial<Omit<TableNote, 'id'>>): TableNote[] =>
  notes.map((n) => (n.id === id ? { ...n, ...patch, ...(patch.text !== undefined ? { text: patch.text.slice(0, NOTE_TEXT_MAX) } : {}) } : n));
