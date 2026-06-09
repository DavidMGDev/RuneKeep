/**
 * Pure responsive math for the DesignStage (see docs/adr/0001).
 *
 * A screen is authored in a fixed design coordinate space (e.g. 412×892). This computes the single
 * uniform scale that fits that design into the available area without ever distorting it, plus the
 * offsets that center it. No React, no side effects — unit-tested in stage-scale.test.ts.
 */
export type StageFit = 'contain' | 'cover';

export interface StageScaleInput {
  /** Available width to fit into (px). */
  availW: number;
  /** Available height to fit into (px). */
  availH: number;
  /** Design-space width the content is authored at (px). */
  designW: number;
  /** Design-space height the content is authored at (px). */
  designH: number;
  /** `contain` (default) fits entirely inside; `cover` fills and may overflow. */
  fit?: StageFit;
}

export interface StageMetrics {
  /** Uniform scale applied to both axes (never per-axis → never stretches). */
  scale: number;
  /** Left offset to center the scaled content. */
  offsetX: number;
  /** Top offset to center the scaled content. */
  offsetY: number;
  /** Resulting on-screen width of the content. */
  scaledW: number;
  /** Resulting on-screen height of the content. */
  scaledH: number;
}

const EMPTY: StageMetrics = { scale: 0, offsetX: 0, offsetY: 0, scaledW: 0, scaledH: 0 };

export function computeStageScale({
  availW,
  availH,
  designW,
  designH,
  fit = 'contain',
}: StageScaleInput): StageMetrics {
  if (designW <= 0 || designH <= 0 || availW <= 0 || availH <= 0) return EMPTY;

  const sx = availW / designW;
  const sy = availH / designH;
  const scale = fit === 'cover' ? Math.max(sx, sy) : Math.min(sx, sy);

  const scaledW = designW * scale;
  const scaledH = designH * scale;
  return {
    scale,
    offsetX: (availW - scaledW) / 2,
    offsetY: (availH - scaledH) / 2,
    scaledW,
    scaledH,
  };
}
