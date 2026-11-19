/**
 * The Deck of Many Things on the desktop table (v0.47.3, owner).
 *
 * A deck lies with the token supply. A right click (or a click) draws a card: it flies out and stays on the table,
 * smaller than a hand card. Drag it somewhere and let go, and it is consumed there and its magic hits the table
 * from that point: some push, some pull, some break things. The Fool and the Jester leave the deck once drawn,
 * as the deck's own rules say; Reset puts them back.
 *
 * The cards' names and rules text come from the booklet (SRD 5.1 open game content) via scripts/extract-domat.py.
 * The art comes from the same booklet, at /domat/<id>.webp (shipped at the owner's call, v0.47.4); a card whose art
 * fails to load is drawn from its name and colour.
 */
import CARDS from './domat-cards.json';

export type DomatEffect =
  | 'mirror' | 'comet' | 'cage' | 'petrify' | 'rewind' | 'flames' | 'scatter' | 'gems' | 'scramble' | 'dance' | 'tidy'
  | 'charge' | 'moon' | 'steal' | 'ruin' | 'blackhole' | 'star' | 'gust' | 'talons' | 'throne' | 'vizier' | 'void';

export interface DomatCard {
  id: string;
  name: string;
  /** The deck's own rules for it. */
  text: string;
  effect: DomatEffect;
  /** What it does to the table, in a line. */
  table: string;
  /** Its colour (the glow when it is consumed, the face when there is no art). */
  tint: string;
  /** Leaves the deck once drawn. */
  once?: boolean;
}

const EFFECTS: Record<string, { effect: DomatEffect; table: string; tint: string; once?: boolean }> = {
  balance: { effect: 'mirror', table: 'Everything loose swaps to its mirror image across the card.', tint: '#8FB8D8' },
  comet: { effect: 'comet', table: 'A comet strikes: what is near breaks, the rest is thrown to the walls.', tint: '#F08A3C' },
  donjon: { effect: 'cage', table: 'Drags everything nearby into a heap where the card fell.', tint: '#6E7A8A' },
  euryale: { effect: 'petrify', table: 'Turns the pieces around it to stone.', tint: '#9AA59A' },
  fates: { effect: 'rewind', table: 'Undoes what happened since it was drawn: every piece goes back.', tint: '#C9A6F0' },
  flames: { effect: 'flames', table: 'Bursts into flame, scorching cards and throwing pieces back.', tint: '#E2452C' },
  fool: { effect: 'scatter', table: 'Everything on the table jumps off somewhere at random.', tint: '#D8C060', once: true },
  gem: { effect: 'gems', table: 'Spills a handful of gem tokens across the felt.', tint: '#3CC8B4' },
  idiot: { effect: 'scramble', table: 'Shuffles where every loose piece lies.', tint: '#B07A50' },
  jester: { effect: 'dance', table: 'Sets every piece dancing for a moment.', tint: '#E070B0', once: true },
  key: { effect: 'tidy', table: 'Everything loose flies back to where it belongs.', tint: '#E0B563' },
  knight: { effect: 'charge', table: 'Charges across the table, knocking aside what stands in the way.', tint: '#C0C8D0' },
  moon: { effect: 'moon', table: 'The felt turns to ice: everything drifts and slides for a while.', tint: '#A8B8F0' },
  rogue: { effect: 'steal', table: 'Snatches a few loose pieces and drops them somewhere else.', tint: '#5A6A50' },
  ruin: { effect: 'ruin', table: 'Shatters the cards laid around it (the copies; your decks are untouched).', tint: '#8A5A3A' },
  skull: { effect: 'blackhole', table: 'Pulls everything in, then bursts.', tint: '#D8D8D8' },
  star: { effect: 'star', table: 'A starburst throws everything near it outwards.', tint: '#F0E08A' },
  sun: { effect: 'gust', table: 'A blinding flash and a gale that hurls everything into the walls.', tint: '#FFD24A' },
  talons: { effect: 'talons', table: 'Claws through the loose tokens and dice nearby, breaking them.', tint: '#B03030' },
  throne: { effect: 'throne', table: 'Gathers every loose piece into a ring around the card.', tint: '#D4A73A' },
  vizier: { effect: 'vizier', table: 'Every die on the table rolls again.', tint: '#5AA0E0' },
  void: { effect: 'void', table: 'A whirlpool: pieces circle in, and the ones that reach the middle are gone.', tint: '#7A3AA8' },
};

export const DOMAT: DomatCard[] = (CARDS as { id: string; name: string; text: string }[]).map((c) => ({ ...c, ...(EFFECTS[c.id] ?? EFFECTS.star) }));

/**
 * The deck keeps a stock (owner, v0.47.11): a new card grows every 200 seconds, up to ten waiting, and each draw takes
 * one. A new table starts with one.
 */
export const DOMAT_REFILL_MS = 200_000;
export const DOMAT_MAX = 10;
export const DOMAT_START = 1;
export interface DomatStock { stock: number; /** When the card now growing started. */ since: number }

/** The stock as it stands now, and how long (ms) until the next card (null when it is full). */
export function domatStock(s: DomatStock, now: number): DomatStock & { next: number | null } {
  let stock = Math.min(DOMAT_MAX, Math.max(0, Math.floor(Number.isFinite(s.stock) ? s.stock : DOMAT_START)));
  let since = Number.isFinite(s.since) ? Math.min(now, s.since) : now;
  if (stock < DOMAT_MAX) {
    const grown = Math.floor((now - since) / DOMAT_REFILL_MS);
    stock = Math.min(DOMAT_MAX, stock + grown);
    since += grown * DOMAT_REFILL_MS;
  }
  return stock >= DOMAT_MAX ? { stock, since: now, next: null } : { stock, since, next: since + DOMAT_REFILL_MS - now };
}

/** One card out of the stock, or null when it is empty. Taken from a full deck, the next one starts growing now. */
export function takeDomat(s: DomatStock, now: number): DomatStock | null {
  const c = domatStock(s, now);
  return c.stock > 0 ? { stock: c.stock - 1, since: c.since } : null;
}

/** A drawn card's size on the table: smaller than a hand card. */
export const DOMAT_W = 104;
export const DOMAT_H = 150;

/** Draw a card from what is left (the Fool and the Jester leave once drawn). */
export function drawDomat(gone: Set<string>, rand: () => number = Math.random): DomatCard | null {
  const left = DOMAT.filter((c) => !gone.has(c.id));
  return left.length ? left[Math.floor(rand() * left.length)] : null;
}

/** Where the art is served from (public/domat, made by scripts/extract-domat.py). */
export const domatArt = (id: string) => `/domat/${id}.webp`;
