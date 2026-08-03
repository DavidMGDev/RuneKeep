/**
 * Travelling images (v0.23.0).
 *
 * The image picker hands back a `file://` URI pointing into the app's own cache. That reference is
 * meaningless on anyone else's phone, so a shared character used to arrive with a blank portrait and
 * blank card art, and the person who made it had no way to tell.
 *
 * This module inlines local images as base64 data URIs, downscaling until they fit a budget, so a
 * shared character carries its own artwork. `expo-image` renders `data:` URIs natively, so nothing
 * on the receiving side needs to change.
 *
 * Two budgets, because two very different pipes:
 *  - `.rkp` files go through the OS share sheet, so they can be generous.
 *  - NFC has a hard ~64KB NDEF ceiling for the WHOLE payload, so a card's image gets a small slice
 *    and is compressed to fit rather than dropped, which is what used to happen.
 */

import { Platform } from 'react-native';

import type { CharacterFile } from './character-file';
import type { LibraryCard } from './library';
import { blobUriToData } from './owned-image';

/** Per-image budget inside a `.rkp`. Generous: files are shared over the OS sheet, not a radio. */
export const FILE_IMAGE_BUDGET = 220_000;

/** Per-image budget inside an NFC payload, leaving room for the card's text and the envelope. */
export const NFC_IMAGE_BUDGET = 42_000;

type Manip = typeof import('expo-image-manipulator');
// Native-only module; a top-level import breaks the web bundle.
// eslint-disable-next-line @typescript-eslint/no-require-imports
const manip = (): Manip => require('expo-image-manipulator') as Manip;
type FS = typeof import('expo-file-system');
// eslint-disable-next-line @typescript-eslint/no-require-imports
const fs = (): FS => require('expo-file-system') as FS;

function isLocalImage(uri: string | null | undefined): uri is string {
  return !!uri && !uri.startsWith('data:') && !uri.startsWith('http') && Platform.OS !== 'web';
}

/** base64 inflates by ~4/3, plus the `data:image/jpeg;base64,` prefix. */
function encodedSize(bytes: number): number {
  return Math.ceil(bytes * 4 / 3) + 32;
}

/**
 * Compress a local image to a base64 data URI that fits `budget`, or return null if it cannot.
 *
 * Walks down a ladder of (width, quality) pairs rather than guessing once: photos vary enormously in
 * how well they compress, and one pass tuned for a screenshot ruins a photograph and vice versa.
 */
export async function compressToDataUri(uri: string, budget: number): Promise<string | null> {
  if (!isLocalImage(uri)) return uri ?? null;
  const ladder: { width: number; quality: number }[] = [
    { width: 1024, quality: 0.8 },
    { width: 768, quality: 0.7 },
    { width: 512, quality: 0.6 },
    { width: 384, quality: 0.5 },
    { width: 256, quality: 0.4 },
  ];
  try {
    const { ImageManipulator, SaveFormat } = manip();
    for (const step of ladder) {
      const ctx = ImageManipulator.manipulate(uri).resize({ width: step.width });
      const image = await ctx.renderAsync();
      const out = await image.saveAsync({ compress: step.quality, format: SaveFormat.JPEG, base64: true });
      const b64 = out.base64;
      if (!b64) continue;
      const data = `data:image/jpeg;base64,${b64}`;
      if (data.length <= budget) return data;
    }
  } catch {
    // Fall through: a manipulation failure must never block a share.
  }
  // Last resort: the original, if it happens to be small enough already.
  try {
    const f = new (fs().File)(uri);
    if (f.exists && encodedSize(f.size ?? 0) <= budget) {
      return `data:image/jpeg;base64,${f.base64()}`;
    }
  } catch {
    /* ignore */
  }
  return null;
}

/** The authored-card collections that can carry a player-supplied image. */
const IMAGE_COLLECTIONS = ['customCards', 'inventoryCustom', 'notes', 'experiences', 'libraryCards'] as const;

/**
 * Web export (v0.33.0): turn every session-scoped `blob:` URL into the bytes it points at.
 *
 * A blob that has already been revoked (the tab was reloaded since the image was picked) reads back
 * as null, and the reference is DROPPED rather than shipped. An empty portrait is honest; a blob URL
 * from someone else's browser session renders as a white rectangle with no explanation.
 */
async function resolveWebBlobs(file: CharacterFile): Promise<CharacterFile> {
  const isBlob = (u: unknown): u is string => typeof u === 'string' && u.startsWith('blob:');
  const out: CharacterFile = { ...file };
  if (isBlob(out.portraitUri)) out.portraitUri = await blobUriToData(out.portraitUri);
  for (const key of IMAGE_COLLECTIONS) {
    const arr = (out as unknown as Record<string, unknown>)[key];
    if (!Array.isArray(arr) || !arr.some((c) => isBlob((c as { imageUri?: unknown }).imageUri))) continue;
    (out as unknown as Record<string, unknown>)[key] = await Promise.all(
      arr.map(async (card: unknown) => {
        const c = card as { imageUri?: string | null };
        if (!isBlob(c.imageUri)) return card;
        return { ...(card as object), imageUri: await blobUriToData(c.imageUri) };
      }),
    );
  }
  return out;
}

/**
 * Inline every local image a character owns: the portrait, and the art on any card the player made
 * or received. Returns a NEW file; the on-device character is never modified, because its `file://`
 * references are perfectly good locally and re-reading them is cheaper than carrying base64 around.
 */
export async function embedCharacterImages(file: CharacterFile): Promise<CharacterFile> {
  // v0.33.0: the web build has its own version of this problem. A browser-picked image is a `blob:`
  // URL scoped to one page session, so an export written straight out carried a handle that means
  // nothing on the phone it was imported to — a character that arrived with a blank white portrait.
  // Reading the blob out here rescues any that were picked before v0.33.0 started storing data URIs,
  // as long as the tab has not been reloaded since.
  if (Platform.OS === 'web') return resolveWebBlobs(file);
  const out: CharacterFile = { ...file };

  if (isLocalImage(out.portraitUri)) {
    out.portraitUri = await compressToDataUri(out.portraitUri, FILE_IMAGE_BUDGET);
  }

  for (const key of IMAGE_COLLECTIONS) {
    const arr = (out as unknown as Record<string, unknown>)[key];
    if (!Array.isArray(arr)) continue;
    const next = await Promise.all(
      arr.map(async (card: unknown) => {
        const c = card as { imageUri?: string | null };
        if (!isLocalImage(c.imageUri)) return card;
        return { ...(card as object), imageUri: await compressToDataUri(c.imageUri, FILE_IMAGE_BUDGET) };
      }),
    );
    (out as unknown as Record<string, unknown>)[key] = next;
  }
  return out;
}

/**
 * The NFC variant for a single card: compress hard enough to fit the tag rather than dropping the
 * image, which is what the old sync path did whenever a photo was bigger than the budget.
 */
export async function embedCardImageForNfc(card: LibraryCard): Promise<LibraryCard> {
  if (!isLocalImage(card.imageUri)) return card;
  const data = await compressToDataUri(card.imageUri, NFC_IMAGE_BUDGET);
  return { ...card, imageUri: data };
}
