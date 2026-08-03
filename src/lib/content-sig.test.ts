import { contentSig } from './content-sig';

describe('contentSig', () => {
  it('is stable for the same content', () => {
    expect(contentSig('Title', 'body', '#a34f2b')).toBe(contentSig('Title', 'body', '#a34f2b'));
  });

  it('changes when a colour changes, which the old length-based key could not', () => {
    // Both are seven characters, which is why recolouring a card used to serve the old bitmap.
    expect(contentSig('Title', 'body', '#a34f2b')).not.toBe(contentSig('Title', 'body', '#2b4fa3'));
  });

  it('changes when a word is swapped for one of the same length', () => {
    expect(contentSig('T', 'a bow')).not.toBe(contentSig('T', 'a sow'));
  });

  it('separates its parts', () => {
    expect(contentSig('ab', 'c')).not.toBe(contentSig('a', 'bc'));
  });

  it('treats null and undefined as empty', () => {
    expect(contentSig('a', null, 'b')).toBe(contentSig('a', undefined, 'b'));
  });

  it('never contains a hyphen, so the cache can still split a filename on its last -v', () => {
    for (let i = 0; i < 200; i += 1) expect(contentSig(`card ${i}`, 'x'.repeat(i))).not.toContain('-');
  });
});
