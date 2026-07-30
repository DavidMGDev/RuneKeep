import { bestName, groupNames } from './forged-cache';

const pair = (name: string) => [`${name}.png`, `${name}_lod.png`];

describe('grouping a forged-cache listing', () => {
  it('groups a bitmap pair under its card key', () => {
    expect([...groupNames(pair('blade-05-2-v19-0.26.0')).keys()]).toEqual(['blade-05-2']);
  });

  it('keeps every version of a key together', () => {
    const index = groupNames([...pair('rogue-01-v18-0.25.0'), ...pair('rogue-01-v19-0.26.0')]);
    expect(index.get('rogue-01')).toHaveLength(2);
  });

  // A key can itself contain "-v"; only the last one separates key from render version.
  it('splits on the last -v, not the first', () => {
    expect([...groupNames(pair('elf-vitality-v19-0.26.0')).keys()]).toEqual(['elf-vitality']);
  });

  // A capture writes the full bitmap and its thumb separately: a crash between the two leaves a half
  // pair that would render as a broken image if it were served.
  it('ignores a full bitmap with no thumb', () => {
    expect(groupNames(['lone-v19-0.26.0.png']).size).toBe(0);
  });

  it('ignores anything that is not a bitmap pair', () => {
    expect(groupNames(['notes.txt', 'stray.png']).size).toBe(0);
  });
});

describe('choosing which bitmap to serve', () => {
  const index = groupNames([...pair('a-v18-0.25.0'), ...pair('b-v19-0.26.0')]);

  it('serves the current version and asks for no forge', () => {
    expect(bestName(index, 'b', '19-0.26.0')).toEqual({ name: 'b-v19-0.26.0.png', current: true });
  });

  // The point of keeping old bitmaps: last release's artwork shows while this release re-forges.
  it('serves an older version but still asks for a forge', () => {
    expect(bestName(index, 'a', '19-0.26.0')).toEqual({ name: 'a-v18-0.25.0.png', current: false });
  });

  it('has nothing to serve for a card that was never forged', () => {
    expect(bestName(index, 'c', '19-0.26.0')).toEqual({ name: null, current: false });
  });
});
