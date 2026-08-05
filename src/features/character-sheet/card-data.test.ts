import { dedupeIds, printFaces } from './card-data';

describe('dedupeIds (#269)', () => {
  it('leaves unique ids untouched', () => {
    expect(dedupeIds(['a', 'b', 'c'])).toEqual(['a', 'b', 'c']);
  });
  it('keeps the first occurrence and suffixes repeats positionally', () => {
    expect(dedupeIds(['x', 'x', 'x'])).toEqual(['x', 'x#2', 'x#3']);
  });
  it('handles interleaved duplicates', () => {
    expect(dedupeIds(['x', 'y', 'x', 'y', 'x'])).toEqual(['x', 'y', 'x#2', 'y#2', 'x#3']);
  });
  it('is a no-op on an empty list', () => {
    expect(dedupeIds([])).toEqual([]);
  });
});

describe('printFaces (v0.35)', () => {
  it('gives a plain card its one bitmap', () => {
    const faces = printFaces({ id: 'a', source: 1, thumb: 2 });
    expect(faces).toEqual([{ image: 1, node: null }]);
  });

  it('gives a multi-page card one entry per face, in order', () => {
    const faces = printFaces({
      id: 'class',
      source: { uri: 'p0' },
      thumb: { uri: 't0' },
      faces: [
        { source: { uri: 'p0' }, thumb: { uri: 't0' } },
        { source: { uri: 'p1' }, thumb: { uri: 't1' } },
        { source: { uri: 'p2' }, thumb: { uri: 't2' } },
      ],
    });
    expect(faces.map((f) => f.image)).toEqual([{ uri: 'p0' }, { uri: 'p1' }, { uri: 'p2' }]);
  });

  it('NEVER hands back the placeholder image for a live card', () => {
    // The carousel puts the app icon in `source` until the forge queue reaches the card. Printing it
    // is what put a grid of app icons on the page in v0.34.8.
    const node = 'the-live-card' as unknown as React.ReactNode;
    const faces = printFaces({ id: 'gold', source: 99, thumb: 99, live: node });
    expect(faces).toEqual([{ image: null, node }]);
  });

  it('falls back to the live page of an un-forged face', () => {
    const node = 'page-2' as unknown as React.ReactNode;
    const faces = printFaces({ id: 'class', source: 99, thumb: 99, faces: [{ source: { uri: 'p0' }, thumb: { uri: 't0' } }, { custom: node }] });
    expect(faces[0].image).toEqual({ uri: 'p0' });
    expect(faces[1]).toEqual({ image: null, node });
  });

  it('has nothing to print for a card that is not there', () => {
    expect(printFaces(undefined)).toEqual([]);
  });
});
