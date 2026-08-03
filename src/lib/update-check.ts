/**
 * "There is a newer RuneKeep" (v0.32.0).
 *
 * The app has no store behind it. The Android build is a sideloaded APK from a GitHub release and the
 * web build is a static site, so nothing tells a player that the version in their hand is old. The
 * usual result is a bug report about something that was fixed two releases ago.
 *
 * The two platforms need different answers, because "update" means different things:
 *
 *  - **Android**: there is a newer APK to install. Ask GitHub what the latest release is, compare it
 *    with this build, and offer the same `/android-app` download link the site already publishes.
 *    Nothing is downloaded automatically; sideloading is the player's decision to make.
 *  - **Web**: the files are already served, and an old version means a stale cache. The service worker
 *    is asked to look again; when a new one is waiting, the offer is simply to reload.
 *
 * The comparison is pure and tested. Everything else here touches the network or the browser, and is
 * written to fail silently: a version check that interrupts play because GitHub is down would be a
 * worse bug than the one it exists to prevent.
 */

/** Where the site sends people for the Android build (public/_redirects). */
export const ANDROID_DOWNLOAD_URL = 'https://runekeep.pages.dev/android-app';
const RELEASES_API = 'https://api.github.com/repos/DavidMGDev/RuneKeep/releases/latest';

/** Parse "v0.31.2" / "0.31.2" into numbers. Junk yields an empty list, which never compares newer. */
export function parseVersion(v: string | undefined | null): number[] {
  const m = /(\d+(?:\.\d+)*)/.exec(String(v ?? ''));
  if (!m) return [];
  return m[1].split('.').map((n) => parseInt(n, 10) || 0);
}

/**
 * Is `candidate` a LATER version than `current`?
 *
 * Missing segments count as zero, so 0.32 and 0.32.0 are the same version rather than an update that
 * offers itself forever. An unparseable candidate is never newer: the failure mode of a bad tag has
 * to be silence, not a permanent nag.
 */
export function isNewerVersion(candidate: string | undefined | null, current: string | undefined | null): boolean {
  const a = parseVersion(candidate);
  const b = parseVersion(current);
  if (!a.length) return false;
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    const x = a[i] ?? 0;
    const y = b[i] ?? 0;
    if (x !== y) return x > y;
  }
  return false;
}

/** The newest published release tag, or null if it cannot be reached. Never throws. */
export async function latestReleaseTag(signal?: AbortSignal): Promise<string | null> {
  try {
    const res = await fetch(RELEASES_API, { headers: { Accept: 'application/vnd.github+json' }, signal });
    if (!res.ok) return null;
    const json = (await res.json()) as { tag_name?: string };
    return json.tag_name ?? null;
  } catch {
    return null; // offline, rate-limited, or the repo moved: say nothing
  }
}

/**
 * Drop every cache this site owns and reload from the network (web).
 *
 * Used when a player is on an old build with a service worker that will not hand over. Unregistering
 * as well is deliberate: a worker that is somehow serving a build that no longer exists cannot be
 * argued with, and the next load installs a fresh one.
 */
export async function hardReloadWeb(): Promise<void> {
  try {
    if (typeof caches !== 'undefined') {
      const keys = await caches.keys();
      await Promise.all(keys.map((k) => caches.delete(k)));
    }
    const reg = await navigator.serviceWorker?.getRegistration();
    await reg?.unregister();
  } catch {
    // Reload regardless: a failed cleanup is still better followed by a fresh load than by nothing.
  }
  location.reload();
}

/**
 * Ask the service worker to look for a new build, and report whether one is waiting.
 *
 * Resolves false rather than hanging when there is no worker, no update, or no answer within the
 * timeout, so a caller can always `await` this on a screen without risking a stuck spinner.
 */
export async function webUpdateWaiting(timeoutMs = 8000): Promise<boolean> {
  try {
    const reg = await navigator.serviceWorker?.getRegistration();
    if (!reg) return false;
    if (reg.waiting) return true;
    await Promise.race([reg.update(), new Promise((r) => setTimeout(r, timeoutMs))]);
    return !!reg.waiting;
  } catch {
    return false;
  }
}
