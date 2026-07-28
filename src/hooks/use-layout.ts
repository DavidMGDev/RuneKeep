import { useWindowDimensions } from 'react-native';

/**
 * Layout mode (v0.23.0).
 *
 * The whole tablet strategy in one idea: **the UI should look the same, not stretched**. A phone
 * layout blown out to 800dp gives you 760dp-wide rows holding a five-character name, three
 * enormous blurry card thumbs, and 320dp dialogs marooned in the middle. None of that is "bigger",
 * it is just wrong at a larger size.
 *
 * So on a tablet the content keeps a phone-like measure, centred, and everything inside it scales up
 * modestly so it does not read as tiny. Grids get MORE columns rather than bigger cells, which is the
 * one place where scaling up would be actively worse (the thumbnails are 188px and already upscale
 * on a phone).
 *
 * ## The breakpoint
 *
 * `smallestWidth >= 600dp`, which is Android's own tablet threshold and the same number the platform
 * uses for its `sw600dp` resource bucket. The margin over phones is deliberately enormous:
 *
 *   - 6.1" phone      ~390dp
 *   - 6.7" phone      ~430dp
 *   - 6.9" phone      ~480dp
 *   - foldable, open  ~670-720dp   <- correctly treated as a tablet
 *   - 10" tablet      ~800dp
 *
 * Nothing a phone can report comes near 600, so no phone can ever slip into tablet mode. Using the
 * SMALLEST dimension rather than the current width also means a phone in landscape stays a phone.
 */

/** Android's own tablet threshold. Phones top out around 480dp, so the margin is ~25%. */
export const TABLET_MIN_SW = 600;

/** How much larger everything reads on a tablet. Deliberately modest: this is the same UI, not a new one. */
export const TABLET_SCALE = 1.3;

/** The measure the content column keeps on a tablet, before scaling. Roughly a large phone. */
const BASE_CONTENT = 440;

export interface Layout {
  isTablet: boolean;
  /** Multiply fixed dp (font sizes, control heights, dialog widths) by this. 1 on phones. */
  scale: number;
  /** Max width for a centred content column. `Infinity` on phones, so nothing is constrained. */
  maxContent: number;
  width: number;
  height: number;
}

export function useLayout(): Layout {
  const { width, height } = useWindowDimensions();
  const isTablet = Math.min(width, height) >= TABLET_MIN_SW;
  return {
    isTablet,
    scale: isTablet ? TABLET_SCALE : 1,
    maxContent: isTablet ? BASE_CONTENT * TABLET_SCALE : Infinity,
    width,
    height,
  };
}

/**
 * Scale a fixed dp value for the current layout. A no-op on phones by construction, so every call
 * site is provably phone-identical.
 */
export function scaled(n: number, scale: number): number {
  return scale === 1 ? n : Math.round(n * scale);
}

/**
 * Columns for a card grid. Phones keep the hard-coded 3 they have always had; tablets add columns so
 * each cell stays about the size it is on a phone, instead of three 250dp cells rendering 188px
 * thumbnails at 2.6x.
 */
export function gridColumns(width: number, isTablet: boolean, phoneCols = 3): number {
  if (!isTablet) return phoneCols;
  const target = 132; // roughly a phone cell, so thumbnails stay near their native size
  return Math.max(phoneCols, Math.min(7, Math.floor(width / target)));
}
