import { isFilePayload, pushIncomingUrl } from '@/lib/incoming-url';

/**
 * Expo Router's hook for launch URLs that are not routes (v0.24.0).
 *
 * Without this, a `.rkp` shared from WhatsApp opened the app on "Unmatched Route": Android hands over
 * `content://com.whatsapp.provider.media/item/<id>`, the router tries to resolve it as a path, and
 * fails. The file association worked; the app just threw the file away and showed a 404.
 *
 * So: file URLs are parked for `IncomingFileGate` to act on, and the router is sent to the menu,
 * which is exactly where the import confirmation belongs. Real deep links pass through untouched.
 */
export function redirectSystemPath({ path }: { path: string | null; initial: boolean }): string | null {
  if (path && isFilePayload(path)) {
    pushIncomingUrl(path);
    return '/';
  }
  return path;
}
