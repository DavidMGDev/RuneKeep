import { type ClassName } from '@/constants/identity';

import { getPlaqueTheme } from './card-divider';

/**
 * v0.37: the six expansion classes had no plaque of their own, so an Assassin's CLASS chip was the
 * same generic red a card with no class at all gets. These say only what the player can see: every
 * class has its own two-stop gradient, and none of them is the fallback.
 */
const EXPANSION: ClassName[] = ['assassin', 'witch', 'warlock', 'bloodhunter', 'summoner', 'brawler'];
const BASE: ClassName[] = ['bard', 'druid', 'guardian', 'ranger', 'rogue', 'seraph', 'sorcerer', 'warrior', 'wizard'];

describe('class plaque colours', () => {
  const fallback = getPlaqueTheme('class');

  it.each(EXPANSION)('%s has a gradient of its own', (key) => {
    const t = getPlaqueTheme('class', key);
    expect(t.gradientStops).toHaveLength(2);
    expect(t.gradientStops).not.toEqual(fallback.gradientStops);
  });

  it('gives every class a distinct gradient', () => {
    const seen = [...BASE, ...EXPANSION].map((k) => JSON.stringify(getPlaqueTheme('class', k).gradientStops));
    expect(new Set(seen).size).toBe(seen.length);
  });

  it('colours the Features card the same as the Class card', () => {
    expect(getPlaqueTheme('features', 'witch')).toEqual(getPlaqueTheme('class', 'witch'));
  });

  it('keeps the generic plaque for a class card with no class', () => {
    expect(fallback.gradientStops).toHaveLength(2);
    expect(fallback.textColor).toBe('#FDE047');
  });

  it('leaves the plain Card type parchment', () => {
    expect(getPlaqueTheme('card')).toEqual({ solidColor: '#FAF8F2', textColor: '#C81B18' });
  });
});
