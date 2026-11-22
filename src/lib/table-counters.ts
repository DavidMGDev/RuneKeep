/**
 * Counters on the DM's table (v0.50.0), pure. What a counter IS lives in `dm-counters`; this is only where one lies
 * on the felt, and how the table names one: a campaign's by its id, a combatant's by the combatant's id and its own.
 */
import type { AdversaryCounter } from './dm-counters';

export interface CounterSpot {
  /** Its centre, as shares of the felt. */
  x: number;
  y: number;
  /** Its size, 1 as made. */
  k: number;
}

export const COUNTER_MAX = 60;
export const SPOT_MIN_SCALE = 0.75;
export const SPOT_MAX_SCALE = 2.2;

export const counterKey = (id: string, cid?: string): string => (cid ? `${cid}|${id}` : id);

export function counterOf(key: string): { id: string; cid?: string } {
  const at = key.indexOf('|');
  return at < 0 ? { id: key } : { cid: key.slice(0, at), id: key.slice(at + 1) };
}

/** One counter changed, or gone when `next` gives null. */
export const editCounter = (list: AdversaryCounter[], id: string, next: (c: AdversaryCounter) => AdversaryCounter | null): AdversaryCounter[] =>
  list.flatMap((c) => {
    if (c.id !== id) return [c];
    const to = next(c);
    return to ? [to] : [];
  });

/** The first place in a loose grid over the open felt that no other counter is on. */
export function freeSpot(spots: Record<string, CounterSpot>): CounterSpot {
  const taken = Object.values(spots);
  for (let row = 0; row < 4; row++) {
    // The middle last: a new sticky note lands there.
    for (const x of [0.3, 0.7, 0.12, 0.5]) {
      const y = 0.45 + row * 0.15;
      if (!taken.some((s) => Math.abs(s.x - x) < 0.15 && Math.abs(s.y - y) < 0.12)) return { x, y, k: 1 };
    }
  }
  return { x: 0.5 + (taken.length % 7) * 0.02, y: 0.45 + (taken.length % 7) * 0.02, k: 1 };
}

const num = (v: unknown, fallback: number): number => (typeof v === 'number' && Number.isFinite(v) ? v : fallback);

export function cleanCounters(raw: unknown): AdversaryCounter[] {
  if (!Array.isArray(raw)) return [];
  return raw.flatMap((v) => {
    const c = v as Partial<AdversaryCounter> | null;
    if (!c || typeof c.id !== 'string' || c.id.includes('|') || typeof c.name !== 'string') return [];
    const start = num(c.start, 0);
    return [{
      id: c.id,
      name: c.name,
      kind: c.kind === 'countdown' ? 'countdown' as const : 'resource' as const,
      text: typeof c.text === 'string' ? c.text : '',
      start,
      value: num(c.value, start),
      ...(c.loop === true ? { loop: true } : {}),
    }];
  });
}

export function cleanSpots(raw: unknown): Record<string, CounterSpot> {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {};
  return Object.fromEntries(Object.entries(raw).flatMap(([key, v]) => {
    const s = v as Partial<CounterSpot> | null;
    if (!s || typeof s !== 'object') return [];
    const unit = (n: unknown) => Math.min(1, Math.max(0, num(n, 0.5)));
    return [[key, { x: unit(s.x), y: unit(s.y), k: Math.min(SPOT_MAX_SCALE, Math.max(SPOT_MIN_SCALE, num(s.k, 1))) }]];
  }));
}
