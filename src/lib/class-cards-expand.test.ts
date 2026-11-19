import type { CharacterFile } from './character-file';
import { classPageId, expandAllClassCards } from './class-cards';

const base = { schemaVersion: 1, id: 'c1', createdAt: '2026-11-19', name: 'Test', className: 'brawler' } as unknown as CharacterFile;

describe('expandAllClassCards', () => {
  it('expands a paged class card into its pages, keeping the deck it was in', () => {
    const f = expandAllClassCards({ ...base, cardCategory: { 'features-brawler': 'inventory' } } as CharacterFile);
    expect(f.classExpanded).toBe(true);
    expect(f.cardCategory?.[classPageId('brawler' as CharacterFile['className'], 0)]).toBe('inventory');
  });

  it('leaves an expanded character exactly as it was', () => {
    const f = { ...base, classExpanded: true } as CharacterFile;
    expect(expandAllClassCards(f)).toBe(f);
  });

  it('expands class cards picked up from Add Gear too, once each', () => {
    const f = expandAllClassCards({ ...base, classExpanded: true, acquiredCardIds: ['class-bard', 'class-bard#2'] } as CharacterFile);
    expect(f.expandedClassCards).toEqual(['class-bard']);
  });
});
