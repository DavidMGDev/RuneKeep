import { fitFontSize, type Measured } from './fit-text';

/**
 * A stand-in for a real font: every glyph is 0.6 of the font size wide, lines wrap greedily, and a
 * line is exactly one font size tall. Enough to pin the SEARCH, which is all this module owns.
 */
const fakeMeasure = (text: string, width: number) => (size: number): Measured => {
  const per = size * 0.6;
  const words = text.split(' ');
  const rows: string[] = [];
  let row = words[0] ?? '';
  for (const w of words.slice(1)) {
    const candidate = `${row} ${w}`;
    if (candidate.length * per <= width) row = candidate;
    else {
      rows.push(row);
      row = w;
    }
  }
  if (row) rows.push(row);
  return { lines: rows.length, widest: Math.max(0, ...rows.map((r) => r.length * per)), height: rows.length * size };
};

const fit = (text: string, over: Partial<Parameters<typeof fitFontSize>[0]> = {}) =>
  fitFontSize({ width: 220, height: 58, maxLines: 2, minSize: 13, maxSize: 60, measure: fakeMeasure(text, over.width ?? 220), ...over });

describe('fitting a name to its box', () => {
  // The whole point of growing: a short name should read as a title, not as small text in a big box.
  it('grows a short name toward the maximum', () => {
    expect(fit('Ash')).toBeGreaterThan(40);
  });

  it('shrinks a long name so it stays inside', () => {
    expect(fit('Bartholomew Vanderquist the Third')).toBeLessThan(fit('Ash'));
  });

  it('never returns more than the maximum', () => {
    expect(fit('Ash', { maxSize: 30 })).toBeLessThanOrEqual(30);
  });

  // A name too long for any size still has to appear, clipped, rather than vanish.
  it('falls back to the minimum when nothing fits', () => {
    expect(fit('A'.repeat(400), { maxLines: 1 })).toBe(13);
  });

  it('returns a whole number of pixels', () => {
    expect(fit('Kestrel Vane') % 1).toBe(0);
  });

  it('allows more lines to hold a larger font', () => {
    const oneLine = fit('Kestrel Vane of the Hollow', { maxLines: 1 });
    const twoLines = fit('Kestrel Vane of the Hollow', { maxLines: 2 });
    expect(twoLines).toBeGreaterThanOrEqual(oneLine);
  });

  it('asks the measurer only a handful of times', () => {
    let calls = 0;
    const counted = (size: number) => {
      calls++;
      return fakeMeasure('Kestrel Vane', 220)(size);
    };
    fitFontSize({ width: 220, height: 58, maxLines: 2, minSize: 13, maxSize: 60, measure: counted });
    expect(calls).toBeLessThan(10); // a linear scan would be ~48
  });

  it('handles a degenerate range without looping', () => {
    expect(fit('Ash', { minSize: 20, maxSize: 20 })).toBe(20);
  });
});
