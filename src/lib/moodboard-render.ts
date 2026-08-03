/**
 * Flattening a moodboard into one picture, in a browser (v0.34.2).
 *
 * The portrait capture goes through `react-native-view-shot`, which on native photographs the real
 * view and on web hands the DOM to html2canvas. The web half did not work: the portrait either came
 * out white or never changed at all, because html2canvas is being asked to reproduce a stack of
 * absolutely-positioned, rotated, scaled elements inside a transformed stage, which is close to the
 * worst case for it.
 *
 * There is no need to photograph anything. The board is a list of images with a position, a size and
 * an angle, which is a drawing instruction. So the browser draws it: fill the ground, then paint each
 * image in order with its own transform. Deterministic, no dependency, and it composites each PNG's
 * own transparency over the ground exactly the way the canvas shows it.
 *
 * Native keeps `captureRef`, which already works and photographs what is genuinely on screen.
 */

import { ITEM_BASE_W, type CanvasSize, type MoodboardItem } from './moodboard';

/** Load one image, or null if it cannot be decoded. A broken entry must not lose the whole board. */
function load(src: string): Promise<HTMLImageElement | null> {
  return new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = src;
  });
}

/**
 * Draw the board and return a `data:image/png` URI, or null if the browser will not give us a canvas.
 *
 * The order of `items` IS the z-order, so painting them in order stacks them the way the board does.
 */
export async function renderMoodboardToDataUri(items: readonly MoodboardItem[], canvas: CanvasSize, background: string): Promise<string | null> {
  if (typeof document === 'undefined') return null;
  const el = document.createElement('canvas');
  el.width = canvas.width;
  el.height = canvas.height;
  const ctx = el.getContext('2d');
  if (!ctx) return null;

  ctx.fillStyle = background;
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  const loaded = await Promise.all(items.map((i) => load(i.imageUri)));
  loaded.forEach((img, n) => {
    const it = items[n];
    if (!img) return;
    const w = ITEM_BASE_W * it.scale;
    const h = (ITEM_BASE_W / (it.aspect || 1)) * it.scale;
    ctx.save();
    // Rotate about the image's own centre, which is what the board's transform does.
    ctx.translate(it.x, it.y);
    ctx.rotate((it.rotation * Math.PI) / 180);
    ctx.drawImage(img, -w / 2, -h / 2, w, h);
    ctx.restore();
  });

  try {
    return el.toDataURL('image/png');
  } catch {
    // A tainted canvas: an image came from an origin that will not allow it to be read back. Nothing
    // to be done about that here, and a broken portrait is worse than none.
    return null;
  }
}
