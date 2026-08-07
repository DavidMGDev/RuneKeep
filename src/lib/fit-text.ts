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

/**
 * How wide an average glyph is, as a fraction of the font size, in the app's body face.
 *
 * MEASURED (v0.32.2): summing Archivo Regular's `hmtx` advances over a page of real card text gives
 * **0.438 em**. This is deliberately 0.53, about 21% wider, so the line count always errs high and the
 * text is chosen a shade small rather than a line too big. Do not "correct" it to the measured value.
 */
const CHAR_RATIO = 0.53;

/**
 * The tightest leading worth asking any platform for, as a fraction of the font size.
 *
 * MEASURED (v0.32.2): Archivo's own line box is 1.088 em (hhea and typo agree, and the font sets
 * USE_TYPO_METRICS, so Android reads the same 1.088 a browser does rather than the 1.51 win metrics).
 * Asking for less than the font's own box is where renderers start to disagree, so the floor sits
 * just above it. v0.32.0 allowed 1.05, which was under it.
 */
export const MIN_LINE_RATIO = 1.12;

export interface FitBox {
  /** Usable width in design px (the container minus its horizontal padding). */
  width: number;
  /** Usable height in design px. */
  height: number;
  /** The size to use when the text already fits. Never exceeded, so cards that fit today do not move. */
  base: number;
  /** lineHeight / fontSize, so the shrunk text keeps the leading it was typeset with. */
  lineRatio: number;
  /** The size to aim for. Text that needs less than this keeps its designed leading. */
  min?: number;
  /**
   * How wide an average glyph is, as a fraction of the font size, for THIS text (v0.36.2).
   *
   * Defaults to the body face. A card TITLE is a different measurement entirely: uppercase, in the
   * black weight, with letter spacing on top, which is far wider per character than running body
   * text. Sizing a title with the body's number is what let a title overflow its own line and get
   * cut off with an ellipsis (see `fitTitle`).
   */
  charRatio?: number;
  /**
   * The tightest leading allowed before the FONT has to give way instead (v0.32.0).
   *
   * The owner's rule for overlong text is "shrink spacings, font size, whatever it takes, but never
   * cut a word". Leading was the one lever that was not being pulled: the ratio was fixed, so a card
   * that would have fitted at slightly tighter leading was instead truncated. Defaults to `lineRatio`,
   * which is the old behaviour exactly.
   */
  minRatio?: number;
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
/** The absolute floor, below which text is not text any more. Only reached by a body nobody should
 *  be authoring; it exists so such a card ruins itself rather than printing over the card's footer. */
const HARD_MIN = 3.5;

export function fitText(text: string, box: FitBox): Fit {
  const { width, height, base, lineRatio, min = 6, charRatio = CHAR_RATIO } = box;
  // Never ask for tighter leading than the face's own line box, however tight the caller asked for.
  const minRatio = Math.max(box.minRatio ?? lineRatio, MIN_LINE_RATIO);
  const body = (text ?? '').trim();
  if (!body) return { fontSize: base, lineHeight: round(base * lineRatio), lines: 0 };
  for (let size = base; size >= Math.min(min, HARD_MIN); size -= 0.25) {
    const lines = wrapLines(body, Math.floor(width / (size * charRatio)));
    if (lines < 1 || !Number.isFinite(lines)) continue;
    // The tallest line this many lines can afford. Use the designed leading when there is room for
    // it and only tighten when there is not, so an ordinary card is typeset exactly as before.
    const afford = height / lines;
    if (afford >= size * minRatio) return { fontSize: round(size), lineHeight: round(Math.min(size * lineRatio, afford)), lines };
  }
  /**
   * Longer than the floor can hold with any leading. Fit it ANYWAY, by construction: lines × height
   * is the box exactly, and the font comes down to meet the leading so glyphs never overlap.
   *
   * v0.32.0: this used to return a LINE COUNT rather than a fit — `floor(height / lineHeight)` — and
   * the caller passed that to `numberOfLines`. Two things went wrong. The count was a lie (a 20-line
   * body reported 15), and Android will not honour a `lineHeight` below the font's own natural line
   * height, so those 15 lines rendered taller there than the arithmetic said and ran into the footer
   * watermark. A browser honours the value exactly, which is why only the phone showed it.
   */
  const lines = Math.max(1, wrapLines(body, Math.max(1, Math.floor(width / (HARD_MIN * charRatio)))));
  const lineHeight = Math.max(1, height / lines);
  return { fontSize: round(Math.min(HARD_MIN, lineHeight)), lineHeight: round(lineHeight), lines };
}

/**
 * A card TITLE, fitted into a band that never changes height (v0.36, owner).
 *
 * A title that ran to two or more lines pushed its own description down a line each time, and the
 * description had nowhere to go, so its last lines were clipped off the bottom of the card. It only
 * showed on a phone because the two size mechanisms disagreed: `adjustsFontSizeToFit` shrinks a title
 * on native and does NOTHING on react-native-web, so a browser drew titles at full size while the
 * body's arithmetic assumed they might be smaller.
 *
 * Choosing the size here fixes both. The band is one line tall at the designed size:
 *
 *  - a title that fits on one line at full size is drawn exactly as it always was;
 *  - a longer one steps down until one line fits;
 *  - a much longer one steps down until TWO lines fit inside the SAME band, which is the owner's
 *    rule: two lines only once the type is small enough that they cost the description nothing.
 *
 * `minRatio` is stated rather than left to default to `band / base`: at exactly one line the afford
 * and the requirement are the same number, and floating point should not decide a card.
 */
/**
 * How wide a card TITLE's average glyph is (v0.36.2, owner: titles bleeding off the card past ~17 characters).
 *
 * A title is not body text: it is UPPERCASE, set in the black weight, with letter spacing on top.
 * Sizing it with the body's 0.53 said a 22 character title fitted one line at 17pt when the real
 * limit is about 17, so anything longer overflowed its line and `numberOfLines` cut it with an
 * ellipsis. The owner's report puts the break at "around 17 characters", which back-solves to
 * 200 / (17 x 17) = 0.69 em; this is 0.72, biased a few percent high for the same reason the body
 * ratio is, so the type comes out a shade small rather than a character too wide.
 */
const TITLE_CHAR_RATIO = 0.72;

export function fitTitle(text: string, width: number, band: number, base: number): Fit {
  return fitText(text, { width, height: band, base, lineRatio: band / base, min: 5.5, minRatio: MIN_LINE_RATIO, charRatio: TITLE_CHAR_RATIO });
}
