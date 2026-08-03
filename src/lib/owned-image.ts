/**
 * Keeping a picked image (v0.26.0).
 *
 * `expo-image-picker` hands back a URI pointing into the app's CACHE directory. A cache is, by
 * definition, something the operating system is free to delete, and installing a new build is one of
 * the moments it does. That is why portraits vanished from the character list after an update: the
 * character file was intact and still held a perfectly well-formed `file://` URI, pointing at a file
 * that no longer existed. Nothing looked broken, the picture was simply gone.
 *
 * So a picked image is COPIED somewhere the app owns before its path is written to a character. The
 * documents directory is not cleared by an update.
 *
 * On web there is no cache directory and no copy to make, but there is a worse version of the same
 * problem. v0.32.2 and earlier assumed the browser picker returned a `data:` URI. It does not: it
 * returns a `blob:` URL, which is a handle into ONE page session's memory. So a portrait picked in a
 * browser survived exactly until the tab was reloaded, and a character exported from the browser
 * carried `blob:https://runekeep.pages.dev/7eae6fc5-…` into the file, which means nothing anywhere
 * else. That is the blank white portrait the owner saw after importing a web export on their phone.
 *
 * A blob is read out to a `data:` URI here instead, once, at the moment it is picked, so everything
 * downstream stores and ships the actual bytes.
 */
import { Platform } from 'react-native';

/** Read a browser `blob:` URL out into a `data:` URI. Web only; native never sees one. */
export async function blobUriToData(uri: string): Promise<string | null> {
  try {
    const blob = await (await fetch(uri)).blob();
    return await new Promise<string>((resolve, reject) => {
      const r = new FileReader();
      r.onload = () => resolve(String(r.result));
      r.onerror = () => reject(r.error ?? new Error('read failed'));
      r.readAsDataURL(blob);
    });
  } catch {
    // A revoked or cross-origin blob. The caller keeps whatever it had; there is nothing to recover.
    return null;
  }
}

/** Where owned images live, under the documents directory. */
const DIR = 'images';

type FS = typeof import('expo-file-system');
// Native-only module; a top-level import breaks the web bundle.
// eslint-disable-next-line @typescript-eslint/no-require-imports
const fs = (): FS => require('expo-file-system') as FS;

/** A URI the app owns and an update will not delete. */
export function isOwned(uri: string | null | undefined): boolean {
  if (!uri) return false;
  if (uri.startsWith('data:')) return true; // the bytes travel with the character
  return uri.includes(`/${DIR}/`);
}

/**
 * Copy a picked image into the app's own storage and return the new URI.
 *
 * Returns the original URI unchanged when there is nothing to do (web, an already-owned file, a
 * remote URL) and ALSO when the copy fails. Failing back to the cache URI is deliberate: a portrait
 * that might not survive an update is better than no portrait and a broken creation flow.
 */
export async function ownImage(uri: string | null | undefined): Promise<string | null> {
  if (!uri) return null;
  if (Platform.OS === 'web') return uri.startsWith('blob:') ? ((await blobUriToData(uri)) ?? uri) : uri;
  if (isOwned(uri) || !uri.startsWith('file:')) return uri;
  try {
    const { File, Directory, Paths } = fs();
    const dir = new Directory(Paths.document, DIR);
    if (!dir.exists) dir.create({ intermediates: true });
    // Keep the extension: expo-image decodes by content, but a sensible name helps when debugging.
    const ext = (uri.split('?')[0].match(/\.(\w{3,4})$/)?.[1] ?? 'jpg').toLowerCase();
    const dest = new File(dir, `${Date.now().toString(36)}-${Math.floor(Math.random() * 1e6).toString(36)}.${ext}`);
    new File(uri).copy(dest);
    return dest.uri;
  } catch {
    return uri;
  }
}
