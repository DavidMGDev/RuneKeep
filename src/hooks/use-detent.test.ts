import { detentStep } from './use-detent';

const nearest = (v: number) => Math.round(v);
const step = (prev: number | null, cur: number, left = 40) => detentStep(prev, cur, nearest, left);

describe('detentStep', () => {
  it('keeps watching on the first sample, because one number says nothing', () => {
    expect(step(null, 3.42)).toEqual({ done: false, settleTo: null });
  });

  it('keeps watching while the value is still moving', () => {
    expect(step(3.42, 4.1)).toEqual({ done: false, settleTo: null });
  });

  it('settles a value that came to rest between two detents', () => {
    expect(step(3.42, 3.42)).toEqual({ done: true, settleTo: 3 });
  });

  it('rounds to the NEAREST detent, not the one it came from', () => {
    expect(step(3.71, 3.71).settleTo).toBe(4);
  });

  it('leaves a value that came to rest ON a detent', () => {
    expect(step(5, 5)).toEqual({ done: true, settleTo: null });
  });

  it('treats a spring that has all but arrived as arrived', () => {
    expect(step(6.00001, 6.00002)).toEqual({ done: true, settleTo: null });
  });

  it('gives up rather than chase a value that never stops', () => {
    expect(step(1, 2, 0)).toEqual({ done: true, settleTo: null });
  });

  it('never settles a moving value, even on its last sample', () => {
    expect(step(1, 2.5, 0).settleTo).toBeNull();
  });
});
