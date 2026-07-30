/**
 * Fitting text to a box (v0.27.0).
 *
 * The sheet's character name grows to fill its box and shrinks when it is long. On a phone that is
 * driven by `onTextLayout`, which reports the real line boxes after a render, so the component tries
 * a size, sees what happened, and tries again.
 *
 * **react-native-web does not implement `onTextLayout`.** The callback simply never fires, so the
 * search never took a single step: the name stayed at its maximum size, overflowed a box with
 * `overflow: hidden`, and what a player saw was a sheet with no name on it.
 *
 * So the search is separated from the measuring. The search is here, pure, and a browser answers it
 * with a canvas, which can measure text without rendering it. The phone keeps the callback it
 * already had, because that measurement is the true one there.
 */

/** What one candidate size does in the box: how many lines, how wide the widest is, how tall in total. */
export interface Measured {
  lines: number;
  widest: number;
  height: number;
}

export interface FitOptions {
  width: number;
  height: number;
  maxLines: number;
  minSize: number;
  maxSize: number;
  /** Measure the text at a candidate size. Called O(log(max-min)) times. */
  measure: (size: number) => Measured;
}

/**
 * The largest whole font size in [minSize, maxSize] that fits the box, or minSize if none does.
 *
 * Returning minSize rather than nothing when nothing fits is deliberate: a name too long for any
 * size still has to appear, clipped, rather than vanish.
 */
export function fitFontSize({ width, height, maxLines, minSize, maxSize, measure }: FitOptions): number {
  const fits = (size: number): boolean => {
    const m = measure(size);
    // The half-pixel slack matches the on-device path: a measurement that lands exactly on the edge
    // should count as fitting, or the name shrinks a step for nothing.
    return m.lines <= maxLines && m.widest <= width + 0.5 && m.height <= height + 0.5;
  };
  let lo = Math.floor(minSize);
  let hi = Math.floor(maxSize);
  if (hi <= lo) return lo;
  if (fits(hi)) return hi;
  let best = lo;
  while (lo <= hi) {
    const mid = Math.floor((lo + hi) / 2);
    if (fits(mid)) {
      best = mid;
      lo = mid + 1;
    } else {
      hi = mid - 1;
    }
  }
  return Math.max(Math.floor(minSize), best);
}

// ---------------------------------------------------------------------------
// The browser's measurement
// ---------------------------------------------------------------------------

let canvasCtx: CanvasRenderingContext2D | null | undefined;

/** One shared 2d context, since it is only ever asked to measure. */
function ctx2d(): CanvasRenderingContext2D | null {
  if (canvasCtx !== undefined) return canvasCtx;
  try {
    canvasCtx = document.createElement('canvas').getContext('2d');
  } catch {
    canvasCtx = null;
  }
  return canvasCtx;
}

export interface WebMeasureSpec {
  text: string;
  family: string;
  letterSpacing: number;
  /** Multiplied by the font size, matching the component's own line height. */
  lineHeightRatio: number;
  width: number;
}

/**
 * Measure wrapped text in a browser, greedily, the way a text box wraps it.
 *
 * Returns null when there is no canvas to measure with, so the caller can fall back rather than
 * guess. Letter spacing is applied by hand when the engine does not support `ctx.letterSpacing`,
 * which is the difference between a name that just fits and one that just does not.
 */
export function measureWeb(spec: WebMeasureSpec, size: number): Measured | null {
  const ctx = ctx2d();
  if (!ctx) return null;
  ctx.font = `${size}px "${spec.family}", sans-serif`;
  const spacing = spec.letterSpacing;
  const supportsSpacing = 'letterSpacing' in ctx;
  if (supportsSpacing) (ctx as unknown as { letterSpacing: string }).letterSpacing = `${spacing}px`;
  const widthOf = (s: string) => ctx.measureText(s).width + (supportsSpacing ? 0 : spacing * Math.max(0, s.length - 1));

  const words = spec.text.split(/\s+/).filter(Boolean);
  if (!words.length) return { lines: 0, widest: 0, height: 0 };
  const rows: string[] = [];
  let row = words[0];
  for (const w of words.slice(1)) {
    const candidate = `${row} ${w}`;
    if (widthOf(candidate) <= spec.width) row = candidate;
    else {
      rows.push(row);
      row = w;
    }
  }
  rows.push(row);
  const widest = rows.reduce((m, r) => Math.max(m, widthOf(r)), 0);
  return { lines: rows.length, widest, height: rows.length * size * spec.lineHeightRatio };
}
