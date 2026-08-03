import { fitText, MIN_LINE_RATIO, wrapLines } from './fit-text';

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
    // v0.32.0: this used to assert a 6pt floor, which meant an absurd body was TRUNCATED to whatever
    // fitted at 6pt and the line count it returned was a fiction. It fits by construction now: the
    // block is never taller than the box, and no line is dropped to get there.
    const wall = Array.from({ length: 60 }, (_, i) => `sentence number ${i} of a very long feature`).join(' ');
    const fit = fitText(wall, WEAPON);
    expect(fit.fontSize).toBeLessThanOrEqual(WEAPON.base);
    expect(fit.lines * fit.lineHeight).toBeLessThanOrEqual(WEAPON.height + 0.5); // rounding slack
    expect(fit.lineHeight).toBeGreaterThanOrEqual(fit.fontSize); // glyphs never overlap
  });

  describe('newline-heavy bodies (v0.32.0)', () => {
    // The generic card body, with the leading allowed to tighten before the font gives way.
    const BODY = { width: 200, height: 122, base: 10.5, lineRatio: 14 / 10.5, minRatio: 1.05 };

    it('keeps every line of a description full of blank lines, inside the box', () => {
      const body = `Top line.${'\n'.repeat(9)}Bottom line.`;
      const fit = fitText(body, BODY);
      expect(fit.lines).toBe(10); // 2 lines of text + 8 blanks — none dropped
      expect(fit.lines * fit.lineHeight).toBeLessThanOrEqual(BODY.height + 0.5);
    });

    it('tightens the leading before it shrinks the type', () => {
      const twelve = Array.from({ length: 12 }, (_, i) => `Line ${i + 1}`).join('\n');
      const fit = fitText(twelve, BODY);
      expect(fit.lineHeight).toBeLessThan(fit.fontSize * BODY.lineRatio); // leading gave first
      expect(fit.fontSize).toBeGreaterThan(8); // and the type is still readable because of it
    });

    it('reports the TRUE line count even for an absurd body, so nothing is cut', () => {
      const absurd = `a${'\n\n'.repeat(15)}b`;
      const fit = fitText(absurd, BODY);
      expect(fit.lines).toBe(31);
      expect(fit.lines * fit.lineHeight).toBeLessThanOrEqual(BODY.height + 0.5);
    });
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

describe('the leading floor (v0.32.2)', () => {
  const BODY = { width: 200, height: 122, base: 10.5, lineRatio: 14 / 10.5 };

  it('never asks for tighter leading than the face can draw, whatever the caller passes', () => {
    // Archivo's own line box is 1.088 em. v0.32.0 let a caller ask for 1.05, which is under it, and
    // that is where renderers start disagreeing about how tall a line actually is.
    const fit = fitText(Array.from({ length: 18 }, (_, i) => `Line ${i}`).join('\n'), { ...BODY, minRatio: 0.5 });
    expect(fit.lineHeight / fit.fontSize).toBeGreaterThanOrEqual(MIN_LINE_RATIO - 0.001);
  });

  it('still fits the box with the floor in place', () => {
    for (const n of [4, 8, 14, 20]) {
      const body = Array.from({ length: n }, (_, i) => `Line ${i}`).join('\n');
      const fit = fitText(body, { ...BODY, minRatio: MIN_LINE_RATIO });
      expect(fit.lines * fit.lineHeight).toBeLessThanOrEqual(BODY.height + 0.5);
    }
  });
});
