import { createContext, useContext } from 'react';
import { useWindowDimensions } from 'react-native';

/**
 * Layout mode (v0.24.0).
 *
 * v0.23.0 adapted each screen for tablets: a wider centred column, scaled-up controls, more grid
 * columns. That worked, but it made the app a DIFFERENT app on a tablet. A creation step that puts
 * six trait dials in two rows of three on a phone put five in one row and one alone on a tablet, and
 * the sheet's carousel spilled past the gold border into empty space.
 *
 * So the strategy changed to the one the owner asked for: **the tablet runs the phone UI**. The whole
 * app renders into a phone-shaped viewport (`DESIGN_W` x whatever height fits), uniformly scaled up
 * and centred, with the border sitting on the edge of that viewport and the leftover screen used as
 * decorated margin. See `components/phone-frame.tsx`.
 *
 * That makes this module small again. `PhoneFrame` publishes the viewport it created through
 * `FrameContext`, and everything downstream asks `useLayout()` for the size of the space it is
 * actually laying out in, rather than the size of the physical display. Inside the frame that is
 * ~412dp, so `isTablet` reads false and every v0.23.0 tablet branch turns itself off. Nothing needed
 * to be deleted; it just stopped firing.
 *
 * ## The breakpoint
 *
 * `smallestWidth >= 600dp`, Android's own `sw600dp` bucket:
 *
 *   - 6.9" phone      ~480dp
 *   - foldable, open  ~670-720dp   <- correctly framed
 *   - 10" tablet      ~800dp
 *
 * Nothing a phone reports comes near 600, so a phone can never enter the frame.
 */

/** Android's own tablet threshold. Phones top out around 480dp, so the margin is ~25%. */
export const TABLET_MIN_SW = 600;

/** The width the whole app is authored at. Same number the character sheet's DesignStage uses. */
export const DESIGN_W = 412;
/** The reference height, used only to pick the frame's scale. Real height is whatever fits. */
export const DESIGN_H = 892;

export interface Frame {
  /** Width of the viewport being laid out in, in layout dp. */
  width: number;
  /** Height of the viewport being laid out in, in layout dp. */
  height: number;
  /** How much the viewport is magnified on the physical display. 1 when unframed. */
  scale: number;
  /** Physical x of the viewport's left edge. Non-zero only when the frame is centred in margins. */
  offsetX: number;
}

/** Set by `PhoneFrame`. Absent on phones, where the viewport IS the window. */
export const FrameContext = createContext<Frame | null>(null);

/** The viewport the caller is laying out in. Use this instead of `Dimensions.get('window')`. */
export function useFrame(): Frame {
  const ctx = useContext(FrameContext);
  const { width, height } = useWindowDimensions();
  return ctx ?? { width, height, scale: 1, offsetX: 0 };
}

export interface Layout extends Frame {
  /** True only when laying out directly on a large display, which the frame prevents. */
  isTablet: boolean;
  /** Retained so v0.23.0 call sites still compile. Always 1 now: the frame does the magnifying. */
  scale: number;
  /** Retained for the same reason. Always `Infinity`: the frame is the measure. */
  maxContent: number;
}

export function useLayout(): Layout {
  const frame = useFrame();
  return {
    ...frame,
    // Inside the frame this is ~412, so every tablet branch downstream evaluates false and the
    // phone layout runs verbatim. Outside it (a phone) it was already false.
    isTablet: Math.min(frame.width, frame.height) >= TABLET_MIN_SW,
    scale: 1,
    maxContent: Infinity,
  };
}

/**
 * Convert a WINDOW coordinate (`e.absoluteX`, `measureInWindow`) into the frame's layout space.
 *
 * Gesture handlers and `measureInWindow` both report physical window coordinates, which ignore the
 * frame's transform. Anything that positions a view from them, a drag ghost, a radial cursor, has to
 * come back through here or it lands a margin-width away from the finger. Pure maths so it inlines
 * into a worklet.
 */
export function windowToFrameX(x: number, frame: Frame): number {
  return (x - frame.offsetX) / frame.scale;
}

/** The vertical twin. The frame is always full-height, so this is scale only. */
export function windowToFrameY(y: number, frame: Frame): number {
  return y / frame.scale;
}

/** Scale a fixed dp value for the current layout. A no-op now; kept so call sites read unchanged. */
export function scaled(n: number, _scale: number): number {
  return n;
}

/** Columns for a card grid. The frame means a tablet gets the phone's grid, which is the point. */
export function gridColumns(_width: number, _isTablet: boolean, phoneCols = 3): number {
  return phoneCols;
}
