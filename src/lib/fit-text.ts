/**
 * Fitting a block of card text into the space that is left, without ever cutting it (v0.30.0).
 *
 * The Katana is the card that made this necessary: its feature runs to three lines, the lower body of
 * a weapon card only has room for two and a half, and nothing stopped the overflow, so the word
 * "range." printed straight through the "RuneKeep" watermark in the footer. Longer homebrew
 * descriptions do the same thing.
 *
 * Neither of the obvious answers works here:
 *
 *  - `numberOfLines` cuts, and a card that hides the last line of a rule is worse than an ugly one.
 *  - `adjustsFontSizeToFit` does nothing on web (react-native-web has no implementation), and the web
 *    build has to render the same cards. It also needs `numberOfLines` to have anything to shrink
 *    towards, which brings the cutting back.
 *
 * So the size is CHOSEN before rendering, from the text itself. That has a second benefit worth more
 * than it sounds: forged cards are captured to a bitmap cache, and a value computed during layout can
 * be captured a frame before it settles. A pure function cannot.
 *
 * The measurement is an estimate, not a truth: it assumes an average glyph advance rather than
 * measuring the font. It is deliberately biased towards over-estimating how much room the text needs,
 * because being a quarter-point too small is invisible and being a line too big is the bug.
 */

/** How wide an average glyph is, as a fraction of the font size, in the app's body face.
 *  Derived from real rendered lines on the weapon cards; see the header on why it errs high. */
const CHAR_RATIO = 0.53;

export interface FitBox {
  /** Usable width in design px (the container minus its horizontal padding). */
  width: number;
  /** Usable height in design px. */
  height: number;
  /** The size to use when the text already fits. Never exceeded, so cards that fit today do not move. */
  base: number;
  /** lineHeight / fontSize, so the shrunk text keeps the leading it was typeset with. */
  lineRatio: number;
  /** Never shrink past this, however long the text is. */
  min?: number;
}

export interface Fit {
  fontSize: number;
  lineHeight: number;
  /** Lines the text is expected to take at that size. */
  lines: number;
}

/**
 * How many lines `text` takes at `perLine` characters, wrapping on words the way a text engine does.
 *
 * Word wrapping is the part that matters. A plain `length / perLine` says the Katana's feature is two
 * lines when it is really three, because the break falls four characters early, and that one line is
 * the entire difference between fitting and printing over the footer.
 */
export function wrapLines(text: string, perLine: number): number {
  if (perLine < 1) return Number.POSITIVE_INFINITY;
  let lines = 0;
  for (const para of text.split('\n')) {
    const words = para.trim().split(/\s+/).filter(Boolean);
    if (!words.length) {
      lines += 1; // a blank line is still a line
      continue;
    }
    lines += 1;
    let used = 0;
    for (const w of words) {
      const need = used === 0 ? w.length : w.length + 1; // the space only counts mid-line
      if (used + need <= perLine) {
        used += need;
        continue;
      }
      // Onto a new line. A word longer than the whole line wraps inside itself. An EMPTY current line
      // is already that new line, so only the internal wraps count.
      const extra = Math.ceil(w.length / perLine) - 1;
      lines += (used === 0 ? 0 : 1) + extra;
      used = w.length - extra * perLine;
    }
  }
  return lines;
}

const round = (n: number) => Math.round(n * 100) / 100;

/**
 * The largest size at or below `base` at which `text` fits the box.
 *
 * Steps down a quarter point at a time rather than solving, because line count is a step function of
 * the size (a quarter point can be the difference between three lines and two) and stepping is both
 * exact and trivially readable.
 */
export function fitText(text: string, box: FitBox): Fit {
  const { width, height, base, lineRatio, min = 6 } = box;
  const body = (text ?? '').trim();
  if (!body) return { fontSize: base, lineHeight: round(base * lineRatio), lines: 0 };
  for (let size = base; size >= min; size -= 0.25) {
    const lineHeight = size * lineRatio;
    const lines = wrapLines(body, Math.floor(width / (size * CHAR_RATIO)));
    if (lines * lineHeight <= height) return { fontSize: round(size), lineHeight: round(lineHeight), lines };
  }
  // Longer than any size can hold. Sit at the floor: the text runs on rather than disappearing, and
  // the caller's container clips it, which is the least-bad end of a card nobody should be authoring.
  const lineHeight = min * lineRatio;
  return { fontSize: min, lineHeight: round(lineHeight), lines: Math.max(1, Math.floor(height / lineHeight)) };
}
