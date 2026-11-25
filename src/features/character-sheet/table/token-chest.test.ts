import { kindScale } from '../components/card-tokens-data';
import { mineReach, TOKEN_STEPS, tokenRound } from './token-chest';

const sizeOf = (t: { kind: Parameters<typeof kindScale>[0]; big?: number }) => kindScale(t.kind) * (t.big ?? 1);

it('throws tokens out smallest first and never a smaller one after a bigger, colours included', () => {
  let seed = 7;
  const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
  for (let round = 0; round < 50; round++) {
    const sizes = tokenRound(rnd).map(sizeOf);
    expect(sizes).toHaveLength(TOKEN_STEPS.length);
    for (let i = 1; i < sizes.length; i++) expect(sizes[i]).toBeGreaterThanOrEqual(sizes[i - 1]);
  }
});

it('mixes in a few colour tokens at the size of the step they replace', () => {
  const always = tokenRound(() => 0.1);
  expect(always.every((t) => t.kind === 'color' && !!t.color)).toBe(true);
  expect(always.map(sizeOf)).toEqual(TOKEN_STEPS.map((k) => kindScale(k)));
  expect(tokenRound(() => 0.9).map((t) => t.kind)).toEqual(TOKEN_STEPS);
});

it("a mine's reach grows with the tokens it ate, and a big pile reaches past the whole felt", () => {
  expect(mineReach(2)).toBeLessThan(mineReach(3));
  expect(mineReach(3)).toBeLessThan(Math.hypot(1600, 900) * 0.85);
  // The felt beside the hand at 1920x1080 (dm-layout.test.ts lists them).
  expect(mineReach(20)).toBeGreaterThan(Math.hypot(1423, 1080) * 0.85);
});
