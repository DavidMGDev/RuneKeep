import { hpLostFromDamage } from './damage';

const T = { major: 8, severe: 17 }; // owner's worked example (Full Plate-ish)

describe('hpLostFromDamage', () => {
  it('costs nothing for zero/negative damage', () => {
    expect(hpLostFromDamage(0, T)).toBe(0);
    expect(hpLostFromDamage(-5, T)).toBe(0);
  });
  it('below major → 1', () => {
    expect(hpLostFromDamage(1, T)).toBe(1);
    expect(hpLostFromDamage(7, T)).toBe(1);
  });
  it('meets major → 2', () => {
    expect(hpLostFromDamage(8, T)).toBe(2);
    expect(hpLostFromDamage(16, T)).toBe(2);
  });
  it('meets severe → 3', () => {
    expect(hpLostFromDamage(17, T)).toBe(3);
    expect(hpLostFromDamage(33, T)).toBe(3);
  });
  it('double severe → 4', () => {
    expect(hpLostFromDamage(34, T)).toBe(4);
    expect(hpLostFromDamage(100, T)).toBe(4);
  });
  it('works with the 7/15 example', () => {
    const C = { major: 7, severe: 15 };
    expect(hpLostFromDamage(6, C)).toBe(1);
    expect(hpLostFromDamage(7, C)).toBe(2);
    expect(hpLostFromDamage(15, C)).toBe(3);
    expect(hpLostFromDamage(30, C)).toBe(4);
  });
});
