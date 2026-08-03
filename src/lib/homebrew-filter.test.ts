import { hasHomebrew, keepSource } from './homebrew-filter';

const card = (contentType?: string) => ({ contentType });

describe('hasHomebrew', () => {
  it('finds homebrew filed under its own category', () => {
    expect(hasHomebrew('ancestry', [card('ancestry')])).toBe(true);
    expect(hasHomebrew('weapon', [card('weapon')])).toBe(true);
  });

  it('says no when the category has none, even with homebrew elsewhere', () => {
    expect(hasHomebrew('community', [card('ancestry'), card('weapon')])).toBe(false);
  });

  it('files loose and generic cards under Loot, the way both screens do', () => {
    expect(hasHomebrew('loot', [card('generic')])).toBe(true);
    expect(hasHomebrew('loot', [card('inventory')])).toBe(true);
    expect(hasHomebrew('consumable', [card('generic')])).toBe(false);
  });

  it('treats a card with no content type as generic', () => {
    expect(hasHomebrew('loot', [card(undefined)])).toBe(true);
    expect(hasHomebrew('domain', [card(undefined)])).toBe(false);
  });

  it('never offers the chip for a category nothing can be authored into', () => {
    expect(hasHomebrew('transformation', [card('generic'), card('class')])).toBe(false);
  });

  it('says no for an empty library', () => {
    expect(hasHomebrew('ancestry', [])).toBe(false);
  });
});

describe('keepSource', () => {
  // The case that motivated this: narrow Ancestry to homebrew, then switch to Community.
  const library = [card('ancestry')];

  it('drops a homebrew filter the new category cannot satisfy', () => {
    expect(keepSource('homebrew', 'community', library)).toBe('all');
  });

  it('keeps a homebrew filter the new category can satisfy', () => {
    expect(keepSource('homebrew', 'ancestry', library)).toBe('homebrew');
  });

  it('never takes an Official filter away, since every category has official content', () => {
    expect(keepSource('official', 'community', library)).toBe('official');
    expect(keepSource('official', 'transformation', [])).toBe('official');
  });

  it('leaves "show me both" alone', () => {
    expect(keepSource('all', 'community', library)).toBe('all');
  });
});
