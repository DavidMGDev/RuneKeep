import { DOMAT, drawDomat } from './domat';

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
});
