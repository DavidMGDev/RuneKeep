/**
 * What the DM screen's table remembers for one campaign (v0.49.0), and how its decks are arranged from it. Pure.
 *
 * A character's table keeps its favourites, decks, order, tokens and presets on the character. A campaign has no such
 * file, and the party record is written whole by two screens on a debounce, so anything put on it here would be lost
 * under their saves. It has a record of its own instead (`dm-table-store`).
 */
import type { PlacedToken } from '@/features/character-sheet/components/card-tokens';
import { type DicePreset, DESK_PRESET_SLOTS, slotsOf } from './dice-presets';
import { FAVORITES_CATEGORY } from './favorites';
import type { AdversaryCounter } from './dm-counters';
import { cleanCounters, cleanSpots, type CounterSpot } from './table-counters';

export const FEAR_MAX = 12;

export interface DmFear {
  on: boolean;
  n: number;
  /** Its centre, as shares of the felt. */
  x: number;
  y: number;
}

export interface DmTable {
  category: string;
  favorites: string[];
  /** The cards marked with the gold corner (a character's equipped). */
  marked: string[];
  tokens: Record<string, PlacedToken[]>;
  tokenColor?: string;
  /** The DM's own decks. */
  decks: { key: string; label: string }[];
  /** Cards moved out of the deck they come in. */
  moved: Record<string, string>;
  order: Record<string, string[]>;
  presets: (DicePreset | null)[];
  fear: DmFear;
  /** The campaign's own counters. A combatant's are the encounter's. */
  counters: AdversaryCounter[];
  /** Where each counter that is out lies, by `counterKey`. */
  spots: Record<string, CounterSpot>;
}

export const DM_DECKS = [
  { key: 'dm-foes', label: 'Adversaries', icon: 'sword' },
  { key: 'dm-party', label: 'Party', icon: 'shield' },
  { key: 'dm-npcs', label: 'Allies', icon: 'heart' },
  { key: 'dm-fights', label: 'Encounters', icon: 'scroll' },
  { key: 'dm-saved', label: 'My adversaries', icon: 'book' },
] as const;
export type DmDeckKey = (typeof DM_DECKS)[number]['key'];

export const clampFear = (n: number): number => Math.min(FEAR_MAX, Math.max(0, Math.round(n)));

const obj = (v: unknown): Record<string, unknown> => (v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : {});
const strings = (v: unknown): string[] => (Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : []);
const num = (v: unknown, fallback: number): number => (typeof v === 'number' && Number.isFinite(v) ? v : fallback);

export function cleanDmTable(raw: unknown): DmTable {
  const r = obj(raw), f = obj(r.fear);
  return {
    category: typeof r.category === 'string' ? r.category : 'dm-foes',
    favorites: strings(r.favorites),
    marked: strings(r.marked),
    tokens: Object.fromEntries(Object.entries(obj(r.tokens)).filter(([, v]) => Array.isArray(v))) as Record<string, PlacedToken[]>,
    tokenColor: typeof r.tokenColor === 'string' ? r.tokenColor : undefined,
    decks: Array.isArray(r.decks)
      ? r.decks.flatMap((v) => { const d = obj(v); return typeof d.key === 'string' && typeof d.label === 'string' ? [{ key: d.key, label: d.label }] : []; })
      : [],
    moved: Object.fromEntries(Object.entries(obj(r.moved)).filter(([, v]) => typeof v === 'string')) as Record<string, string>,
    order: Object.fromEntries(Object.entries(obj(r.order)).map(([k, v]) => [k, strings(v)])),
    presets: slotsOf(Array.isArray(r.presets) ? (r.presets as (DicePreset | null)[]) : undefined, DESK_PRESET_SLOTS),
    fear: { on: f.on === true, n: clampFear(num(f.n, 0)), x: Math.min(1, Math.max(0, num(f.x, 0.5))), y: Math.min(1, Math.max(0, num(f.y, 0.34))) },
    counters: cleanCounters(r.counters),
    spots: cleanSpots(r.spots),
  };
}

/**
 * The decks as they are shown: each card in the deck it was moved to (or its own, when that deck is gone), each deck
 * in the order it was put in with newcomers after, and Favorites mirroring what was favourited.
 */
export function arrangeDecks<T extends { id: string }>(base: Record<string, T[]>, t: Pick<DmTable, 'decks' | 'moved' | 'order' | 'favorites'>): Record<string, T[]> {
  const keys = [...DM_DECKS.map((d) => d.key as string), ...t.decks.map((d) => d.key)];
  const out: Record<string, T[]> = Object.fromEntries(keys.map((k) => [k, [] as T[]]));
  for (const [home, cards] of Object.entries(base)) {
    for (const c of cards) {
      const to = t.moved[c.id];
      (out[to && keys.includes(to) ? to : home] ??= []).push(c);
    }
  }
  const all = new Map(Object.values(out).flat().map((c) => [c.id, c]));
  out[FAVORITES_CATEGORY] = t.favorites.flatMap((id) => all.get(id) ?? []);
  for (const [key, ids] of Object.entries(t.order)) {
    if (!out[key]) continue;
    const at = new Map(ids.map((id, i) => [id, i]));
    out[key] = out[key].map((c, i) => ({ c, k: at.get(c.id) ?? ids.length + i })).sort((a, b) => a.k - b.k).map((x) => x.c);
  }
  return out;
}

/** A deck deleted: its cards go back to where they came from. */
export function removeDeck(t: DmTable, key: string): DmTable {
  const { [key]: dropped, ...order } = t.order;
  void dropped;
  return {
    ...t,
    decks: t.decks.filter((d) => d.key !== key),
    moved: Object.fromEntries(Object.entries(t.moved).filter(([, to]) => to !== key)),
    order,
    category: t.category === key ? 'dm-foes' : t.category,
  };
}
