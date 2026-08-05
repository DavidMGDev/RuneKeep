/**
 * Forging a card ON DEMAND, for the printer (v0.35, owner).
 *
 * The carousel's bitmaps are forged one card at a time in the background, and a card that has not
 * reached the front of that queue carries a placeholder image instead. v0.34.8's print path read that
 * field directly, so every card the app draws itself printed as the RuneKeep app icon on a dark blue
 * square. Right after an update, when the whole cache has just been invalidated, that is most of a
 * character's deck.
 *
 * A browser never forges at all, so there it was every card, always.
 *
 * This is the same capture the forge uses, driven imperatively: hand it a card and it hands back a
 * data URI. Captures are queued one at a time (the stage is a single offscreen view) and each one has
 * a ceiling, so a card that will not render costs a second and falls back to the HTML card rather than
 * hanging the print.
 *
 * The card is drawn at its AUTHORED size on both platforms and enlarged by the rasteriser, not by CSS
 * (v0.35.1). v0.35 scaled the stage with a CSS transform on web so html2canvas would see 750 real
 * pixels; html2canvas clones the node into its own document and re-lays it out, and a scaled, clipped
 * subtree came out mangled, with most class-feature pages drawing nothing but their background at all.
 * `html2canvas` has a `scale` of its own for exactly this, and it renders the untransformed card.
 */
import { Image as ExpoImage } from 'expo-image';
import { forwardRef, type ReactNode, useEffect, useImperativeHandle, useRef, useState } from 'react';
import { View } from 'react-native';

import { FORGED_H, FORGED_W } from './forged-card';
import { captureCard } from './print-capture';

/** 750 x 1050 is 2.5 x 3.5 inches at 300 DPI, which is what a card is. */
export const PRINT_PX_W = 750;
export const PRINT_PX_H = 1050;

/**
 * A bundled picture, as something the stage can DRAW (v0.35.2, owner).
 *
 * A card that ships with the app is a `require()` id, and on Android that is a packaged resource with
 * no file behind it: there are no bytes to inline, and the URI means nothing to a print engine. The
 * app renders those images perfectly well, so the way to get bytes is to draw one and photograph it,
 * which is what this is for. Every base-game ancestry, community, subclass and domain card went to the
 * printer as a plain rectangle of text until this existed.
 */
export function PrintableImage({ source }: { source: number | { uri: string } }) {
  return <ExpoImage source={source} style={{ width: FORGED_W, height: FORGED_H }} contentFit="cover" cachePolicy="memory-disk" />;
}

export interface PrintStageHandle {
  /** Capture one card to a `data:` URI, or null if it could not be drawn. */
  capture: (node: ReactNode) => Promise<string | null>;
}

export const PrintStage = forwardRef<PrintStageHandle>(function PrintStage(_props, ref) {
  const [node, setNode] = useState<ReactNode>(null);
  const shotRef = useRef<View>(null);
  const pending = useRef<((uri: string | null) => void) | null>(null);
  // One at a time: there is one stage, so a second capture has to wait for the first to leave it.
  const queue = useRef<Promise<unknown>>(Promise.resolve());

  useImperativeHandle(ref, () => ({
    capture: (n: ReactNode) => {
      const run = () =>
        new Promise<string | null>((resolve) => {
          pending.current = resolve;
          setNode(n);
          setTimeout(() => {
            if (pending.current !== resolve) return;
            pending.current = null;
            setNode(null);
            resolve(null); // a card that will not draw is not worth the whole print job
          }, 6000);
        });
      const p = queue.current.then(run, run);
      queue.current = p.catch(() => {});
      return p;
    },
  }), []);

  /**
   * Driven by the NODE changing, not by `onLayout` (v0.35.1).
   *
   * onLayout only fires when the layout actually changes, and every card here is the same size. React
   * batches the "clear the stage" of one capture with the "put this card up" of the next, so from the
   * view's point of view nothing moved: the second card and every card after it timed out, and a
   * multi-card print produced exactly one real card. An effect on the node cannot miss.
   */
  useEffect(() => {
    if (!node || !pending.current) return;
    let live = true;
    // Double rAF lets svg + text paint; the settle after it is for raster art, which decodes
    // asynchronously after layout (the same reason the background forge holds one).
    requestAnimationFrame(() =>
      requestAnimationFrame(() => {
        void (async () => {
          const resolve = pending.current;
          if (!resolve || !live) return;
          let uri: string | null = null;
          try {
            await new Promise((r) => setTimeout(r, 300));
            uri = await captureCard(shotRef, PRINT_PX_W, PRINT_PX_H);
          } catch {
            uri = null; // a card that will not rasterise falls back to the plain HTML card
          }
          if (!live) return;
          pending.current = null;
          setNode(null);
          resolve(uri);
        })();
      }),
    );
    return () => { live = false; };
  }, [node]);

  if (!node) return null;
  return (
    <View style={{ position: 'absolute', left: -4000, top: 0 }} pointerEvents="none">
      <View ref={shotRef} collapsable={false} style={{ width: FORGED_W, height: FORGED_H, overflow: 'hidden' }}>
        {node}
      </View>
    </View>
  );
});
