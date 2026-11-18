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
/**
 * The spare is a bare `{ rkGuard: true }` entry ABOVE the router's own. It deliberately does NOT copy the router's
 * `id`: an alias of the entry under it would be indistinguishable from that entry, so a retry or a leave could
 * mistake the real one for the spare. (The sheet's spare does copy it; see `SheetBackGuard`.)
 */
const pushSpareEntry = () => window.history.pushState({ rkGuard: true }, '');
const guards = createGuardStack({
  pushSpare: () => {
    if (isWeb() && !leavingSpares) pushSpareEntry();
  },
});

/** True while `leaveThroughSpares` is stepping off spare entries: no guard answers those Backs. */
let leavingSpares = false;
export const isLeavingSpares = () => leavingSpares;
/**
 * Whether the sheet's spare is on the stack. Tracked here, not only by its `rkSheet` flag: the router rewrites that
 * entry when it restores the sheet (`{ id }`, flag gone), and a leave that trusted the flag would stop one step early.
 */
type NavEntry = { key: string; index: number };
/** The Navigation API's current entry: a key that survives `replaceState` (the router's rewrites) and a position. */
const navEntry = (): NavEntry | null =>
  (isWeb() ? (window as unknown as { navigation?: { currentEntry: NavEntry | null } }).navigation?.currentEntry : null) ?? null;
let sheetSpare: NavEntry | null = null;
const markSheetSpare = () => { const e = navEntry(); sheetSpare = e ? { key: e.key, index: e.index } : null; };
export const clearSheetSpare = () => { sheetSpare = null; };
/**
 * Is the current entry the sheet's spare? By entry key where the Navigation API exists, because the spare shares
 * the router's `id` with the real entry under it and the router strips our flag when it rewrites the entry.
 * shortcut: without the Navigation API this falls back to the `rkSheet` flag, which a router rewrite can strip.
 */
export function onSheetSpare(): boolean {
  const e = navEntry();
  if (e && sheetSpare) return e.key === sheetSpare.key;
  return !!(isWeb() && (window.history.state as { rkSheet?: boolean } | null)?.rkSheet);
}
/** Did the popstate that just fired step back OFF the spare (a Back), rather than jump somewhere else? */
export function poppedSheetSpare(): boolean {
  const e = navEntry();
  if (e && sheetSpare) return e.index === sheetSpare.index - 1;
  return true; // shortcut: without the Navigation API every pop counts as a Back off the spare, as before
}
/** Put the sheet's spare on top unless it already is: the router's entry, its `id` kept, plus our flag. */
export function armSheetSpare() {
  if (!isWeb()) return;
  if (onSheetSpare()) { if (!sheetSpare) markSheetSpare(); return; }
  window.history.pushState({ ...((window.history.state as object | null) ?? {}), rkSheet: true }, '');
  markSheetSpare();
}
let leaveListener: (() => void) | null = null;
const dropLeaveListener = () => {
  if (leaveListener) window.removeEventListener('popstate', leaveListener);
  leaveListener = null;
};
/** Run `fn` after the next popstate (after every other listener), replacing any step still waiting. */
const afterNextPop = (fn: () => void) => {
  dropLeaveListener();
  leaveListener = () => { dropLeaveListener(); setTimeout(fn, 0); };
  window.addEventListener('popstate', leaveListener);
};
/**
 * A leave is over: its own pop arrived, or a screen that guards Back has armed (a leave by `router.replace`
 * never pops, so the next guarded screen ends it). Called by that screen before it arms.
 */
export function endLeave() {
  leavingSpares = false;
  if (isWeb()) dropLeaveListener();
}

/**
 * Run a confirmed leave (`router.back()` and friends) from a screen that keeps spare history entries.
 *
 * The router counts a spare and the entry under it as ONE place (they share its id), so a `router.back()`
 * from on top of a spare spends its single browser step on the spare and then rewrites the screen's own
 * entry as the destination: an extra Back stop, and a stale Forward. Stepping off the spares first, with
 * every guard told to stand aside, leaves the router's count and the browser's in agreement.
 */
export function leaveThroughSpares(go: () => void) {
  if (!isWeb()) { go(); return; }
  leavingSpares = true;
  const st = window.history.state as { rkGuard?: boolean; rkSheet?: boolean } | null;
  if (st?.rkGuard || onSheetSpare()) {
    if (!st?.rkGuard) sheetSpare = null;
    afterNextPop(() => leaveThroughSpares(go));
    window.history.back();
    return;
  }
  // The leave itself pops too, and the screen's guards are still mounted for it: they stand aside for that one.
  afterNextPop(endLeave);
  go();
}

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
  if (!isWeb() || !guards.hasWeb() || leavingSpares) return;
  if (!spareIsOurs()) pushSpareEntry();
  const next = attempt + 1;
  if (next < SPARE_RETRIES.length) setTimeout(() => ensureSpare(next), SPARE_RETRIES[next]);
}

/** The browser listener is attached while anything wants browser backs, and dropped when nothing does. */
let detach: (() => void) | null = null;
function syncWebListener() {
  if (!isWeb()) return;
  if (guards.hasWeb() && !detach) {
    endLeave();
    ensureSpare();
    const onPop = () => { if (!leavingSpares) guards.onPop(); };
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
