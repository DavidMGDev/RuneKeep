/**
 * Keyboard control (v0.26.0).
 *
 * RuneKeep is built for thumbs. On a desktop that leaves you dragging a phone-shaped column around
 * with a mouse, which works and feels wrong. This is the translation layer: a key press plus what is
 * currently on screen becomes an INTENT, and the app performs it.
 *
 * Pure on purpose. No React, no DOM, no platform calls, so every key in every context is a table
 * test rather than something you have to sit in a browser to check.
 *
 * The bindings follow two conventions players already have. Games use WASD and arrows for movement,
 * so both do the same thing. Desktop applications use Escape to back out and Enter to confirm, so
 * those win over everything else.
 */

/** What a key press means. The app decides how to perform it. */
export type Intent =
  /** Move along the carousel. `step` says how far and which way. */
  | { kind: 'move'; step: number }
  /** Bring the current card up to full screen. */
  | { kind: 'focus' }
  /** Put the current card back / leave full screen. */
  | { kind: 'unfocus' }
  /** Equip or unequip the current card. */
  | { kind: 'toggle' }
  /** Enter or leave edit mode. */
  | { kind: 'editMode' }
  /** Raise or lower the current card's selection, in edit mode. */
  | { kind: 'select' }
  /** Move to the previous / next category ring. */
  | { kind: 'category'; step: number }
  /** Confirm the primary action of whatever is open. */
  | { kind: 'confirm' }
  /** Close whatever is open. */
  | { kind: 'dismiss' };

/** What is on screen, which is what makes the same key mean different things. */
export interface KeyContext {
  /** A text field has focus. Almost everything must reach the field instead of the app. */
  typing: boolean;
  /** A dialog, panel or overlay is open. Escape closes it; movement keys are not ours. */
  overlay: boolean;
  /** A card is full screen. */
  focused: boolean;
  /** Edit mode is on. */
  editing: boolean;
}

/** The key press itself, as much of it as matters. */
export interface KeyPress {
  key: string;
  shift?: boolean;
  /** A modifier means the press belongs to the browser or the OS, never to us. */
  ctrl?: boolean;
  meta?: boolean;
  alt?: boolean;
}

/** How many cards a shifted movement key crosses. */
export const SHIFT_STEP = 2;

const LEFT = new Set(['ArrowLeft', 'a', 'A']);
const RIGHT = new Set(['ArrowRight', 'd', 'D']);
const UP = new Set(['ArrowUp', 'w', 'W']);
const DOWN = new Set(['ArrowDown', 's', 'S']);

/**
 * The intent for a key press, or null when the app should keep its hands off.
 *
 * Null is the important half. A player typing a character name must be able to write "was" without
 * the carousel lurching three cards sideways, and Ctrl+R must still reload the page.
 */
export function intentFor(press: KeyPress, ctx: KeyContext): Intent | null {
  const { key } = press;

  // Anything held with a modifier belongs to the browser or the OS.
  if (press.ctrl || press.meta || press.alt) return null;

  // While typing, only the two keys that mean the same thing in every text field get through.
  if (ctx.typing) {
    if (key === 'Escape') return { kind: 'dismiss' };
    if (key === 'Enter') return { kind: 'confirm' };
    return null;
  }

  if (key === 'Escape') return { kind: 'dismiss' };
  if (key === 'Enter') return { kind: 'confirm' };

  // An overlay owns the screen. Only Escape and Enter above are ours while one is open, or a key
  // meant for a dialog would also be steering the carousel behind it.
  if (ctx.overlay) return null;

  const step = press.shift ? SHIFT_STEP : 1;
  if (LEFT.has(key)) return { kind: 'move', step: -step };
  if (RIGHT.has(key)) return { kind: 'move', step };

  // Up focuses, down unfocuses. Shifted, they cross CATEGORIES instead, which is the same
  // "sideways is within, up and down is between" idea the carousel already uses.
  //
  // v0.29.0: neither is ours in EDIT MODE. Edit mode is a flat row being rearranged, with no card to
  // open and no hand to bundle, so focusing or collapsing from under it left the deck in a state edit
  // mode does not have a drawing for. Sideways still moves along the row, shifted still changes
  // category, and both keys come back the moment edit mode is off.
  if (UP.has(key)) {
    if (press.shift) return { kind: 'category', step: -1 };
    return ctx.editing ? null : { kind: 'focus' };
  }
  if (DOWN.has(key)) {
    if (press.shift) return { kind: 'category', step: 1 };
    return ctx.editing ? null : { kind: 'unfocus' };
  }

  // Space equips, which on a phone is a hold. In edit mode it raises the card instead, because that
  // is what a tap does there.
  if (key === ' ' || key === 'Spacebar') return ctx.editing ? { kind: 'select' } : { kind: 'toggle' };

  if (key === 'e' || key === 'E') return { kind: 'editMode' };

  return null;
}

/**
 * Every binding, for the onboarding page. Kept beside the resolver so the two cannot drift.
 *
 * v0.29.0: the keys are a LIST of individual caps rather than one pre-formatted string, so the help
 * page can draw each one as a key instead of printing a line of punctuation. `what` is deliberately
 * short: it has to fit on one line beside the caps, and a wrapped description was what made the old
 * table impossible to read down.
 */
export const KEYBIND_HELP: { caps: string[]; what: string }[] = [
  { caps: ['A', 'D'], what: 'Move along the cards' },
  { caps: ['←', '→'], what: 'The same, with arrows' },
  { caps: ['Shift', 'A', 'D'], what: 'Move two at a time' },
  { caps: ['W'], what: 'Open the card' },
  { caps: ['S'], what: 'Close it, or bundle up' },
  { caps: ['Shift', '↑', '↓'], what: 'Change category' },
  { caps: ['Space'], what: 'Equip or unequip' },
  { caps: ['E'], what: 'Edit mode' },
  { caps: ['Enter'], what: 'Confirm' },
  { caps: ['Esc'], what: 'Close or go back' },
];
