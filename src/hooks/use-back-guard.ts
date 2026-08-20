/**
 * BACK, EVERYWHERE IT COMES FROM (v0.43.1, owner).
 *
 * "If I press back inside the creation of a card in the expansions menu, when I add a card and I'm in
 * the middle of the process and I press back, it immediately pushes me back to the main menu. That is
 * unacceptable."
 *
 * The card editor already guarded Back, and the guard did nothing in a browser: `BackHandler` is
 * React Native's binding for ANDROID'S HARDWARE KEY and nothing else, so on the web the back button,
 * the back gesture, Alt+Left and the mouse's side button all sailed straight past it. The editor was
 * unmounted by the router with a draft in it and no question asked.
 *
 * The sheet solved this for itself in v0.29.1. This is that solution, lifted out, because "Back must
 * not throw away what I am in the middle of" is not a fact about the sheet.
 *
 * ## Why a spare history entry
 *
 * A page cannot veto a back navigation. What it can do is arrange to have something cheap to go back
 * TO: push one spare entry on arrival, and the first Back consumes that instead of leaving. `popstate`
 * then fires with the screen still mounted, we run exactly the handler the hardware key runs, and push
 * the spare entry again so the next press is caught too. When the handler decides it really is time to
 * go, it navigates properly and the spare entry goes with it.
 *
 * The one visible cost is that a genuine forward-then-back dance needs one extra press. That is the
 * standard trade for an unsaved-work guard on the web, and it is the right way round: an extra press
 * costs a moment, and losing a half-written card costs the card.
 */
import { useEffect, useRef } from 'react';
import { BackHandler, Platform } from 'react-native';

/**
 * Run `handler` instead of leaving, on Android's hardware key AND on a browser's back.
 *
 * `enabled` false unregisters both, for a guard that should only be armed while something is actually
 * open. The handler is held in a ref, so it can close over fresh state without re-arming the listeners
 * on every render (re-arming pushes another history entry, which is how you end up needing four
 * presses to leave).
 *
 * ## `web: false`, and why it exists
 *
 * Only ONE spare history entry may be in play at a time. Two armed guards both push one, a single
 * Back consumes one, and BOTH listeners run: the inner one asks its question while the outer one
 * closes the whole thing underneath it. So a screen that is already inside something with its own
 * browser guard (the character sheet has had one since v0.29.1, and its handler closes the topmost
 * overlay itself) opts out of the web half and keeps the Android one, which does not stack.
 *
 * The alternative, a shared topmost-wins registry, is the better shape and a bigger change to the
 * sheet than this release should carry.
 */
export function useBackGuard(handler: () => void, { enabled = true, web = true }: { enabled?: boolean; web?: boolean } = {}) {
  const ref = useRef(handler);
  ref.current = handler;
  useEffect(() => {
    if (!enabled) return;
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      ref.current();
      return true; // consumed: never let it fall through to the navigator
    });
    let dropPopGuard: (() => void) | undefined;
    if (web && Platform.OS === 'web' && typeof window !== 'undefined') {
      window.history.pushState({ rkGuard: true }, '');
      const onPop = () => {
        ref.current();
        // Re-arm. The entry we just consumed has to be replaced or the next Back leaves for real.
        window.history.pushState({ rkGuard: true }, '');
      };
      window.addEventListener('popstate', onPop);
      dropPopGuard = () => {
        window.removeEventListener('popstate', onPop);
        /**
         * Give the spare entry back on the way out.
         *
         * Without this every guarded screen leaves one dead entry behind it, and after opening and
         * closing the editor a few times the browser's Back button needs half a dozen presses to
         * reach anywhere. `history.state` is checked first so we only ever unwind an entry we are
         * the ones who pushed.
         */
        if (window.history.state?.rkGuard) window.history.back();
      };
    }
    return () => {
      sub.remove();
      dropPopGuard?.();
    };
  }, [enabled, web]);
}
