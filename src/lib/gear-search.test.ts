import { matchesQuery, rollMatches, searchNorm } from './gear-search';

const BROADSWORD = 'Broadsword Agility Melee d8 phy One-Handed primary Tier 1 Reliable +1 to attack rolls';
const LONGSWORD = 'Longsword Agility Melee d8+3 phy Two-Handed primary Tier 1';
const LOOT_34 = 'Ring of Resistance Roll 34 Table 1 Once per long rest, halve the damage.';

describe('searchNorm', () => {
  it('lower-cases and collapses punctuation to single spaces', () => {
    expect(searchNorm('Two-Handed  (primary)')).toBe('two handed primary');
  });
  it('trims', () => {
    expect(searchNorm('  d8+3 ')).toBe('d8 3');
  });
});

describe('matchesQuery', () => {
  it('matches everything when the query is empty or blank', () => {
    expect(matchesQuery(BROADSWORD, '')).toBe(true);
    expect(matchesQuery(BROADSWORD, '   ')).toBe(true);
  });
  it('matches on the name', () => {
    expect(matchesQuery(BROADSWORD, 'broad')).toBe(true);
    expect(matchesQuery(LONGSWORD, 'broad')).toBe(false);
  });
  it('requires EVERY token, in any order', () => {
    expect(matchesQuery(BROADSWORD, 'agility melee')).toBe(true);
    expect(matchesQuery(BROADSWORD, 'melee agility')).toBe(true);
    expect(matchesQuery(BROADSWORD, 'agility far')).toBe(false);
  });
  it('finds a burden however it is typed', () => {
    for (const q of ['two-handed', 'two handed', 'twohanded']) {
      expect(matchesQuery(LONGSWORD, q)).toBe(true);
      expect(matchesQuery(BROADSWORD, q)).toBe(false);
    }
  });
  it('finds a roll number', () => {
    expect(matchesQuery(LOOT_34, '34')).toBe(true);
    expect(matchesQuery(LOOT_34, '35')).toBe(false);
  });
  it('ignores case', () => {
    expect(matchesQuery(BROADSWORD, 'BROADSWORD')).toBe(true);
  });
});

describe('rollMatches', () => {
  it('compares numbers, so a padded roll matches an unpadded query', () => {
    expect(rollMatches('03', 3)).toBe(true);
    expect(rollMatches('34', 34)).toBe(true);
    expect(rollMatches('34', 3)).toBe(false);
  });
});
