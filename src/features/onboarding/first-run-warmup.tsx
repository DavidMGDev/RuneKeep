import { useEffect, useRef, useState } from 'react';
import { Platform } from 'react-native';

import { LoadingScreen } from '@/components/loading-screen';
import { seedOfficialExpansions } from '@/lib/expansions';
import { preloadAllSfx, preloadProgress, preloadSfx } from '@/lib/sfx';

/**
 * The first-run warmup (v0.28.0).
 *
 * Everything the app needs on a first run used to be built lazily, while the player was already
 * using it: the sounds decoded on the first tap that wanted one, the card art fetched as each card
 * scrolled into view, the expansions seeded on the way into the creator. Each of those is small on
 * its own and they land together, which is why the first few minutes felt worse than every session
 * after it.
 *
 * So do it once, up front, behind a screen that says so. What is worth warming was measured rather
 * than guessed: on a first load the audio is the largest single item the app fetches, larger than the
 * JavaScript bundle, and the card thumbnails are the next.
 *
 * Deliberately NOT warmed: the full-resolution card faces (tens of megabytes, and most are never
 * looked at), and anything belonging to a character, because on a first run there is not one yet.
 *
 * It runs once per install. A returning player never sees it: `done` is written when it finishes, and
 * the whole component renders nothing at all when that flag is already set.
 */
const STEPS = ['Waking the keep', 'Tuning the strings', 'Inking the cards'] as const;

export function FirstRunWarmup({ onDone }: { onDone: () => void }) {
  const [step, setStep] = useState(0);
  const [progress, setProgress] = useState(0);
  const cancelled = useRef(false);

  useEffect(() => {
    cancelled.current = false;
    const run = async () => {
      // 1. Expansion records, so the creator's picker does not build them on arrival.
      setStep(0);
      setProgress(0.05);
      try {
        await seedOfficialExpansions();
      } catch {
        // A seed that fails is not worth blocking entry over; the creator seeds again on demand.
      }
      if (cancelled.current) return;

      // 2. Sound. The engine is woken and the latency-sensitive set decoded, then the rest is left
      //    running in the background: nothing after this point waits on it.
      setStep(1);
      preloadSfx();
      const started = Date.now();
      // Poll rather than await: `decode` has no aggregate promise, and a sound that fails to decode
      // must not hold the door shut. Two seconds is a ceiling, not a target.
      await new Promise<void>((resolve) => {
        const tick = () => {
          const { done, total } = preloadProgress();
          setProgress(0.1 + 0.6 * (total ? done / total : 1));
          if (done >= total || Date.now() - started > 2000 || cancelled.current) resolve();
          else setTimeout(tick, 80);
        };
        tick();
      });
      if (cancelled.current) return;
      preloadAllSfx(); // the remainder, unwaited

      // 3. Card thumbnails, so the first deck does not assemble in front of the player. Web only:
      //    on a phone the art is already on disk in the bundle, and the forge warms itself.
      setStep(2);
      setProgress(0.75);
      if (Platform.OS === 'web') {
        try {
          const { Image } = await import('expo-image');
          const { CATALOG } = await import('@/data/catalog');
          const thumbs = CATALOG.map((c) => c.thumb).filter(Boolean).slice(0, 60);
          await Promise.all(thumbs.map((t) => Image.prefetch(t as never).catch(() => undefined)));
        } catch {
          // Prefetch is an optimisation. If it is unavailable the cards simply load as they appear.
        }
      }
      if (cancelled.current) return;
      setProgress(1);
      onDone();
    };
    void run();
    return () => {
      cancelled.current = true;
    };
  }, [onDone]);

  return <LoadingScreen label={STEPS[step]} progress={progress} />;
}
