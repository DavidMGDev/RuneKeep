/**
 * FUNCTIONAL CARDS (v0.42.0, owner) — a card that does something, not just says something.
 *
 * Every card in the app until now has been text: a rule you read and then keep track of yourself. A
 * homebrew class almost always needs more than that. A resource it spends. A stance it switches. A
 * line the player writes on. The owner's ask is exact: "the user may enable on a functional card a
 * counter, with a set maximum, or an edit text for the user to write what they want, or finally a
 * button that when pressed cycles between a list of options that the user gives."
 *
 * ## The split that makes this survive an update
 *
 * A function's CONFIGURATION is authored and lives on the library card. Its STATE is played and lives
 * on the character file, keyed by the card and the function. That is not tidiness, it is the whole
 * reason an expansion can be updated without resetting anybody's numbers: the author renaming
 * "Charges" to "Rites" must not put the player's three back to five.
 *
 * ## Why the counter's rules are the DM's rules
 *
 * A countdown that restarts below zero is a thing this app already knows how to do, and a second set
 * of rules for the same idea is a second set of bugs. `lib/dm-counters` owns the semantics; this
 * module adds the one thing a player-facing counter needs that an adversary's does not, a maximum,
 * and otherwise defers.
 */

export type FunctionKind = 'counter' | 'text' | 'cycle';

/** Where the element sits relative to the card's body. The owner asked for both. */
export type FunctionPlacement = 'above' | 'below';

export interface CardFunction {
  id: string;
  kind: FunctionKind;
  /** A line above the control saying what it is. Optional; a well-named card often needs none. */
  label?: string;
  placement: FunctionPlacement;

  // --- counter ---
  /** Where it starts, and what a restarting countdown returns to. */
  start?: number;
  /**
   * The floor (v0.42.1, owner: "counters can be given a set range").
   *
   * Absent means zero, which is what almost every resource wants. A counter may be given a floor
   * ABOVE zero, which is how "this never drops below 1" is expressed, and a level advancement can
   * move both ends (see {@link applyAdvance}).
   */
  min?: number;
  /** The ceiling. Absent means none, which is what a growing tally wants. */
  max?: number;
  /** Counts DOWN only, with no plus button, exactly like an adversary's. */
  countdown?: boolean;
  /** Countdown only: pushed below zero it goes back to `start`. */
  loop?: boolean;

  // --- text ---
  /** How many lines the field is. One is a word; several is a paragraph. */
  lines?: number;
  placeholder?: string;

  // --- cycle ---
  /** The states the button walks through, in order. */
  options?: string[];
  /** Which one it starts on. Out of range is treated as the first. */
  startIndex?: number;

  /**
   * LOCKED (v0.42.1, owner): the player may read this element but not change it.
   *
   * A locked counter still shows its number and a locked cycle still shows its option; what is gone
   * is the ability to move them. It is how a class says "your Combo Die is a d4" and means it, with
   * the only way to change it being a level advancement (see {@link CardAdvance}).
   */
  locked?: boolean;
  /**
   * HIDDEN UNTIL UNLOCKED (v0.42.1, owner): the element is not drawn at all until an advancement
   * turns it on. A feature you do not have yet is not a greyed-out feature, it is not there.
   */
  hidden?: boolean;
  /** A line ABOVE the control, in the card's body voice. Explains what it is. */
  before?: string;
  /** A line BELOW it. "Increase this by one step as a level advancement, once per tier." */
  after?: string;
}

/**
 * A LEVEL ADVANCEMENT this card offers (v0.42.1, owner).
 *
 * "This is just a checkbox for custom functional cards, which can have a Level Advancement Option
 * tick and the user can select at which tiers it becomes available, and the user can configure what
 * it does to the functional card."
 *
 * It is stored on the card next to the element it changes, because that is the only place it means
 * anything: an advancement that raises a Combo Die is a fact about the Combo Die.
 */
export interface CardAdvance {
  id: string;
  /** What the player sees in the advancement list. */
  label: string;
  /** Which element it changes. */
  functionId: string;
  /** The tiers at which it may be taken. Empty means every tier. */
  tiers: number[];
  /** How many times it may be taken PER TIER. The owner asked for once or twice. */
  perTier: 1 | 2;
  /** What it does. */
  effect: AdvanceEffect;
}

