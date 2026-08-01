/**
 * Incoming file URLs (v0.24.0).
 *
 * v0.23.0 got Android to hand RuneKeep a `.rkp` tapped in WhatsApp. The app opened, and showed
 * "Unmatched Route". Two separate faults, both here:
 *
 *  1. Expo Router treats every launch URL as a route. A share from WhatsApp arrives as
 *     `content://com.whatsapp.provider.media/item/8a83…`, which is not a route, so the router landed
 *     on its 404 screen before any of the app's own code ran. `+native-intent.ts` now hands those
 *     URLs to this module and returns `/` so the app opens on the menu.
 *
 *  2. The gate only accepted URLs whose path ended in `.rkp`. A `content://` URI from a provider is
 *     an opaque row id and carries no filename at all, so the one source the file association exists
 *     to serve was the one source it filtered out.
 *
 * The predicate is the interesting part and is pure, so `incoming-url.test.ts` can pin the shapes the
 * real senders produce.
 */

/**
 * Whether a launch URL is a file being handed to the app rather than a route.
 *
 * Deliberately broad on `content://`: the intent filter is what decides which files reach us (it
 * matches `.rkp` by path, and the octet-stream/rkp MIME types by type), so anything that gets this
 * far was already selected by Android. Trying to re-check the extension here is what broke it, since
 * provider URIs have no extension to check.
 */
export function isFilePayload(url: string | null | undefined): boolean {
  if (!url) return false;
  const u = url.toLowerCase();
  if (u.startsWith('runekeep://')) return false; // the app's own deep links are routes
  if (u.startsWith('content://')) return true;
  // v0.30.0: `.rune` is the extension now; `.rkp` still opens, because files sent before the rename
  // are on people's phones and in their chat histories.
  if (u.startsWith('file://')) return /\.(rune|rkp)($|[?#])/i.test(url);
  return false;
}

let pending: string | null = null;
const subscribers = new Set<(url: string) => void>();

/** Called from `+native-intent` when the OS hands us a file. */
export function pushIncomingUrl(url: string): void {
  pending = url;
  for (const f of subscribers) f(url);
}

/** Claim a URL captured before React mounted (a cold launch from a share). */
export function takeIncomingUrl(): string | null {
  const url = pending;
  pending = null;
  return url;
}

/** Warm launches: the app is already running when the file arrives. */
export function subscribeIncomingUrl(f: (url: string) => void): () => void {
  subscribers.add(f);
  return () => {
    subscribers.delete(f);
  };
}

/** Test seam. */
export function resetIncomingUrl(): void {
  pending = null;
  subscribers.clear();
}
