import { CLASS_DATA, featurePages, MAX_FEATURE_PAGES } from '@/data/class-data';
import { classCardCount, classCardId, classCards, isClassCard, missingClassCards } from './class-cards';

const ALL = Object.keys(CLASS_DATA) as (keyof typeof CLASS_DATA)[];

describe('featurePages, the balanced pager (v0.42.1)', () => {
  it('never continues an ability without saying which part it is', () => {
    // v0.42.0 removed "(cont.)"; v0.42.1 keeps it gone and names the parts instead.
    for (const c of ALL) {
      for (const p of featurePages(c)) {
        for (const s of p.sections) {
          expect(s.name).not.toContain('cont.');
          if (s.name !== s.name.replace(/ \(\d+\/\d+\)$/, '')) expect(s.name).toMatch(/ \(\d+\/\d+\)$/);
        }
      }
    }
  });

  it('gives no class more than the page cap', () => {
    for (const c of ALL) expect(featurePages(c).length).toBeLessThanOrEqual(MAX_FEATURE_PAGES);
  });

  it('gives every class at least two cards', () => {
    for (const c of ALL) expect(featurePages(c).length).toBeGreaterThanOrEqual(2);
  });

  it('keeps every ability, whole, in order', () => {
    for (const c of ALL) {
      const printed = featurePages(c).flatMap((p) => p.sections).map((s) => s.text).join('\n');
      for (const f of CLASS_DATA[c].features) {
        // Every line of every feature survives the split, in the book's own words.
        for (const line of f.text.split('\n')) expect(printed).toContain(line);
      }
      expect(printed).toContain(CLASS_DATA[c].hopeFeature.text);
    }
  });

  it('puts the hope feature last, where the printed cards do', () => {
    for (const c of ALL) {
      const sections = featurePages(c).flatMap((p) => p.sections);
      expect(sections[sections.length - 1].name).toContain('Hope Feature');
    }
  });

  it('splits the abilities the owner called out, and only where it must', () => {
    // Beastform is the longest rule in the game and cannot be read on one card.
    expect(featurePages('druid').flatMap((p) => p.sections).some((s) => s.name === 'Beastform (1/2)')).toBe(true);
    // Rally fits, so it is not cut up.
    expect(featurePages('bard').flatMap((p) => p.sections).some((s) => s.name === 'Rally')).toBe(true);
  });

  it('lets a short feature share a card rather than take one to itself', () => {
    // The guardian's Hope feature is 64 characters; a card of its own was mostly empty.
    const last = featurePages('guardian').at(-1)!;
    expect(last.sections.length).toBeGreaterThan(1);
  });
});

describe('classCards', () => {
  it('makes one card per ability, in order', () => {
    const sections = featurePages('druid').flatMap((p) => p.sections);
    const cards = classCards('druid');
    expect(cards).toHaveLength(sections.length);
    expect(cards.map((c) => c.title)).toEqual(sections.map((s) => s.name));
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

  it('carries the ability itself, in the book\'s words', () => {
    // Beastform is split, so its parts together are the rule; nothing is dropped or reworded.
    const parts = classCards('druid').filter((c) => c.title.startsWith('Beastform'));
    expect(parts.length).toBeGreaterThan(0);
    expect(parts.map((c) => c.text).join('\n')).toBe(CLASS_DATA.druid.features[0].text);
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