export type AdvanceEffect =
  /** A counter's value, floor and ceiling all move by this much. "Your die goes up one step." */
  | { kind: 'step'; by: number }
  /** A counter is set to this, or a text field / cycle is set to this option. */
  | { kind: 'set'; value: number; text?: string }
  /** A locked or hidden element becomes available. */
  | { kind: 'unlock' };

/** What the player has done to one function. Only the field its kind uses is ever set. */
export interface FunctionState {
  /** counter */
  n?: number;
  /** text */
  s?: string;
  /** cycle */
  i?: number;
}

const clampIndex = (i: number, len: number): number => (len <= 0 ? 0 : ((i % len) + len) % len);

/** A brand new function of this kind, with the defaults an author would expect to see. */
export function newFunction(id: string, kind: FunctionKind): CardFunction {
  const base = { id, kind, placement: 'below' as const };
  if (kind === 'counter') return { ...base, start: 0, max: undefined, countdown: false };
  if (kind === 'text') return { ...base, lines: 1, placeholder: '' };
  return { ...base, options: ['Off', 'On'], startIndex: 0 };
}

/**
 * The state a function has before anyone has touched it.
 *
 * Derived, never stored, so a card that has never been played still renders and an author changing a
 * default changes what an untouched card shows. This is the same decision the DM's derived initials
 * rest on: a fallback you can compute is a fallback you never have to migrate.
 */
export function defaultState(f: CardFunction): FunctionState {
  if (f.kind === 'counter') return { n: clampCounter(f, f.start ?? 0) };
  if (f.kind === 'text') return { s: '' };
  return { i: clampIndex(f.startIndex ?? 0, f.options?.length ?? 0) };
}

/** The state as it stands, filling in anything the player has not set. */
export const stateOf = (f: CardFunction, saved: FunctionState | undefined): FunctionState => ({ ...defaultState(f), ...saved });

/** Hold a counter inside its own RANGE: never below its floor, never past a ceiling that was set. */
export function clampCounter(f: CardFunction, n: number): number {
  const low = Math.max(f.min ?? 0, Math.round(n));
  return f.max != null && f.max > 0 ? Math.min(f.max, low) : low;
}

/** Whether a counter may be moved this way. A countdown never goes up; nothing passes its ceiling. */
export function canStepFunction(f: CardFunction, state: FunctionState, delta: number): boolean {
  if (f.kind !== 'counter' || f.locked) return false;
  const n = stateOf(f, state).n ?? 0;
  if (delta > 0) return !f.countdown && (f.max == null || n < f.max);
  // Down: a looping countdown may always be pushed off the bottom, because that is its wrap.
  if (f.countdown && f.loop) return true;
  return n > (f.min ?? 0);
}

/**
 * Move a counter, and let a looping countdown wrap.
 *
 * The same rule the DM's counters follow: anything that lands below zero lands on `start` instead,
 * and only when the author asked for it.
 */
export function stepFunction(f: CardFunction, state: FunctionState, delta: number): FunctionState {
  if (!canStepFunction(f, state, delta)) return stateOf(f, state);
  const n = (stateOf(f, state).n ?? 0) + delta;
  if (f.countdown && f.loop && n < 0) return { n: clampCounter(f, f.start ?? 0) };
  return { n: clampCounter(f, n) };
}

/** Walk a cycling button to its next option, coming back round at the end. Locked, it does not move. */
export function cycleFunction(f: CardFunction, state: FunctionState): FunctionState {
  const len = f.options?.length ?? 0;
  if (len === 0 || f.locked) return stateOf(f, state);
  return { i: clampIndex((stateOf(f, state).i ?? 0) + 1, len) };
}

/** What a cycling button currently reads. Empty options draw the label rather than nothing at all. */
export function cycleLabel(f: CardFunction, state: FunctionState): string {
  const opts = f.options ?? [];
  if (!opts.length) return '—';
  return opts[clampIndex(stateOf(f, state).i ?? 0, opts.length)];
}

