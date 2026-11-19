import { DOMAT, DOMAT_MAX, DOMAT_REFILL_MS, domatStock, drawDomat, takeDomat } from './domat';

describe('Deck of Many Things', () => {
  it('has all 22 cards of the booklet, each with a table effect and a line saying what it does', () => {
    expect(DOMAT).toHaveLength(22);
    expect(new Set(DOMAT.map((c) => c.id)).size).toBe(22);
    for (const c of DOMAT) {
      expect(c.effect).toBeTruthy();
      expect(c.table.length).toBeGreaterThan(10);
      expect(c.text.length).toBeGreaterThan(10);
      expect(c.table).not.toMatch(/—/);
    }
  });

  it('only the Fool and the Jester leave the deck once drawn', () => {
    expect(DOMAT.filter((c) => c.once).map((c) => c.id).sort()).toEqual(['fool', 'jester']);
  });

  it('never draws a card that has left, and draws nothing when every card has', () => {
    const gone = new Set(DOMAT.filter((c) => c.id !== 'sun').map((c) => c.id));
    expect(drawDomat(gone)?.id).toBe('sun');
    expect(drawDomat(new Set(DOMAT.map((c) => c.id)))).toBeNull();
  });

  it('keeps a stock: one card grows every 200 seconds, up to ten, and a draw takes one', () => {
    const t0 = 1_000_000;
    expect(domatStock({ stock: 1, since: t0 }, t0)).toEqual({ stock: 1, since: t0, next: DOMAT_REFILL_MS });
    expect(domatStock({ stock: 1, since: t0 }, t0 + DOMAT_REFILL_MS * 2 + 5).stock).toBe(3);
    expect(domatStock({ stock: 9, since: t0 }, t0 + DOMAT_REFILL_MS * 50)).toEqual({ stock: DOMAT_MAX, since: t0 + DOMAT_REFILL_MS * 50, next: null });
    // From a full deck the next card starts growing at the draw.
    expect(takeDomat({ stock: DOMAT_MAX, since: 0 }, t0)).toEqual({ stock: DOMAT_MAX - 1, since: t0 });
    // A half-grown card keeps growing after a draw.
    expect(takeDomat({ stock: 2, since: t0 }, t0 + 1000)).toEqual({ stock: 1, since: t0 });
    expect(takeDomat({ stock: 0, since: t0 }, t0 + 10)).toBeNull();
    // Broken saved values never make a broken stock.
    expect(domatStock({ stock: Number.NaN, since: Number.NaN }, t0).stock).toBe(1);
  });
});
