import { hasMartialForm, isMartialStanceId, MARTIAL_FOCUS_CARD_ID, MARTIAL_STANCES, martialStanceById } from './martial-form-data';

describe('martial form data (#357)', () => {
  it('holds the official release roster: 16 stances, 4 per tier', () => {
    expect(MARTIAL_STANCES).toHaveLength(16);
    const byTier = (t: number) => MARTIAL_STANCES.filter((s) => s.tier === t).length;
    expect([byTier(1), byTier(2), byTier(3), byTier(4)]).toEqual([4, 4, 4, 4]);
  });

  it('every stance has a unique ms- prefixed id, a name, and a body', () => {
    const ids = MARTIAL_STANCES.map((s) => s.id);
    expect(new Set(ids).size).toBe(16);
    for (const s of MARTIAL_STANCES) {
      expect(isMartialStanceId(s.id)).toBe(true);
      expect(s.name.length).toBeGreaterThan(0);
      expect(s.body.length).toBeGreaterThan(0);
    }
  });

  it('mechanical stances carry engine effects (Aggressive -1 Evasion, Anchored +2 thresholds)', () => {
    expect(martialStanceById('ms-aggressive')?.effects).toEqual([{ target: 'evasion', delta: -1 }]);
    expect(martialStanceById('ms-anchored')?.effects).toEqual([
      { target: 'majorThreshold', mode: 'bonus', delta: 2 },
      { target: 'severeThreshold', mode: 'bonus', delta: 2 },
    ]);
  });

  it('the Focus card id is not a stance id', () => {
    expect(isMartialStanceId(MARTIAL_FOCUS_CARD_ID)).toBe(false);
  });

  it('gates on the martial-artist subclass, primary or multiclass (the hasCompanion pattern)', () => {
    expect(hasMartialForm({ subclassCardId: 'subclass-martial-artist-1-foundation' })).toBe(true);
    expect(hasMartialForm({ subclassCardId: 'subclass-juggernaut-1-foundation', multiclassSubclassCardId: 'subclass-martial-artist-1-foundation' })).toBe(true);
    expect(hasMartialForm({ subclassCardId: 'subclass-juggernaut-1-foundation' })).toBe(false);
    expect(hasMartialForm({ subclassCardId: 'beastbound' })).toBe(false);
    expect(hasMartialForm({ subclassCardId: '' })).toBe(false);
  });
});
