import { useEffect, useState } from 'react';
import { Platform } from 'react-native';

/**
 * Installing the web build as an app (v0.24.4).
 *
 * On a phone the browser version is a tab: an address bar at the top, a toolbar at the bottom, and a
 * screen that changes height when they hide. RuneKeep is authored for a fixed 412x892 frame, so that
 * chrome costs it real layout, and the app is meant to be opened at a table rather than browsed.
 * Installed, it gets its own icon, its own window and the whole screen.
 *
 * The two platforms need different things, which is the whole reason this module exists:
 *
 * - **Android (Chrome and friends)** fires `beforeinstallprompt`, which the HTML shell catches and
 *   parks on `window.__rkInstall`. Calling `.prompt()` on it opens the real install dialog. Chrome
 *   only fires it for a site with a manifest AND a service worker with a fetch handler, which is why
 *   `public/sw.js` exists at all: without one, "Add to Home screen" makes a bookmark that still opens
 *   in a browser tab.
 * - **iOS** has no such event and never will. Safari only installs through Share, then Add to Home
 *   Screen, so all we can do is say so clearly.
 *
 * `installMode` is pure so the decision can be tested without a browser.
 */

/** What to offer. `prompt` = the real dialog is available; `ios` = tell them where the button is. */
export type InstallMode = 'none' | 'prompt' | 'manual' | 'ios';

export interface InstallFacts {
  /** Running in a browser at all. */
  web: boolean;
  /** Already launched from the home screen, so there is nothing to offer. */
  standalone: boolean;
  /** Phone or tablet. A desktop can install too, but it is not in the way there, so we stay quiet. */
  mobile: boolean;
  ios: boolean;
  /** A captured `beforeinstallprompt` is waiting. */
  deferred: boolean;
}

/**
 * The offer to make, given what we know. Pure.
 *
 * `manual` is the honest answer for a mobile browser that can install but does not tell us how (say
 * Firefox on Android): the option exists in its menu, so point at the menu rather than pretend.
 */
export function installMode(f: InstallFacts): InstallMode {
  if (!f.web || f.standalone || !f.mobile) return 'none';
  if (f.deferred) return 'prompt';
  return f.ios ? 'ios' : 'manual';
}

type Nav = Navigator & { standalone?: boolean };
type Win = Window & { __rkInstall?: { prompt: () => Promise<void>; userChoice: Promise<{ outcome: string }> } | null };

function win(): Win | null {
  return Platform.OS === 'web' && typeof window !== 'undefined' ? (window as unknown as Win) : null;
}

/** Launched from the home screen rather than a browser tab. */
export function isStandalone(): boolean {
  const w = win();
  if (!w) return false;
  const iosStandalone = (w.navigator as Nav).standalone === true; // Safari's own flag, pre-dates the media query
  return iosStandalone || !!w.matchMedia?.('(display-mode: standalone)')?.matches || !!w.matchMedia?.('(display-mode: fullscreen)')?.matches;
}

/**
 * Is this a phone or a tablet, given what the browser says about itself? Pure, so the awkward cases
 * are table tests rather than something you can only find on a device you own.
 *
 * The user agent alone is not enough, and v0.29.1 proved it: Chrome on an Android tablet requests
 * desktop sites by default on a large screen, so a Galaxy Tab reports `X11; Linux x86_64` with no
 * "Android" anywhere in it. The install offer read that as a desktop and stayed quiet on the one
 * device where browser chrome costs the most room.
 *
 * `coarse` is the honest discriminator: it is the browser's own answer to "is the primary pointer a
 * finger?". A touchscreen laptop still reports `fine`, because its primary pointer is the trackpad,
 * so a desktop is never prompted, which is what the owner asked for.
 */
export function isMobileLike(ua: string, maxTouchPoints: number, coarsePointer: boolean): boolean {
  const ios = /iPad|iPhone|iPod/.test(ua) || (/Macintosh/.test(ua) && maxTouchPoints > 1);
  return ios || /Android/.test(ua) || (coarsePointer && maxTouchPoints > 1);
}

export function readFacts(): InstallFacts {
  const w = win();
  if (!w) return { web: false, standalone: false, mobile: false, ios: false, deferred: false };
  const ua = w.navigator?.userAgent ?? '';
  const touch = w.navigator?.maxTouchPoints ?? 0;
  // iPadOS reports itself as a Mac; the touch-point count is what separates it from a desktop.
  const ios = /iPad|iPhone|iPod/.test(ua) || (/Macintosh/.test(ua) && touch > 1);
  const coarse = !!w.matchMedia?.('(pointer: coarse)')?.matches;
  return { web: true, standalone: isStandalone(), mobile: isMobileLike(ua, touch, coarse), ios, deferred: !!w.__rkInstall };
}

/** Fire the browser's install dialog. Resolves true if they went through with it. */
export async function promptInstall(): Promise<boolean> {
  const w = win();
  const evt = w?.__rkInstall;
  if (!evt) return false;
  try {
    await evt.prompt();
    const { outcome } = await evt.userChoice;
    if (w) w.__rkInstall = null;
    return outcome === 'accepted';
  } catch {
    return false;
  }
}

/**
 * The live offer. Re-reads when the prompt becomes available (it can arrive after first paint) and
 * when the app is installed, so the step can take itself away.
 */
export function useInstallMode(): InstallMode {
  const [mode, setMode] = useState<InstallMode>(() => installMode(readFacts()));
  useEffect(() => {
    const w = win();
    if (!w) return;
    const refresh = () => setMode(installMode(readFacts()));
    refresh();
    w.addEventListener('rk-installable', refresh);
    w.addEventListener('rk-installed', refresh);
    return () => {
      w.removeEventListener('rk-installable', refresh);
      w.removeEventListener('rk-installed', refresh);
    };
  }, []);
  return mode;
}

/**
 * A browser on a machine with a keyboard (v0.26.0).
 *
 * Used to decide whether the welcome tour ends with the keyboard page. Deliberately the INVERSE of
 * the install offer's audience rather than a separate notion of "desktop": if the app is worth
 * installing because browser chrome is in the way, it is a phone and there is no keyboard to
 * explain; if it is not, there is.
 */
export function isDesktopWeb(): boolean {
  const w = win();
  if (!w) return false;
  const ua = w.navigator?.userAgent ?? '';
  const ios = /iPad|iPhone|iPod/.test(ua) || (/Macintosh/.test(ua) && (w.navigator?.maxTouchPoints ?? 0) > 1);
  if (ios || /Android/.test(ua)) return false;
  // A touchscreen laptop still has a keyboard; a tablet reporting a desktop UA does not. The pointer
  // query is what separates them, and it is the same signal the platform uses for hover styling.
  return !!w.matchMedia?.('(pointer: fine)')?.matches;
}
