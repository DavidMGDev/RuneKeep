/**
 * The play table's 3D dice exist on desktop web only (see dice-engine.web.ts). This is what a phone build sees:
 * the types, and an engine that never starts, so three.js is never part of a native bundle.
 */
import type { DiceEngine } from './dice-engine.web';

export type { DiceEngine, DieSpec, FaceArt, Shape } from './dice-engine.web';

export const FACE_COUNT = { d4: 4, d6: 6, d8: 8, d10: 10, d12: 12, d20: 20 } as const;

export function createDiceEngine(_canvas: unknown, _opts: { modelUrl: string; font: string }): Promise<DiceEngine> {
  return Promise.reject(new Error('The 3D table runs on desktop web only.'));
}

export function knock(..._args: unknown[]): void {}
