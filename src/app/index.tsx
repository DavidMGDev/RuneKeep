import { useCallback, useState } from 'react';

import { FirstRunWarmup } from '@/features/onboarding/first-run-warmup';
import { MenuScreen } from '@/features/menu/menu-screen';
import { shouldShow } from '@/lib/onboarding-store';

/**
 * Home, behind a one-time warmup (v0.28.0).
 *
 * The first run used to build everything lazily while the player was already using the app: sounds
 * decoded on the first tap that wanted one, card art fetched as each card scrolled into view,
 * expansions seeded on the way into the creator. That is why the first few minutes felt worse than
 * every session after them.
 *
 * It is gated on the welcome tour's own first-run flag rather than a new one. That flag already means
 * exactly "this install has not been used yet", and a warmup that is interrupted simply runs again
 * next launch, because the tour has not been finished either.
 */
export default function Index() {
  const [warm, setWarm] = useState(() => !shouldShow('welcome'));
  const done = useCallback(() => setWarm(true), []);
  if (!warm) return <FirstRunWarmup onDone={done} />;
  return <MenuScreen />;
}