/** Write into a text field. */
export const setTextValue = (s: string): FunctionState => ({ s });

/**
 * Apply a level advancement to the element it names (v0.42.1, owner).
 *
 * Returns the element AND the state, because the two move together: a Combo Die that becomes a d6 has
 * a new ceiling and a new current value, and leaving the value behind would show a d4's number under
 * a d6's label. An advancement that unlocks simply opens the element and leaves the number alone.
 */
export function applyAdvance(f: CardFunction, state: FunctionState, effect: AdvanceEffect): { fn: CardFunction; state: FunctionState } {
  if (effect.kind === 'unlock') return { fn: { ...f, locked: false, hidden: false }, state: stateOf(f, state) };
  if (effect.kind === 'set') {
    if (f.kind === 'counter') { const fn = { ...f, start: effect.value }; return { fn, state: { n: clampCounter(fn, effect.value) } }; }
    if (f.kind === 'cycle') { const i = clampIndex(effect.value, f.options?.length ?? 0); return { fn: { ...f, startIndex: i }, state: { i } }; }
    return { fn: { ...f, placeholder: effect.text ?? f.placeholder }, state: { s: effect.text ?? '' } };
  }
  /**
   * A step on a CYCLE moves it along its own list and CLAMPS at the end (v0.42.1).
   *
   * A cycle wraps when the player presses it, because that is what a toggle does. An advancement is
   * not a press: "one step bigger" on a d12 Combo Die is not a d4, it is a d12, so the last option is
   * where it stops.
   */
  if (f.kind === 'cycle') {
    const last = Math.max(0, (f.options?.length ?? 0) - 1);
    const at = (n: number) => Math.max(0, Math.min(last, n));
    return { fn: { ...f, startIndex: at((f.startIndex ?? 0) + effect.by) }, state: { i: at((stateOf(f, state).i ?? 0) + effect.by) } };
  }
  // A step moves the whole range, which is what "one step bigger" means for a die.
  if (f.kind !== 'counter') return { fn: f, state: stateOf(f, state) };
  const fn: CardFunction = {
    ...f,
    start: (f.start ?? 0) + effect.by,
    min: f.min == null ? undefined : f.min + effect.by,
    max: f.max == null ? undefined : f.max + effect.by,
  };
  return { fn, state: { n: clampCounter(fn, (stateOf(f, state).n ?? 0) + effect.by) } };
}

/** How many times an advancement may still be taken at this tier. */
export function advanceRemaining(a: CardAdvance, tier: number, takenAtTier: number): number {
  if (a.tiers.length && !a.tiers.includes(tier)) return 0;
  return Math.max(0, a.perTier - takenAtTier);
}

/** A one-line description of what an author has configured, for the editor's own list. */
export function functionSummary(f: CardFunction): string {
  const lock = f.hidden ? ', hidden until unlocked' : f.locked ? ', locked' : '';
  if (f.kind === 'counter') {
    const floor = f.min ? `${f.min} to ` : '';
    const range = f.max != null && f.max > 0 ? `${f.start ?? 0}, ${floor}${f.max}` : `${f.start ?? 0}`;
    return (f.countdown ? `Countdown, ${range}${f.loop ? ', restarts' : ''}` : `Counter, ${range}`) + lock;
  }
  if (f.kind === 'text') return `Text, ${f.lines && f.lines > 1 ? `${f.lines} lines` : 'one line'}` + lock;
  return `Cycle, ${(f.options ?? []).length} options` + lock;
}

/** Functions that are worth keeping when the editor closes: a cycle needs options, the rest do not. */
export const meaningfulFunctions = (list: CardFunction[] | undefined): CardFunction[] =>
  (list ?? []).filter((f) => f.kind !== 'cycle' || (f.options ?? []).some((o) => o.trim()));

/** The functions that sit above the card's body, and the ones that sit below. */
export const functionsAt = (list: CardFunction[] | undefined, where: FunctionPlacement): CardFunction[] =>
  (list ?? []).filter((f) => f.placement === where);
