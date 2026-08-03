/**
 * The moodboard's model (v0.34.0).
 *
 * A character's moodboard is an ordered list of placed images. **The order IS the z-order**, last on
 * top, which is the whole reason there is no `z` field: a layer operation is an array move, and there
 * is no second source of truth that can drift out of agreement with the first. Everything here is
 * pure and returns a new list, because the save path compares by reference to decide what changed.
 *
 * Positions are the image's CENTRE in canvas units, which are the app's design pixels, so the board
 * is the same on a phone, in a browser and inside the tablet frame with no per-platform arithmetic.
 * Centres rather than corners because every gesture this feature has (drag, pinch, rotate) is about
 * a centre, and a corner would need converting on each one.
 */

export interface MoodboardItem {
  id: string;
  /**
   * Named `imageUri` to match the authored-card collections, which is not cosmetic: three mechanisms
   * key off that name and cover the moodboard for free. Exports inline the bytes, history snapshots
   * strip them, and a dead browser `blob:` reference is dropped on import.
   */
  imageUri: string;
  /** Centre, in canvas units. */
  x: number;
  y: number;
  /** 1 = the base width below. */
  scale: number;
  /** Degrees, clockwise. */
  rotation: number;
  /** width / height of the source image, so a slot has the right shape before the image decodes. */
  aspect: number;
}

export interface CanvasSize {
  width: number;
  height: number;
}

/** An unscaled item is this wide; its height follows the image's own aspect. */
export const ITEM_BASE_W = 150;

/** How much of an item must stay on the canvas. Keeps a centre reachable, so nothing can be stranded. */
const EDGE_MARGIN = 28;

export const itemWidth = (it: MoodboardItem): number => ITEM_BASE_W * it.scale;
export const itemHeight = (it: MoodboardItem): number => (ITEM_BASE_W / (it.aspect || 1)) * it.scale;

/** Keep a centre inside the canvas, so an image can always be grabbed again. */
export function clampCentre(x: number, y: number, canvas: CanvasSize): { x: number; y: number } {
  return {
    x: Math.min(canvas.width - EDGE_MARGIN, Math.max(EDGE_MARGIN, x)),
    y: Math.min(canvas.height - EDGE_MARGIN, Math.max(EDGE_MARGIN, y)),
  };
}

const indexOf = (list: readonly MoodboardItem[], id: string) => list.findIndex((i) => i.id === id);

/** Move the item at `from` to `to`, as a new list. Out-of-range indices are a no-op, not an error. */
function move(list: readonly MoodboardItem[], from: number, to: number): MoodboardItem[] {
  if (from < 0 || to < 0 || from >= list.length || to >= list.length || from === to) return [...list];
  const out = [...list];
  const [item] = out.splice(from, 1);
  out.splice(to, 0, item);
  return out;
}

/**
 * Place a new image on top, near the middle.
 *
 * Each successive image is offset a little from the last, so adding three in a row gives three
 * visible cards rather than one that looks like a single image until you drag it.
 */
export function addItem(list: readonly MoodboardItem[], image: { id: string; imageUri: string; aspect: number }, canvas: CanvasSize): MoodboardItem[] {
  const step = (list.length % 6) - 2.5;
  const { x, y } = clampCentre(canvas.width / 2 + step * 16, canvas.height / 2 + step * 16, canvas);
  return [...list, { id: image.id, imageUri: image.imageUri, x, y, scale: 1, rotation: 0, aspect: image.aspect || 1 }];
}

export function removeItem(list: readonly MoodboardItem[], id: string): MoodboardItem[] {
  return list.filter((i) => i.id !== id);
}

/** Patch one item in place, keeping its position in the stack. */
export function updateItem(list: readonly MoodboardItem[], id: string, patch: Partial<Omit<MoodboardItem, 'id'>>): MoodboardItem[] {
  return list.map((i) => (i.id === id ? { ...i, ...patch } : i));
}

/** A copy on top of the original and offset from it, so the copy is visible as a separate thing. */
export function duplicateItem(list: readonly MoodboardItem[], id: string, newId: string, canvas: CanvasSize): MoodboardItem[] {
  const src = list.find((i) => i.id === id);
  if (!src) return [...list];
  const { x, y } = clampCentre(src.x + 18, src.y + 18, canvas);
  return [...list, { ...src, id: newId, x, y }];
}

export function bringToFront(list: readonly MoodboardItem[], id: string): MoodboardItem[] {
  return move(list, indexOf(list, id), list.length - 1);
}

export function sendToBack(list: readonly MoodboardItem[], id: string): MoodboardItem[] {
  return move(list, indexOf(list, id), 0);
}

/** One step towards the front. Already on top is a no-op. */
export function layerUp(list: readonly MoodboardItem[], id: string): MoodboardItem[] {
  const i = indexOf(list, id);
  return i < 0 || i === list.length - 1 ? [...list] : move(list, i, i + 1);
}

/** One step towards the back. Already at the bottom is a no-op. */
export function layerDown(list: readonly MoodboardItem[], id: string): MoodboardItem[] {
  const i = indexOf(list, id);
  return i <= 0 ? [...list] : move(list, i, i - 1);
}

/**
 * Put an item in the middle of the canvas AND on top.
 *
 * Both halves, because this is the escape hatch for an image that has been lost behind others or
 * dragged to an edge: centring it under three other images would not have rescued it.
 */
export function centreItem(list: readonly MoodboardItem[], id: string, canvas: CanvasSize): MoodboardItem[] {
  const centred = updateItem(list, id, { x: canvas.width / 2, y: canvas.height / 2 });
  return bringToFront(centred, id);
}

/** Read a stored value back into a list this module can work with. Anything malformed is dropped. */
export function readMoodboard(raw: unknown): MoodboardItem[] {
  if (!Array.isArray(raw)) return [];
  return raw.filter(
    (i): i is MoodboardItem =>
      !!i && typeof i.id === 'string' && typeof i.imageUri === 'string' && typeof i.x === 'number' && typeof i.y === 'number' && typeof i.scale === 'number' && typeof i.rotation === 'number',
  ).map((i) => ({ ...i, aspect: typeof i.aspect === 'number' && i.aspect > 0 ? i.aspect : 1 }));
}
