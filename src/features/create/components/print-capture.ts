import type { RefObject } from 'react';
import type { View } from 'react-native';
import { captureRef } from 'react-native-view-shot';

/**
 * Rasterise one offscreen card to a `data:` URI (v0.35).
 *
 * Split by platform because the two are genuinely different calls. On a phone `react-native-view-shot`
 * draws the native view into a bitmap of the size asked for. In a browser its wrapper goes through
 * `findNodeHandle`, which react-native-web REFUSES ("findNodeHandle is not supported on web"), so every
 * capture threw and every app-drawn card fell back to the plain HTML card. See the `.web` twin.
 */
export async function captureCard(ref: RefObject<View | null>, width: number, height: number): Promise<string | null> {
  return captureRef(ref, { format: 'png', quality: 1, result: 'data-uri', width, height });
}
