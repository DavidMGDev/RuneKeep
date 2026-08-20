import { type DeckKey } from './create-types';
import { DeckGlyph } from './deck-glyph';

/**
 * The regression (v0.43.2, owner): "the step that I created by creating a type card has no logo...
 * It's compressed and it's not the same size as the rest of the steps, breaking the UI."
 *
 * `DeckGlyph` is a switch over the deck key, and a key with no arm returns `undefined`. The tab then
 * draws a label with nothing above it and collapses, next to nine tabs holding a 20dp icon. The same
 * thing had already happened once, to the two characterize-only steps, which is why the fix carries a
 * comment and this carries a test.
 *
 * Called as a plain function rather than rendered: what is being asserted is that the switch has an
 * arm at all, and that needs no renderer.
 */
describe('every step the rail can show has a glyph', () => {
  const BUILT_IN: DeckKey[] = [
    'carry', 'level', 'transformation', 'class', 'subclass', 'ancestry', 'community',
    'domains', 'traits', 'experiences', 'weapons', 'armor', 'inventory',
  ];

  it.each(BUILT_IN)('draws one for %s', (deck) => {
    expect(DeckGlyph({ deck, color: '#FFFFFF' })).toBeTruthy();
  });

  it('draws one for a CUSTOM step, whatever the type id', () => {
    expect(DeckGlyph({ deck: 'custom:t1', color: '#FFFFFF' })).toBeTruthy();
    expect(DeckGlyph({ deck: 'custom:lc-9f3a-x2', color: '#FFFFFF' })).toBeTruthy();
  });
});
