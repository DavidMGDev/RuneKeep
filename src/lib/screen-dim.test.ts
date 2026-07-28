import { DEFAULT_EDGE, dimLevel, edgeColor, registerDim, registerEdge, resetScreenDim } from './screen-dim';

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

/**
 * The edge colour is a STACK, not a map: screens nest, and the one mounted most recently is the one
 * showing at the edge. Getting the unmount order wrong would strand the margins on the colour of a
 * screen that has already gone.
 */
describe('edge colour', () => {
  beforeEach(resetScreenDim);

  it('declares nothing until a screen says otherwise, so the caller keeps its own default', () => {
    expect(edgeColor()).toBe(DEFAULT_EDGE);
  });

  it('shows the most recently mounted declaration', () => {
    registerEdge('#111111');
    registerEdge('#222222');
    expect(edgeColor()).toBe('#222222');
  });

  it('falls back to the one underneath when the top screen unmounts', () => {
    registerEdge('#111111');
    const top = registerEdge('#222222');
    top();
    expect(edgeColor()).toBe('#111111');
  });

  it('handles an out-of-order unmount without stranding the wrong colour', () => {
    const under = registerEdge('#111111');
    registerEdge('#222222');
    under();
    expect(edgeColor()).toBe('#222222');
  });

  it('returns to ink once every screen has gone', () => {
    const a = registerEdge('#111111');
    a();
    expect(edgeColor()).toBe(DEFAULT_EDGE);
  });
});
