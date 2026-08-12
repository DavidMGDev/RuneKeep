import { clampPage, galleryPages, gridFor, pageOfCard, selectionLabel, TILE_ASPECT } from './expansion-gallery';
import type { LibraryCard, LibraryContentType } from './library';

const c = (id: string, contentType: LibraryContentType = 'generic'): LibraryCard =>
  ({ id, contentType, title: id, text: '', imageUri: null });

describe('gridFor', () => {
  it('fits as many whole columns as the width holds', () => {
    expect(gridFor(380, 400).columns).toBe(4);
  });

  it('never goes below one column, however narrow the box', () => {
    expect(gridFor(20, 400).columns).toBe(1);
  });

  it('never goes below one row, however short', () => {
    expect(gridFor(380, 10).rows).toBe(1);
  });

  it('keeps a tile big enough to recognise a card by', () => {
    expect(gridFor(380, 400).tileW).toBeGreaterThanOrEqual(84);
  });

  it('keeps a tile small enough that a tablet is still a gallery', () => {
    expect(gridFor(1600, 1200).tileW).toBeLessThanOrEqual(132);
  });

  it('shapes the tile like a card', () => {
    const g = gridFor(380, 400);
    expect(g.tileH).toBeCloseTo(g.tileW * TILE_ASPECT);
  });

  it('reports the page size as the grid', () => {
    const g = gridFor(380, 400);
    expect(g.perPage).toBe(g.columns * g.rows);
  });
});

describe('galleryPages', () => {
  const many = (n: number) => Array.from({ length: n }, (_, i) => c(`card-${String(i).padStart(2, '0')}`));

  it('cuts the SORTED list, so a page means something', () => {
    expect(galleryPages([c('z'), c('a', 'class')], 1)[0][0].id).toBe('a');
  });

  it('fills each page before starting the next', () => {
    const p = galleryPages(many(7), 6);
    expect(p).toHaveLength(2);
    expect(p[0]).toHaveLength(6);
    expect(p[1]).toHaveLength(1);
  });

  it('gives an empty expansion one empty page, so the pager always has something to draw', () => {
    expect(galleryPages([], 6)).toEqual([[]]);
  });

  it('loses nothing', () => {
    expect(galleryPages(many(23), 6).flat()).toHaveLength(23);
  });

  it('survives a zero page size rather than looping forever', () => {
    expect(galleryPages(many(3), 0)).toHaveLength(3);
  });
});

describe('clampPage', () => {
  it('holds a page inside a list that shrank', () => {
    expect(clampPage(9, 3)).toBe(2);
    expect(clampPage(-1, 3)).toBe(0);
  });
});

describe('pageOfCard', () => {
  const pages = [[c('a'), c('b')], [c('d')]];

  it('finds the page a card is on, so editing it does not jump to page one', () => {
    expect(pageOfCard(pages, 'd')).toBe(1);
  });

  it('sends a card that is gone to the first page', () => {
    expect(pageOfCard(pages, 'nope')).toBe(0);
  });
});

describe('selectionLabel', () => {
  it('counts properly', () => {
    expect(selectionLabel(1)).toBe('1 card');
    expect(selectionLabel(4)).toBe('4 cards');
  });
});
