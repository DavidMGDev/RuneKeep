import { authoredSections, formMarkdown, generatedSection, withGenerated } from './card-form';
import type { WeaponSpec } from './library';

const WEAPON: WeaponSpec = { trait: 'Agility', range: 'Melee', damage: 'd10+3', damageType: 'phy', burden: 'Two-Handed', kind: 'physical', slot: 'primary', tier: 2 };

describe('what the detail form writes onto a card', () => {
  it('prints a weapon the way the printed weapon cards read', () => {
    expect(formMarkdown({ contentType: 'weapon', weapon: WEAPON })).toBe(
      ['**Trait:** Agility', '**Range:** Melee', '**Damage:** d10+3 phy', '**Burden:** Two-Handed', '**Tier:** 2'].join('\n\n'),
    );
  });

  it('prints armor as thresholds then score', () => {
    expect(formMarkdown({ contentType: 'armor', armor: { baseScore: 3, thresholds: '7/15', tier: 1 } })).toBe(
      ['**Thresholds:** 7/15', '**Base Score:** 3', '**Tier:** 1'].join('\n\n'),
    );
  });

  it('names a subclass card by its class, family and tier word', () => {
    expect(formMarkdown({ contentType: 'subclass', className: 'druid', subclass: 'Warden', tier: 3 })).toBe(
      ['**Class:** druid', '**Subclass:** Warden', '**Tier:** Mastery'].join('\n\n'),
    );
  });

  it('drops a row nobody filled in rather than printing it blank', () => {
    expect(formMarkdown({ contentType: 'domain', domain: 'arcana' })).toBe('**Domain:** arcana');
    expect(formMarkdown({ contentType: 'class', className: '  ' })).toBe('');
  });

  it('says nothing for a card that has no mechanical facts', () => {
    // An ancestry or a community is prose; there is no form to print.
    expect(formMarkdown({ contentType: 'ancestry' })).toBe('');
    expect(formMarkdown({ contentType: 'community' })).toBe('');
    expect(formMarkdown({ contentType: 'generic' })).toBe('');
    expect(formMarkdown({ contentType: 'weapon' })).toBe(''); // type chosen, form not filled yet
  });
});

describe('keeping the block apart from the author own words', () => {
  const mine = { name: 'Quick', body: 'Mark a Stress to strike twice.' };

  it('leads with the block and leaves everything else where it was', () => {
    const next = withGenerated([mine], '**Trait:** Agility');
    expect(next).toEqual([{ body: '**Trait:** Agility', generated: true }, mine]);
    expect(authoredSections(next)).toEqual([mine]);
    expect(generatedSection(next)?.body).toBe('**Trait:** Agility');
  });

  it('replaces the old block rather than stacking another one on top', () => {
    const once = withGenerated([mine], '**Trait:** Agility');
    const twice = withGenerated(once, '**Trait:** Strength');
    expect(twice.filter((s) => s.generated)).toHaveLength(1);
    expect(twice[0].body).toBe('**Trait:** Strength');
    expect(authoredSections(twice)).toEqual([mine]);
  });

  it('removes the block entirely when the form has nothing to say', () => {
    const next = withGenerated(withGenerated([mine], '**Trait:** Agility'), '');
    expect(next).toEqual([mine]);
    expect(generatedSection(next)).toBeUndefined();
  });

  it('copes with a card that has no sections at all', () => {
    expect(withGenerated(undefined, '**Level:** 1')).toEqual([{ body: '**Level:** 1', generated: true }]);
    expect(authoredSections(undefined)).toEqual([]);
  });
});
