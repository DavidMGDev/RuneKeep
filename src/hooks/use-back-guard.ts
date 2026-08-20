/**
 * BACK, EVERYWHERE IT COMES FROM (v0.43.1, rewritten v0.43.2).
 *
 * "If I press back inside the creation of a card in the expansions menu, when I add a card and I'm in
 * the middle of the process and I press back, it immediately pushes me back to the main menu."
 *
 * The card editor already guarded Back, and the guard did nothing in a browser: `BackHandler` is
 * React Native's binding for ANDROID'S HARDWARE KEY and nothing else, so on the web the back button,
 * the back gesture, Alt+Left and the mouse's side button all sailed straight past it.
 *
 * Which guard answers, and the promise that arming one can never navigate, live in `lib/back-guard`
 * where they are testable without a screen. This file is the React and DOM half: when to arm, and the
 * one genuinely awkward thing, below.
 */
import { useFocusEffect } from 'expo-router';
import { useCallback, useRef } from 'react';
import { BackHandler, Platform } from 'react-native';

import { createGuardStack } from '@/lib/back-guard';

const isWeb = () => Platform.OS === 'web' && typeof window !== 'undefined';
const spareIsOurs = () => !!(window.history.state as { rkGuard?: boolean } | null)?.rkGuard;

/** The app's one guard stack, and its one spare history entry. */
const guards = createGuardStack({
  pushSpare: () => {
    if (isWeb()) window.history.pushState({ rkGuard: true }, '');
  },
});

/**
 * Put a spare entry on top, and KEEP CHECKING for a moment.
 *
 * A page cannot veto a back navigation. What it can do is keep something cheap to go back TO: one
 * spare entry, which the first Back consumes instead of leaving. `popstate` then fires with the
 * screen still mounted and the topmost guard gets to ask its question.
 *
 * The awkward part is that THE ROUTER OWNS HISTORY. It writes its own entry for a navigation shortly
 * after the screen appears, and that write REPLACES whatever we put there. This was measured rather
 * than guessed: `history.state.rkGuard` was created and then gone again one tick later, every single
 * time, on mount and on focus alike, which is why Back kept leaving the library however early or late
 * the guard armed.
 *
 * So the spare is asserted rather than assumed. Each attempt is a no-op when our entry is already on
 * top, so this adds ONE entry in total however many times it runs, and it stops quickly rather than
 * fighting the router forever.
 */
const SPARE_RETRIES = [0, 120, 400];
function ensureSpare(attempt = 0) {
  if (!isWeb() || !guards.hasWeb()) return;
  if (!spareIsOurs()) window.history.pushState({ rkGuard: true }, '');
  const next = attempt + 1;
  if (next < SPARE_RETRIES.length) setTimeout(() => ensureSpare(next), SPARE_RETRIES[next]);
}

/** The browser listener is attached while anything wants browser backs, and dropped when nothing does. */
let detach: (() => void) | null = null;
function syncWebListener() {
  if (!isWeb()) return;
  if (guards.hasWeb() && !detach) {
    ensureSpare();
    const onPop = () => { guards.onPop(); };
    window.addEventListener('popstate', onPop);
    detach = () => window.removeEventListener('popstate', onPop);
    return;
  }
  if (!guards.hasWeb() && detach) {
    detach();
    detach = null;
    // The spare entry is abandoned rather than unwound. Unwinding it is a REAL navigation, and doing
    // that on cleanup is the v0.43.1 bug that threw authors out of the expansion editor every time
    // they opened a card: see `lib/back-guard`.
  }
}

/**
 * Run `handler` instead of leaving, on Android's hardware key AND on a browser's back.
 *
 * `enabled` false unregisters, for a guard that should only answer while something is actually open.
 * `web` false keeps the Android half only, for a screen whose browser Back is already owned by
 * something above it (the character sheet has its own implementation from v0.29.1).
 *
 * The handler is held in a ref so it can close over fresh state without re-registering.
 */
export function useBackGuard(handler: () => void, { enabled = true, web = true }: { enabled?: boolean; web?: boolean } = {}) {
  const ref = useRef(handler);
  ref.current = handler;
  // On FOCUS rather than on mount, so a screen that is navigated away from stands its guard down and
  // re-arms on the way back, instead of answering for a screen nobody is looking at.
  useFocusEffect(
    useCallback(() => {
      if (!enabled) return;
      const off = guards.register({ run: () => ref.current(), web });
      syncWebListener();
      // Android's key is per-listener and last-registered-first, which already gives topmost-wins.
      const sub = BackHandler.addEventListener('hardwareBackPress', () => {
        ref.current();
        return true; // consumed: never let it fall through to the navigator
      });
      return () => {
        sub.remove();
        off();
        syncWebListener();
      };
    }, [enabled, web]),
  );
}
