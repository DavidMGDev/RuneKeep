/**
 * Bold and italic that work without a selection (v0.42.3, owner).
 *
 * "Press it once and it sets the entire word the cursor is at to bold or italic without closing the
 * keyboard. If the user presses it twice in a row without changing the text then the entire section
 * turns bold or italic. Pressing it more without having changed the text reverts the change and
 * removes bold or italic from the section."
 *
 * So one button is three commands, chosen by how many times it has been pressed in a row:
 *
 *   1. the WORD the cursor is in
 *   2. the WHOLE SECTION
 *   3. CLEARED, every mark of that kind removed from the section
 *
 * and then it starts again. Typing anything resets the count, which is the important half of the
 * rule: the cycle is about the press you just made, not about the state of the text. That is also why
 * each press is applied to the text as it was BEFORE the cycle started rather than to the text the
 * last press produced, which would compound the markers into `****word****`.
 *
 * Pure on purpose. The screen owns a cursor and a keyboard; this owns what the text becomes, which is
 * the part that can be wrong in ways nobody notices until a card prints with a stray asterisk.
 */

/** The two marks. A bullet is a line prefix rather than a wrap, and is handled separately. */
export type Mark = '**' | '*';

/** Where the cycle is. `base` is the text the cycle started from, so each step re-applies cleanly. */
export interface MarkCycle {
  mark: Mark;
  /** 0 means nothing pressed yet. 1 word, 2 section, 3 cleared, then back to 1. */
  step: number;
  base: string;
}

/** The word containing (or ending at) the cursor. Returns the empty range when there is no word. */
export function wordRangeAt(text: string, cursor: number): { start: number; end: number } {
  const at = Math.max(0, Math.min(text.length, cursor));
  const isWord = (c: string) => !!c && !/[\s]/.test(c);
  // A cursor sitting just past a word belongs to that word, which is where it lands after typing one.
  let start = at;
  while (start > 0 && isWord(text[start - 1])) start--;
  let end = at;
  while (end < text.length && isWord(text[end])) end++;
  return { start, end };
}

/** Strip every occurrence of one mark, longest first so `**` never leaves a stray `*`. */
export function stripMark(text: string, mark: Mark): string {
  // Bold first in both cases: removing `*` from `**a**` would otherwise leave `a` wrapped in nothing
  // in one pass and `*a*` in the other, depending on order.
  const out = text.replace(/\*\*/g, '');
  return mark === '**' ? out : out.replace(/\*/g, '');
}

const wrap = (text: string, start: number, end: number, mark: Mark): string =>
  `${text.slice(0, start)}${mark}${text.slice(start, end)}${mark}${text.slice(end)}`;

/**
 * One press of Bold or Italic.
 *
 * `cycle` is what the last press left behind, or undefined for a fresh press (including the first
 * press after the author typed). The returned cycle is what to keep until the text changes for any
 * other reason, at which point the caller throws it away.
 *
 * The three steps all start from `base`, never from the previous result, so the marks cannot stack.
 */
export function pressMark(
  text: string,
  selection: { start: number; end: number },
  mark: Mark,
  cycle: MarkCycle | undefined,
): { text: string; cycle: MarkCycle } {
  const live = cycle && cycle.mark === mark ? cycle : { mark, step: 0, base: text };
  const step = (live.step % 3) + 1;
  const base = live.base;
  const next = (t: string): { text: string; cycle: MarkCycle } => ({ text: t, cycle: { mark, step, base } });

  if (step === 3) return next(stripMark(base, mark));

  if (step === 2) {
    const bare = stripMark(base, mark).trim();
    return next(bare ? wrap(bare, 0, bare.length, mark) : base);
  }

  // Step one: the selection if there is one, otherwise the word the cursor is in. A selection is what
  // a user who did select text expects, and it costs nothing to honour it.
  const sel = selection.end > selection.start
    ? selection
    : wordRangeAt(base, selection.start);
  if (sel.end <= sel.start) return next(base);
  return next(wrap(base, sel.start, sel.end, mark));
}

/**
 * A bullet on the line the cursor is in, toggled.
 *
 * Not part of the cycle: a bullet is a line prefix, it is obvious whether a line has one, and pressing
 * it twice should take it off rather than bullet the whole section.
 */
export function toggleBullet(text: string, cursor: number): string {
  const ls = text.lastIndexOf('\n', Math.max(0, cursor - 1)) + 1;
  const line = text.slice(ls);
  return line.startsWith('- ')
    ? `${text.slice(0, ls)}${line.slice(2)}`
    : `${text.slice(0, ls)}- ${line}`;
}
