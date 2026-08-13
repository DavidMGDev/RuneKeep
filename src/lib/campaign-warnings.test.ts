import { optionKey } from './campaign-settings';
import { campaignWarnings } from './campaign-warnings';

const CONTENT = {
  classes: [
    { id: 'class-bard', label: 'Bard', domains: ['grace', 'codex'] },
    { id: 'class-druid', label: 'Druid', domains: ['sage', 'arcana'] },
  ],
  subclasses: [
    { id: 'sub-troubadour', classId: 'class-bard' },
    { id: 'sub-wordsmith', classId: 'class-bard' },
    { id: 'sub-warden', classId: 'class-druid' },
  ],
  domainCards: [
    { id: 'g1', domain: 'grace' }, { id: 'g2', domain: 'grace' },
    { id: 'c1', domain: 'codex' },
    { id: 's1', domain: 'sage' }, { id: 'a1', domain: 'arcana' },
  ],
};

const rules = (disabled: string[]) => ({ on: true, disabled });

describe('campaignWarnings', () => {
  it('says nothing when the rules are off', () => {
    expect(campaignWarnings({ on: false, disabled: ['class:class-bard'] }, CONTENT)).toEqual([]);
  });

  it('says nothing about a campaign that allows everything', () => {
    expect(campaignWarnings(rules([]), CONTENT)).toEqual([]);
  });

  it('warns when every class is removed, because then nobody can start', () => {
    const w = campaignWarnings(rules(CONTENT.classes.map((c) => optionKey('class', c.id))), CONTENT);
    expect(w).toHaveLength(1);
    expect(w[0].deck).toBe('class');
    expect(w[0].text).toContain('Every class is removed');
  });

  it('says only that once, because everything else is about a class that is gone', () => {
    const all = [...CONTENT.classes.map((c) => optionKey('class', c.id)), ...CONTENT.subclasses.map((s) => optionKey('subclass', s.id))];
    expect(campaignWarnings(rules(all), CONTENT)).toHaveLength(1);
  });

  it('warns when a class that is still available has no subclass left', () => {
    const w = campaignWarnings(rules([optionKey('subclass', 'sub-warden')]), CONTENT);
    expect(w.some((x) => x.deck === 'subclass' && x.text.includes('Druid'))).toBe(true);
  });

  it('says nothing about the subclasses of a class that was itself removed', () => {
    const w = campaignWarnings(rules([optionKey('class', 'class-druid'), optionKey('subclass', 'sub-warden')]), CONTENT);
    expect(w).toEqual([]);
  });

  it('counts the two domains TOGETHER, so one card in each is enough', () => {
    // Druid grants sage and arcana, and has exactly one card in each.
    expect(campaignWarnings(rules([]), CONTENT).some((w) => w.deck === 'domains')).toBe(false);
  });

  it('warns when the pair holds only one card between them', () => {
    const w = campaignWarnings(rules([optionKey('domains', 's1')]), CONTENT);
    expect(w.some((x) => x.deck === 'domains' && x.text.includes('Druid') && x.text.includes('only one'))).toBe(true);
  });

  it('warns when the pair holds none', () => {
    const w = campaignWarnings(rules([optionKey('domains', 's1'), optionKey('domains', 'a1')]), CONTENT);
    expect(w.some((x) => x.text.includes('no level 1 domain card'))).toBe(true);
  });

  it('is fine with two cards in ONE of the two domains', () => {
    // Bard grants grace and codex; removing the codex card leaves two grace cards.
    expect(campaignWarnings(rules([optionKey('domains', 'c1')]), CONTENT).some((w) => w.deck === 'domains' && w.text.includes('Bard'))).toBe(false);
  });

  it('names how many to restore, so the DM is not left counting', () => {
    const w = campaignWarnings(rules([optionKey('domains', 's1')]), CONTENT).find((x) => x.deck === 'domains')!;
    expect(w.text).toContain('restore 1');
  });

  it('says nothing about ancestry, community, gear or any other step, which can all be emptied', () => {
    const w = campaignWarnings(rules([optionKey('ancestry', 'anything'), optionKey('community', 'anything')]), CONTENT);
    expect(w).toEqual([]);
  });

  it('copes with a campaign whose content lists are empty', () => {
    expect(campaignWarnings(rules([]), { classes: [], subclasses: [], domainCards: [] })).toEqual([]);
  });
});
