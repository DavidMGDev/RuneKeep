import { normalGain } from './loudness';

const tone = (amp: number, n = 4800) => Float32Array.from({ length: n }, (_, i) => amp * Math.sin(i / 3));

describe('normalGain', () => {
  it('brings loud and quiet sounds to the same level', () => {
    const loud = normalGain([tone(0.9)], 48000);
    const quiet = normalGain([tone(0.1)], 48000);
    expect(0.9 * loud).toBeCloseTo(0.1 * quiet, 2);
    expect(loud).toBeLessThan(1);
  });
  it('never clips the peak nor boosts past the cap', () => {
    expect(normalGain([tone(0.001)], 48000)).toBe(6);
    const spike = new Float32Array(48000);
    spike[10] = 0.9;
    expect(normalGain([spike], 48000) * spike[10]).toBeCloseTo(1, 6);
  });
  it('leaves silence alone', () => {
    expect(normalGain([new Float32Array(100)], 48000)).toBe(1);
    expect(normalGain([], 48000)).toBe(1);
  });
});
