import { domainLabel, domainLabels, domainPair } from './domain-label';

describe('domainLabel', () => {
  it('capitalises a stored key, which is how every base-game domain is stored', () => {
    expect(domainLabel('arcana')).toBe('Arcana');
    expect(domainLabel('blade')).toBe('Blade');
  });

  it('leaves an author name exactly as they typed it', () => {
    expect(domainLabel('the Deep')).toBe('the Deep');
    expect(domainLabel('PYRE')).toBe('PYRE');
  });

  it('capitalises every word of a two-word key', () => {
    expect(domainLabel('bone ash')).toBe('Bone Ash');
  });

  it('says nothing about nothing', () => {
    expect(domainLabel(undefined)).toBe('');
    expect(domainLabel('   ')).toBe('');
  });
});

describe('domainLabels', () => {
  it('maps a list', () => {
    expect(domainLabels(['sage', 'valor'])).toEqual(['Sage', 'Valor']);
  });
});

describe('domainPair', () => {
  it('reads as a sentence for the usual two', () => {
    expect(domainPair(['sage', 'valor'])).toBe('Sage and Valor');
  });

  it('falls back to a list for anything else', () => {
    expect(domainPair(['sage'])).toBe('Sage');
    expect(domainPair([])).toBe('');
  });
});
