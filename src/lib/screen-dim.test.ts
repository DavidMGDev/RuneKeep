import { dimLevel, registerDim, resetScreenDim } from './screen-dim';

/**
 * The contract the tablet margins depend on: while any overlay is up, the darkest one is reported,
 * and when the last one unmounts the level returns to zero. Getting the second half wrong would
 * leave a tablet permanently dimmed at the edges, which is worse than the bug this fixes.
 */
describe('screen dim', () => {
  beforeEach(resetScreenDim);

  it('is zero with nothing on screen', () => {
    expect(dimLevel()).toBe(0);
  });

  it('reports the darkest of several stacked overlays, not their sum', () => {
    const a = registerDim(0.6);
    const b = registerDim(0.9);
    expect(dimLevel()).toBe(0.9);
    b();
    expect(dimLevel()).toBe(0.6);
    a();
    expect(dimLevel()).toBe(0);
  });

  it('ignores a zero registration, so a conditional dim can pass 0 rather than branch', () => {
    registerDim(0);
    expect(dimLevel()).toBe(0);
  });

  it('notifies subscribers, since the margins repaint from that and nothing else', () => {
    const seen: number[] = [];
    const off = registerDim(0.5);
    expect(dimLevel()).toBe(0.5);
    off();
    seen.push(dimLevel());
    expect(seen).toEqual([0]);
  });
});
