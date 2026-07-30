import { Platform } from 'react-native';

/**
 * The soft keyboard in a browser (v0.26.0).
 *
 * A phone browser shrinks the page itself when the keyboard opens. React Native's `Keyboard` events
 * may ALSO fire, so a screen that reserves space for the keyboard reserves it twice: once because
 * the viewport got shorter, and again because it added a spacer. That is the reported "the keyboard
 * raises the UI by about 1.8 keyboards" — the card scrolled clean off the top.
 *
 * So on web nothing is reserved, and the field is scrolled into view instead. The browser is already
 * doing the layout half of the job; it just does not always scroll to the right place, which is the
 * only part worth adding.
 */
export const RESERVES_KEYBOARD_SPACE = Platform.OS !== 'web';

/**
 * Bring the focused field into the middle of what is still visible. Safe to call anywhere: it does
 * nothing off web, and nothing if the event carries no DOM node.
 */
export function scrollFieldIntoView(e: unknown): void {
  if (Platform.OS !== 'web') return;
  const node = (e as { target?: { scrollIntoView?: (opts: ScrollIntoViewOptions) => void } } | undefined)?.target;
  const scroll = node?.scrollIntoView;
  if (!node || !scroll) return;
  // A beat, so the viewport has finished resizing around the keyboard before we aim at its middle.
  setTimeout(() => {
    try {
      scroll.call(node, { block: 'center', behavior: 'smooth' });
    } catch {
      // An element detached between focus and the timer is not worth a crash.
    }
  }, 120);
}
