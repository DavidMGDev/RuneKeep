import { isLaunchFile, pushIncomingUrl } from '@/lib/incoming-url';

/**
 * Expo Router's hook for launch URLs that are not routes (v0.24.0).
 *
 * Without this, a `.rune` shared from another app opened RuneKeep on "Unmatched Route": Android
 * hands over `content://<authority>/<opaque>`, the router tries to resolve it as a path, and fails.
 * The file association worked; the app just threw the file away and showed a 404.
 *
 * So: file URLs are parked for `IncomingFileGate` to act on, and the router is sent to the menu,
 * which is exactly where the import confirmation belongs. Real deep links pass through untouched.
 *
 * v0.36.1: this uses `isLaunchFile`, which asks only whether the URL is a FILE, not whether it looks
 * like one the app wants. Anything arriving here was launched by an intent the app's own filter
 * matched, so second-guessing it here is how a Quick Share ended up opening the app and doing
 * nothing at all. The narrower `isFilePayload` still guards URLs that arrive while running, where
 * the system image picker really can hand back something that is not a share.
 */
export function redirectSystemPath({ path }: { path: string | null; initial: boolean }): string | null {
  if (path && isLaunchFile(path)) {
    pushIncomingUrl(path);
    return '/';
  }
  return path;
}
