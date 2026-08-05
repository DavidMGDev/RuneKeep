import type { RefObject } from 'react';
import type { View } from 'react-native';
import { captureRef } from 'react-native-view-shot';

import { boundedPrintJpeg } from '@/lib/card-pdf';

/**
 * Rasterise one offscreen card to a `data:` URI (v0.35).
 *
 * Split by platform because the two are genuinely different calls. On a phone `react-native-view-shot`
 * draws the native view into a bitmap of the size asked for. In a browser its wrapper goes through
 * `findNodeHandle`, which react-native-web REFUSES ("findNodeHandle is not supported on web"), so every
 * capture threw and every app-drawn card fell back to the plain HTML card. See the `.web` twin.
 *
 * v0.35.1: the capture lands in a temp FILE and is re-encoded to a bounded JPEG, so a page of nine
 * cards is a couple of megabytes of HTML rather than ten. Inlining full-size PNGs is what stopped the
 * Android print engine decoding them at all.
 */
export async function captureCard(ref: RefObject<View | null>, width: number, height: number): Promise<string | null> {
  const file = await captureRef(ref, { format: 'png', quality: 1, result: 'tmpfile', width, height });
  return boundedPrintJpeg(file);
}
