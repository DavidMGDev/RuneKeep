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
  | 'seesaw' | 'comet' | 'cage' | 'petrify' | 'rewind' | 'elements' | 'tiny' | 'gems' | 'contrary' | 'follow' | 'lock'
  | 'knight' | 'moon' | 'thief' | 'ruin' | 'blackhole' | 'wish' | 'gust' | 'talons' | 'throne' | 'vizier' | 'mimic';

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

/**
 * What each card does to the table (v0.47.12, owner: "interesting more lasting effects", fewer pushes). Most last a
 * while or until the table is reset, and Reset undoes every one of them.
 */
const EFFECTS: Record<string, { effect: DomatEffect; table: string; tint: string; once?: boolean }> = {
  balance: { effect: 'seesaw', table: 'The table tips one way, then the other, like a scale, for 20 seconds: everything slides with it.', tint: '#8FB8D8' },
  comet: { effect: 'comet', table: 'A comet strikes: cards near it are blown apart, pieces broken, the rest thrown to the walls.', tint: '#F08A3C' },
  donjon: { effect: 'cage', table: 'Bars rise round the pieces near it: what is inside stays in, what is outside bounces off, until reset.', tint: '#6E7A8A' },
  euryale: { effect: 'petrify', table: 'Every loose piece turns to stone and stays where it lies until reset.', tint: '#9AA59A' },
  fates: { effect: 'rewind', table: 'Undoes what happened since it was drawn: every piece goes back.', tint: '#C9A6F0' },
  flames: { effect: 'elements', table: 'Every loose piece takes an element. Fire melts ice, ice freezes water, water puts out fire: the loser is thrown off and turns.', tint: '#E2452C' },
  fool: { effect: 'tiny', table: 'Everything loose shrinks to half its size until reset.', tint: '#D8C060', once: true },
  gem: { effect: 'gems', table: 'Spills a handful of gem tokens across the felt.', tint: '#3CC8B4' },
  idiot: { effect: 'contrary', table: 'For 30 seconds every throw flies back the way your hand came.', tint: '#B07A50' },
  jester: { effect: 'follow', table: 'For 20 seconds everything loose chases your pointer round the table.', tint: '#E070B0', once: true },
  key: { effect: 'lock', table: 'Locks every loose piece where it lies until reset; the rest bounce off them.', tint: '#E0B563' },
  knight: { effect: 'knight', table: 'A knight charges across the table, knocking aside everything in its path.', tint: '#C0C8D0' },
  moon: { effect: 'moon', table: 'The felt freezes for 30 seconds: everything drifts and slides.', tint: '#A8B8F0' },
  rogue: { effect: 'thief', table: 'A thief darts about for 12 seconds pocketing every loose piece it touches, then drops the lot.', tint: '#5A6A50' },
  ruin: { effect: 'ruin', table: 'Tears apart the cards laid around it (the copies; your decks are untouched).', tint: '#8A5A3A' },
  skull: { effect: 'blackhole', table: 'Pulls everything in, then bursts, blowing apart the cards at its heart.', tint: '#D8D8D8' },
  star: { effect: 'wish', table: 'Every die on the table turns to its highest face.', tint: '#F0E08A' },
  sun: { effect: 'gust', table: 'A blinding flash and a gale that hurls everything into the walls.', tint: '#FFD24A' },
  talons: { effect: 'talons', table: 'Claws rake the table, breaking loose pieces and tearing cards near it.', tint: '#B03030' },
  throne: { effect: 'throne', table: 'Gathers every loose piece into a ring around the card.', tint: '#D4A73A' },
  vizier: { effect: 'vizier', table: 'Every die on the table rolls again.', tint: '#5AA0E0' },
  void: { effect: 'mimic', table: 'A whirlpool pulls pieces into a mimic that stays on the table. Right click it and it spits them all out.', tint: '#7A3AA8' },
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

/** The Flames card's elements (v0.47.12, owner: Card-Jitsu's rules). */
export type Element = 'fire' | 'water' | 'ice';
export const ELEMENTS: Element[] = ['fire', 'water', 'ice'];
const BEATS: Record<Element, Element> = { fire: 'ice', ice: 'water', water: 'fire' };
/** Fire melts ice, ice freezes water, water puts out fire: the winner when two meet, or null when they match. */
export function elementWinner(a: Element, b: Element): Element | null {
  if (a === b) return null;
  return BEATS[a] === b ? a : b;
}
