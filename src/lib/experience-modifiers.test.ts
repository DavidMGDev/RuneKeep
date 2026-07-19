/**
 * v0.14.0: Experiences as a modifier target. Unlike every other target this names an INSTANCE, so the
 * rules that matter are which Experience an effect lands on and what happens when it names none / a
 * deleted one. The Honing Relic ("+1 to an Experience of your choice") is the shipped case.
 */
import { type CharacterFile, experienceBreakdown } from './character-file';

function fileWith(over: Partial<CharacterFile> = {}): CharacterFile {
  return {
    schemaVersion: 1,
    id: 'x',
    createdAt: '2026-01-01',
    name: 'Test',
    portraitUri: null,
    className: 'guardian',
    subclassCardId: 'subclass-stalwart-1-foundation',
    ancestryCardId: 'ancestry-giant',
    communityCardId: 'community-wildborne',
    domainCardIds: [],
    level: 1,
    experiences: [
      { id: 'exp-a', title: 'Silver Tongue', text: '', imageUri: null, modifier: 2 },
      { id: 'exp-b', title: 'Battlefield Medic', text: '', imageUri: null, modifier: 2 },
    ],
    ...over,
  };
}

/** The Honing Relic, equipped. Its effect deliberately carries NO experienceId. */
const withRelic = (over: Partial<CharacterFile> = {}) =>
  fileWith({ acquiredCardIds: ['loot-honing-relic'], enabledCardIds: ['loot-honing-relic'], ...over });

describe('experienceBreakdown', () => {
  it('returns nothing when the character has no Experiences', () => {
    expect(experienceBreakdown(fileWith({ experiences: [] }))).toEqual([]);
    expect(experienceBreakdown(fileWith({ experiences: undefined }))).toEqual([]);
  });

  it('reports the starting +2 with no contributions for an untouched Experience', () => {
    const [a] = experienceBreakdown(fileWith());
    expect(a).toMatchObject({ id: 'exp-a', title: 'Silver Tongue', base: 2, total: 2 });
    expect(a.contributions).toEqual([]);
  });

  it('itemizes level-up advancements above the +2 start', () => {
    const [a] = experienceBreakdown(fileWith({ experiences: [{ id: 'exp-a', title: 'Silver Tongue', text: '', imageUri: null, modifier: 4 }] }));
    expect(a.total).toBe(4);
    expect(a.contributions).toEqual([{ source: 'Level up', delta: 2, note: 'Experience advancements' }]);
  });

  it('lands an effect with NO experienceId on the FIRST Experience — the shipped Honing Relic', () => {
    const [a, b] = experienceBreakdown(withRelic());
    expect(a.total).toBe(3);
    expect(a.contributions.map((c) => c.source)).toContain('Honing Relic');
    expect(b.total).toBe(2);
    expect(b.contributions).toEqual([]);
  });

  it('lands a retargeted effect on exactly the named Experience', () => {
    const [a, b] = experienceBreakdown(
      withRelic({ cardEffectOverrides: { 'loot-honing-relic': [{ target: 'experience', delta: 1, experienceId: 'exp-b' }] } }),
    );
    expect(a.total).toBe(2);
    expect(b.total).toBe(3);
  });

  it('drops an effect naming an Experience that no longer exists', () => {
    const rows = experienceBreakdown(
      withRelic({ cardEffectOverrides: { 'loot-honing-relic': [{ target: 'experience', delta: 1, experienceId: 'exp-deleted' }] } }),
    );
    expect(rows.map((r) => r.total)).toEqual([2, 2]);
  });

  it('applies nothing while the relic is carried but NOT equipped', () => {
    const rows = experienceBreakdown(fileWith({ acquiredCardIds: ['loot-honing-relic'] }));
    expect(rows.map((r) => r.total)).toEqual([2, 2]);
  });

  it('stacks a level-up advancement and a card bonus on the same Experience', () => {
    const [a] = experienceBreakdown(
      withRelic({ experiences: [{ id: 'exp-a', title: 'Silver Tongue', text: '', imageUri: null, modifier: 3 }] }),
    );
    expect(a.total).toBe(4);
    expect(a.contributions).toHaveLength(2);
  });
});
