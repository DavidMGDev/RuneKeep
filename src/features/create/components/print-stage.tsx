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
 * On web the card is drawn at print size before it is captured. `html2canvas` rasterises what is on
 * screen at CSS resolution, so capturing the 230dp card and enlarging it to 750px would print a
 * blurred card; rendering it large in the first place does not.
 */
import { forwardRef, type ReactNode, useCallback, useImperativeHandle, useRef, useState } from 'react';
import { Platform, View } from 'react-native';
import { captureRef } from 'react-native-view-shot';

import { FORGED_H, FORGED_W } from './forged-card';

/** 750 x 1050 is 2.5 x 3.5 inches at 300 DPI, which is what a card is. */
export const PRINT_PX_W = 750;
export const PRINT_PX_H = 1050;
const WEB_SCALE = PRINT_PX_W / FORGED_W;

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

  const onReady = useCallback(() => {
    if (!pending.current) return;
    // Double rAF lets svg + text paint; the settle after it is for raster art, which decodes
    // asynchronously after layout (the same reason the background forge holds one).
    requestAnimationFrame(() =>
      requestAnimationFrame(() => {
        void (async () => {
          const resolve = pending.current;
          if (!resolve) return;
          let uri: string | null = null;
          try {
            await new Promise((r) => setTimeout(r, 300));
            uri = await captureRef(shotRef, { format: 'png', quality: 1, result: 'data-uri', width: PRINT_PX_W, height: PRINT_PX_H });
          } catch {
            uri = null;
          }
          pending.current = null;
          setNode(null);
          resolve(uri);
        })();
      }),
    );
  }, []);

  if (!node) return null;
  const scale = Platform.OS === 'web' ? WEB_SCALE : 1;
  return (
    <View style={{ position: 'absolute', left: -4000, top: 0 }} pointerEvents="none">
      <View ref={shotRef} collapsable={false} onLayout={onReady} style={{ width: FORGED_W * scale, height: FORGED_H * scale, overflow: 'hidden' }}>
        <View style={{ width: FORGED_W, height: FORGED_H, transform: [{ scale }], transformOrigin: [0, 0, 0] }}>{node}</View>
      </View>
    </View>
  );
});
