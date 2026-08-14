/**
 * WHEN A PICTURE AND A COLOUR CAN SHARE A CARD (v0.42.7, owner).
 *
 * "I told you to make it so that class cards that upload an image with transparency can also change
 * the color of their background without it overwriting their image, make that true for all cards, if
 * the uploaded image has transparency allow the color to be changed."
 *
 * The editor has always treated the two as exclusive: choosing a colour cleared the image and
 * choosing an image cleared the colour, with a confirmation in between. For a photograph that is
 * right, because the colour would be behind something opaque and would never be seen. For a CUT-OUT
 * it is exactly wrong, and cut-outs are what class banners are.
 *
 * ## How transparency is decided
 *
 * By FORMAT, not by decoding. PNG and WebP carry an alpha channel; JPEG cannot. Reading the pixels to
 * find out whether any of them are actually transparent would mean decoding every image the author
 * picks, on a phone, to answer a question whose wrong answer costs nothing: a PNG with no transparent
 * pixels simply hides a colour nobody can see, and the author can still change it.
 *
 * A picked file whose format cannot be told is treated as OPAQUE, which is the old behaviour, so
 * nothing that worked before changes.
 */

/** Whether this picture can have a colour behind it. */
export function canLayerColor(uri: string | null | undefined): boolean {
  if (!uri) return false;
  const u = uri.toLowerCase();
  // A data URI names its own type; a file path ends in one. Query strings are stripped either way.
  if (u.startsWith('data:')) return u.startsWith('data:image/png') || u.startsWith('data:image/webp');
  const path = u.split('?')[0].split('#')[0];
  return path.endsWith('.png') || path.endsWith('.webp');
}

/**
 * What happens to the card when a colour is chosen.
 *
 * A cut-out keeps its picture and takes the colour behind it. An opaque picture is replaced, which is
 * the case the confirmation exists for, and the ONLY case it should still appear in.
 */
export const colorReplacesImage = (uri: string | null | undefined): boolean => !!uri && !canLayerColor(uri);

/**
 * Whether the colour's NAME should be flashed over the card (owner).
 *
 * "When the user changes color with a transparent image present, make sure to not show the name of
 * the color, it would be on top of the image and look weird." The flash is a label over the art zone,
 * and over a banner it lands on the banner.
 */
export const showColorName = (uri: string | null | undefined): boolean => !uri;
