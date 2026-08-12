import { CLASS_DATA, featurePages } from '@/data/class-data';
import { classCardCount, classCardId, classCards, isClassCard, missingClassCards } from './class-cards';

const ALL = Object.keys(CLASS_DATA) as (keyof typeof CLASS_DATA)[];

describe('featurePages, one ability per page (v0.42.0)', () => {
  it('never puts more than one ability on a page', () => {
    for (const c of ALL) for (const p of featurePages(c)) expect(p.sections).toHaveLength(1);
  });

  it('never continues an ability onto a second page', () => {
    // The owner's rule: "entire abilities per page". No more "Beastform (cont.)".
    for (const c of ALL) for (const p of featurePages(c)) expect(p.sections[0].name).not.toContain('cont.');
  });

  it('gives no class more than four cards', () => {
    for (const c of ALL) expect(featurePages(c).length).toBeLessThanOrEqual(4);
  });

  it('gives every class at least two', () => {
    for (const c of ALL) expect(featurePages(c).length).toBeGreaterThanOrEqual(2);
  });

  it('is exactly the features plus the hope feature', () => {
    for (const c of ALL) expect(featurePages(c)).toHaveLength(CLASS_DATA[c].features.length + 1);
  });

  it('puts the hope feature last, where the printed cards do', () => {
    for (const c of ALL) {
      const pages = featurePages(c);
      expect(pages[pages.length - 1].sections[0].name).toContain('Hope Feature');
    }
  });
});

describe('classCards', () => {
  it('makes one card per ability, in order', () => {
    const cards = classCards('druid');
    expect(cards).toHaveLength(featurePages('druid').length);
    expect(cards.map((c) => c.title)).toEqual(featurePages('druid').map((p) => p.sections[0].name));
  });

  it('gives every card a deterministic id, so expanding twice cannot duplicate', () => {
    expect(classCards('warrior').map((c) => c.id)).toEqual(classCards('warrior').map((c) => c.id));
    expect(classCards('warrior')[0].id).toBe(classCardId('warrior', 0));
  });

  it('grants NOTHING, because a class carries its own numbers', () => {
    for (const c of ALL) for (const card of classCards(c)) expect(card.effects).toBeUndefined();
  });

  it('lands in the arsenal, because an ability is not equipment', () => {
    for (const card of classCards('bard')) expect(card.target).toBe('arsenal');
  });

  it('carries the whole rule, not a fragment', () => {
    const beastform = classCards('druid').find((c) => c.title === 'Beastform');
    expect(beastform?.text).toBe(CLASS_DATA.druid.features[0].text);
  });

  it('marks its own cards recognisably', () => {
    for (const card of classCards('rogue')) expect(isClassCard(card.id)).toBe(true);
    expect(isClassCard('cc-something-else')).toBe(false);
  });
});

describe('missingClassCards', () => {
  it('is everything when the character has none', () => {
    expect(missingClassCards('wizard', undefined)).toHaveLength(classCardCount('wizard'));
  });

  it('is nothing when the character already has them, so Expand twice is safe', () => {
    expect(missingClassCards('wizard', classCards('wizard'))).toEqual([]);
  });

  it('is only the gap when one was deleted', () => {
    const [, ...rest] = classCards('wizard');
    expect(missingClassCards('wizard', rest).map((c) => c.id)).toEqual([classCardId('wizard', 0)]);
  });

  it("ignores the character's other cards", () => {
    expect(missingClassCards('seraph', [{ id: 'cc-notes-1' }])).toHaveLength(classCardCount('seraph'));
  });
});
