/**
 * THE WORD ON THE CHIP, COLOURED FOR ITSELF (v0.43.1, owner).
 *
 * "Make sure to adapt the wording color automatically. If the user hasn't configured a word color,
 * just keep it automatic... Make it automatically adapt: if the colors on the gradient are too light,
 * it changes the word coloring. Make it more adaptable, and make it not just be full-on white or
 * full-on black. Rather, try to automatically find a good color for the gradient that the user
 * currently has, unless they define one specifically."
 *
 * A chip is one word on a 10dp band, and the band is a gradient, so the word has to read at BOTH
 * ends of it. `readableInk` in `lib/color` answers a related but different question — black or ivory
 * on one flat swatch — and the answer here should belong to the colours it sits on rather than being
 * one of two constants.
 *
 * ## The rule
 *
 * 1. Try BOTH a light word and a dark one, and keep whichever has the better WORST case across the
 *    two stops. A word on a gradient has to survive the end it suits least, so scoring it against
 *    the mean would let one blown-out stop hide behind the other. On the bands the palette actually
 *    uses, whose two stops are always close in value, this agrees with the obvious answer; on a
 *    pathological black-to-white band it picks the lesser evil instead of a coin toss.
 * 2. Keep the band's HUE, at low saturation. That is what makes it "not full-on white or black": a
 *    crimson chip gets a warm bone rather than #FFFFFF, and a sage one gets a cool one, which is what
 *    the bundled palette does by hand for every published card type (see `KIND_THEMES`).
 * 3. Push lightness far enough for real contrast, and no further. The targets are clamped so the
 *    word never becomes pure white or pure black even on an extreme gradient.
 *
 * Pure, so "does this read" is a table test rather than a screenshot.
 */

import { hexToHsl, hexToRgb, hslToHex, normalizeHex } from './color';

/** Rec. 601 perceived brightness, 0-255. The same weighting `readableInk` uses. */
export function brightness(hex: string): number {
  const [r, g, b] = hexToRgb(hex);
  return (r * 299 + g * 587 + b * 114) / 1000;
}

/** The chip's default band when an author has set no colours: the neutral `feature` plaque. */
export const DEFAULT_FROM = '#2C3038';
export const DEFAULT_TO = '#414750';

/**
 * The word colour for a band running `from` -> `to`.
 *
 * Either stop may be missing, in which case the other stands for the whole band; both missing gives
 * the bundled neutral, so this always answers.
 */
export function autoInk(from?: string | null, to?: string | null): string {
  const a = normalizeHex(from ?? '') ?? normalizeHex(to ?? '') ?? DEFAULT_FROM;
  const b = normalizeHex(to ?? '') ?? normalizeHex(from ?? '') ?? DEFAULT_TO;
  /**
   * A TINT of the band, not a constant.
   *
   * The hue comes from the stop the word will sit least comfortably on, saturation is held low so
   * the word stays type rather than becoming decoration, and lightness is clamped short of both ends
   * so the result is bone or ink rather than #FFFFFF or #000000.
   */
  const tint = (goLight: boolean): string => {
    const anchor = goLight ? (brightness(a) <= brightness(b) ? b : a) : (brightness(a) <= brightness(b) ? a : b);
    const { h, s } = hexToHsl(anchor);
    return hslToHex({ h, s: Math.min(s, goLight ? 34 : 28), l: goLight ? 92 : 12 });
  };
  // The worst case is the stop the candidate is CLOSEST to, so the winner is the candidate whose
  // closest stop is still furthest away.
  const worst = (ink: string) => Math.min(Math.abs(brightness(ink) - brightness(a)), Math.abs(brightness(ink) - brightness(b)));
  const lightInk = tint(true);
  const darkInk = tint(false);
  return worst(lightInk) >= worst(darkInk) ? lightInk : darkInk;
}

/**
 * The colour to actually draw the word in: the author's, when they set one, else the automatic one.
 *
 * The whole of "unless they define one specifically, which overrides whatever automatic work the UI
 * is doing" lives here, so the editor's preview and the shipped card cannot disagree about it.
 */
export function plaqueInk(spec: { from?: string; to?: string; text?: string } | undefined): string {
  const own = normalizeHex(spec?.text ?? '');
  return own ?? autoInk(spec?.from, spec?.to);
}

/**
 * Whether these two colours are far enough apart to read.
 *
 * Used by the editor to warn about a hand-picked word colour that has been left on a band it
 * disappears into. Rec. 601 distance rather than a full WCAG ratio: the chip is a single short word
 * in a bold face at 10dp, and the point is to catch "these are the same colour", not to certify.
 */
export const inkReads = (ink: string, from?: string | null, to?: string | null): boolean => {
  const stops = [normalizeHex(from ?? ''), normalizeHex(to ?? '')].filter((x): x is string => !!x);
  if (!stops.length) return true;
  return stops.every((s) => Math.abs(brightness(ink) - brightness(s)) >= 60);
};
