import { fitText, wrapLines } from './fit-text';

// The weapon card's feature box, in design px: 230 wide less 16 each side, with what is left under
// the pinned title and the four pinned stat rows. Typeset at 8.5/12.5. Keep in step with
// `equipFeatureRoom(4)` in forged-card: 322 - 129 - 19 - 24 - 19 - (8 + 4*13 + 3*3) - 9.
const WEAPON = { width: 198, height: 53, base: 8.5, lineRatio: 12.5 / 8.5 };

// The card that made this exist. Its last word printed through the footer watermark.
const KATANA = 'Quick: When you make an attack, you can mark a Stress to target another creature within range.';

describe('wrapping', () => {
  it('breaks on words, not on the character count', () => {
    // 20 characters, so it fits a 20-wide line exactly, and needs a second at 19.
    expect(wrapLines('a short line another', 20)).toBe(1);
    expect(wrapLines('a short line another', 19)).toBe(2);
  });

  it('counts a word longer than the line as the lines it spans', () => {
    expect(wrapLines('supercalifragilistic', 10)).toBe(2);
  });

  it('honours explicit line breaks, blank ones included', () => {
    expect(wrapLines('one\ntwo', 40)).toBe(2);
    expect(wrapLines('one\n\ntwo', 40)).toBe(3);
  });

  it('says a single short line is one line', () => {
    expect(wrapLines('short', 40)).toBe(1);
  });
});

describe('fitting card text', () => {
  it('leaves text that already fits exactly as it was typeset', () => {
    // The rule the owner set: everything except the overlong cards must look untouched.
    const fit = fitText('Reloading: Mark a Stress to reload.', WEAPON);
    expect(fit.fontSize).toBe(WEAPON.base);
    expect(fit.lineHeight).toBe(12.5);
  });

  it('leaves the Katana alone, because the pinned rows gave it the room it needed', () => {
    // Its feature is three lines and always was. What overflowed on Android was the stat block above
    // it being ~21dp taller than the same block in a browser, which is fixed in the card itself.
    const fit = fitText(KATANA, WEAPON);
    expect(fit.lines).toBe(3);
    expect(fit.fontSize).toBe(WEAPON.base);
    expect(fit.lines * fit.lineHeight).toBeLessThanOrEqual(WEAPON.height);
  });

  it('shrinks a feature that is genuinely too long for the box', () => {
    const long = `${KATANA} On a critical success, mark an additional Stress to strike a third creature within the same range.`;
    const fit = fitText(long, WEAPON);
    expect(fit.fontSize).toBeLessThan(WEAPON.base);
    expect(fit.lines * fit.lineHeight).toBeLessThanOrEqual(WEAPON.height);
  });

  it('never returns a size that does not fit, however long the text', () => {
    const wall = Array.from({ length: 60 }, (_, i) => `sentence number ${i} of a very long feature`).join(' ');
    const fit = fitText(wall, WEAPON);
    expect(fit.fontSize).toBeGreaterThanOrEqual(6);
    expect(fit.fontSize).toBeLessThanOrEqual(WEAPON.base);
  });

  it('never grows text above the size the card was designed at', () => {
    const fit = fitText('Quick.', { ...WEAPON, height: 500 });
    expect(fit.fontSize).toBe(WEAPON.base);
  });

  it('has nothing to do with an empty feature', () => {
    expect(fitText('', WEAPON).lines).toBe(0);
    expect(fitText('   ', WEAPON).fontSize).toBe(WEAPON.base);
  });
});
