import { isAncestryEffectDisabled, mixedActiveTrait } from './ancestry-traits';

/**
 * Reversing a mixed ancestry (v0.29.0).
 *
 * The reverse button swaps one pair of ids and nothing else, on the promise that everything the
 * player can see follows from it. These are that promise, written down: the owner's own Giant plus
 * Faerie example, in both orders.
 *
 * Giant's passive (an extra Hit Point slot) rides its FIRST feature. So Giant taken first keeps it,
 * and Giant taken second must lose it, because the half carrying it has been struck through.
 */
const GIANT = 'ancestry-giant';
const FAERIE = 'ancestry-faerie';

describe('a mixed ancestry, and reversing it', () => {
  const forward = { first: GIANT, second: FAERIE };
  const reversed = { first: FAERIE, second: GIANT };

  it('gives each card the trait its slot says', () => {
    expect(mixedActiveTrait(forward, GIANT)).toBe(1);
    expect(mixedActiveTrait(forward, FAERIE)).toBe(2);
    expect(mixedActiveTrait(reversed, GIANT)).toBe(2);
    expect(mixedActiveTrait(reversed, FAERIE)).toBe(1);
  });

  it("keeps Giant's extra Hit Point while Giant is first", () => {
    expect(isAncestryEffectDisabled(forward, GIANT)).toBe(false);
  });

  it('drops it the moment Giant becomes second', () => {
    expect(isAncestryEffectDisabled(reversed, GIANT)).toBe(true);
  });

  it('reversing twice is exactly where you started', () => {
    const back = { first: reversed.second, second: reversed.first };
    expect(back).toEqual(forward);
    expect(isAncestryEffectDisabled(back, GIANT)).toBe(false);
  });

  it('leaves a card that is in neither slot alone', () => {
    expect(mixedActiveTrait(forward, 'ancestry-elf')).toBeNull();
    expect(isAncestryEffectDisabled(forward, 'ancestry-elf')).toBe(false);
  });

  it('changes nothing for an ancestry whose features carry no modifiers', () => {
    // Faerie's features are text the player acts on, not engine effects, so neither order enables or
    // disables anything. The strike lines still move; that is drawn, not computed here.
    expect(isAncestryEffectDisabled(forward, FAERIE)).toBe(false);
    expect(isAncestryEffectDisabled(reversed, FAERIE)).toBe(false);
  });
});
