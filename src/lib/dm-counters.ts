/**
 * Counters on an adversary (v0.41.3, owner) — the arithmetic of a number the DM moves by hand.
 *
 * A stat block says what a thing IS. A counter says what is HAPPENING to it: three charges left on
 * the lich's phylactery, four rounds until the bridge collapses, the number of villagers still alive.
 * Those are the numbers a DM writes on a scrap of paper beside the screen, and they belong to the
 * fight rather than to the creature, which is why they are additive on the combatant and why the
 * whole of what one IS lives here, apart from any component.
 *
 * Two kinds, and the difference is only what happens at the bottom:
 *
 *  - a RESOURCE is a plain number. It starts somewhere and the DM moves it.
 *  - a COUNTDOWN may LOOP: pushed below zero it goes back to where it started, so a recurring timer
 *    is reset by the same button that runs it down rather than by opening the editor.
 *
 * TAKE OVER is the third idea and the one worth reading twice. A counter marked that way stops being
 * a detail of the adversary and becomes the reason the entry exists: the stats go, and what is left
 * is a name, a description and the number. It is how you put "The ritual completes in 6" in the
 * middle of an encounter without inventing a creature to hang it on.
 */

export type CounterKind = 'resource' | 'countdown';

export interface AdversaryCounter {
  id: string;
  name: string;
  kind: CounterKind;
  /** What it means, in the DM's own words. Shown wherever the counter is. */
  text: string;
  /** Where it begins, and where a looping countdown returns to. */
  start: number;
  /** Where it is now. */
  value: number;
  /** Countdown only: pushed below zero, it goes back to `start` instead. */
  loop?: boolean;
  /** This counter replaces the entry's stat block. See the note at the top of the file. */
  takeOver?: boolean;
}

/** A new counter, at its default of nothing. `id` is minted by the caller so this stays pure. */
export function newCounter(id: string): AdversaryCounter {
  return { id, name: '', kind: 'resource', text: '', start: 0, value: 0 };
}

/**
 * Move a counter, and let a looping countdown wrap.
 *
 * "At 0 I can press the minus to reduce it below zero and it goes back to its default, let's say 4,
 * then from there it keeps counting down, or upwards if the user so desires." So the wrap is a floor
 * test and nothing more: anything that lands below zero lands on `start` instead. Counting UP past
 * the start is left alone, because a DM who wants six rounds instead of four should get six.
 */
export function stepCounter(c: AdversaryCounter, delta: number): AdversaryCounter {
  const next = c.value + delta;
  if (c.kind === 'countdown' && c.loop && next < 0) return { ...c, value: c.start };
  return { ...c, value: next };
}

/** Put a counter back where it started, without touching anything else about it. */
export const resetCounter = (c: AdversaryCounter): AdversaryCounter => ({ ...c, value: c.start });

/**
 * Editing a counter's START also moves a counter that has not been used yet.
 *
 * Typing 4 into "Starts at" and then finding the entry still showing 0 is the sort of thing that
 * reads as the field not working. A counter that is already in play keeps whatever it is on.
 */
export function setStart(c: AdversaryCounter, start: number): AdversaryCounter {
  return { ...c, start, value: c.value === c.start ? start : c.value };
}

/** Counters worth keeping when the editor closes: anything the DM actually named or described. */
export const meaningfulCounters = (list: AdversaryCounter[]): AdversaryCounter[] =>
  list.filter((c) => c.name.trim() || c.text.trim());

/**
 * How an entry carrying these counters should be DRAWN.
 *
 * - `none`: an ordinary stat block. Counters, if any, are a section of the expanded detail.
 * - `title`: exactly one counter has taken over. The entry is its name and that number, and the
 *   stats are gone.
 * - `list`: more than one has. No single number can sit beside the name, so the entry is a title
 *   that opens into all of them.
 */
export type CounterMode = 'none' | 'title' | 'list';

export function counterMode(counters: AdversaryCounter[] | undefined): CounterMode {
  const n = (counters ?? []).filter((c) => c.takeOver).length;
  return n === 0 ? 'none' : n === 1 ? 'title' : 'list';
}

/** The counter that has taken the entry over, when exactly one has. */
export function soleCounter(counters: AdversaryCounter[] | undefined): AdversaryCounter | null {
  const taken = (counters ?? []).filter((c) => c.takeOver);
  return taken.length === 1 ? taken[0] : null;
}

/** Counters that have NOT taken over: the ones shown as a section of an ordinary stat block. */
export const detailCounters = (counters: AdversaryCounter[] | undefined): AdversaryCounter[] =>
  (counters ?? []).filter((c) => !c.takeOver);

/** What a counter reads as next to its name: its kind, and whether it comes back round. */
export function counterNote(c: AdversaryCounter): string {
  if (c.kind === 'resource') return 'Resource';
  return c.loop ? `Countdown · restarts at ${c.start}` : 'Countdown';
}
