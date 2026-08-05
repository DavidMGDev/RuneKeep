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
  // Enlarge with the RASTERISER, not with CSS (v0.35.1). The card is drawn at its authored size and
  // html2canvas renders it at `scale`, which is how it produces a crisp 750px card without anything
  // being transformed underneath it. Scaling the DOM instead is what mangled the class-feature pages.
  const scale = el.offsetWidth ? width / el.offsetWidth : 1;
  const canvas = await html2canvas(el, { backgroundColor: null, logging: false, useCORS: true, scale });
  if (canvas.width === width && canvas.height === height) return canvas.toDataURL('image/png');
  const out = document.createElement('canvas');
  out.width = width;
  out.height = height;
  out.getContext('2d')?.drawImage(canvas, 0, 0, width, height);
  return out.toDataURL('image/png');
}
