import type { RefObject } from 'react';
import type { View } from 'react-native';

/**
 * The browser's half of the card capture (v0.35).
 *
 * `react-native-view-shot` has a web implementation and it is the right one, but its shared entry
 * point resolves the ref through `findNodeHandle` first, and react-native-web throws on that call
 * outright. So the same library's engine is called directly: a react-native-web `View` ref IS the DOM
 * element, which is exactly what `html2canvas` wants.
 *
 * `html2canvas` is already in the web bundle (view-shot depends on it), and this file never reaches a
 * native bundle, so nothing is added to the app.
 */
type H2C = (el: HTMLElement, opts?: Record<string, unknown>) => Promise<HTMLCanvasElement>;

export async function captureCard(ref: RefObject<View | null>, width: number, height: number): Promise<string | null> {
  const el = ref.current as unknown as HTMLElement | null;
  if (!el) return null;
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const mod = require('html2canvas') as { default?: H2C } & H2C;
  const html2canvas: H2C = mod.default ?? mod;
  const canvas = await html2canvas(el, { backgroundColor: null, logging: false, useCORS: true });
  if (canvas.width === width && canvas.height === height) return canvas.toDataURL('image/png');
  // The stage is drawn at print size, but the browser's pixel ratio decides what html2canvas hands
  // back, so bring it to exactly 750 x 1050 rather than putting an odd size on the page.
  const out = document.createElement('canvas');
  out.width = width;
  out.height = height;
  out.getContext('2d')?.drawImage(canvas, 0, 0, width, height);
  return out.toDataURL('image/png');
}
