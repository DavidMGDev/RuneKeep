import { fitText, MIN_LINE_RATIO, wrapLines, fitTitle, titleCharRatio } from './fit-text';

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

describe('a card title, fitted into a fixed band', () => {
  // The generic forged card's geometry: 200dp of usable width, a 21dp band, designed at 17pt.
  const W = 200;
  const BAND = 21;
  const BASE = 17;
  const t = (s: string) => fitTitle(s, W, BAND, BASE);

  it('leaves a title that already fits exactly as it was', () => {
    const f = t('Cleave');
    expect(f.fontSize).toBe(BASE);
    expect(f.lines).toBe(1);
  });

  it('shrinks a slightly long title onto ONE line', () => {
    const f = t('Rusted Longsword of Ash');
    expect(f.lines).toBe(1);
    expect(f.fontSize).toBeLessThan(BASE);
  });

  it('takes two readable lines over one unreadable one', () => {
    // Stepping down finds the largest size that fits the BAND, and two lines at 9pt fits it long
    // before one line at 7pt would. Legibility is the point: a title nobody can read is not a title.
    const f = t('The Everburning Blade of the Fallen King');
    expect(f.lines).toBe(2);
    expect(f.fontSize).toBeGreaterThan(8);
    expect(f.lines * f.lineHeight).toBeLessThanOrEqual(BAND);
  });

  it('never asks for a line wider than the card, which is what cut titles off with an ellipsis', () => {
    // The regression: titles were measured with the BODY's glyph width, so a 22 character title was
    // called one line at full size when about 17 is the truth, and the overflow was truncated.
    const TITLE_RATIO = 0.72;
    for (const s of ['Cleave', 'Rusted Longsword', 'A Story About The Long Road Home', 'The Everburning Blade of the Fallen King']) {
      const f = t(s);
      const longest = Math.max(...s.split(' ').map((w) => w.length));
      const perLine = W / (f.fontSize * TITLE_RATIO);
      expect(perLine).toBeGreaterThanOrEqual(longest); // no word is wider than its line
      expect(s.length / f.lines).toBeLessThanOrEqual(perLine + 1);
    }
  });

  it('allows two lines only once they fit the same band', () => {
    const f = t('The Everburning Blade of the Fallen King of the Withered Marches and Beyond');
    expect(f.lines).toBe(2);
    expect(f.lines * f.lineHeight).toBeLessThanOrEqual(BAND);
  });

  it('never lets the band grow, whatever the title', () => {
    for (const s of ['A', 'Riposte', 'A '.repeat(60), 'Supercalifragilisticexpialidocious'.repeat(3)]) {
      const f = t(s);
      expect(f.lines * f.lineHeight).toBeLessThanOrEqual(BAND + 0.01);
    }
  });

  it('holds the same rule at the equipment cards’ smaller band', () => {
    const f = fitTitle('Improvised Greatsword of Uncommon Length', 198, 19, 15);
    expect(f.lines * f.lineHeight).toBeLessThanOrEqual(19.01);
  });
});

describe('the owner’s three titles (v0.36.3)', () => {
  // "Not strong enough" was cut off while "Not strong enough yet", which is LONGER, was fine. An
  // average glyph width cannot produce that; the letters can, which is what found the bug.
  const W = 200;
  const BAND = 21;
  const BASE = 17;
  const drawn = (s: string) => {
    const f = fitTitle(s, W, BAND, BASE);
    // The width the phone will actually paint, from the same per-letter table.
    const em = titleCharRatio(s, 0.3, BASE) / 1.06; // undo the safety bias to get the true measure
    return { f, perLine: W / (f.fontSize * em) };
  };

  for (const title of ['Not strong enough', 'Not strong enough yet', 'Not strong enough today guys', 'Bladedance Jester', 'WWW MMM WWW']) {
    it(`fits "${title}" without cutting it`, () => {
      const { f, perLine } = drawn(title);
      const longestLine = Math.ceil(title.length / f.lines);
      expect(longestLine).toBeLessThanOrEqual(Math.floor(perLine) + 1);
      expect(f.lines * f.lineHeight).toBeLessThanOrEqual(BAND + 0.01);
    });
  }

  it('measures a wide title as wider than a narrow one of the same length', () => {
    expect(titleCharRatio('WWWWWW')).toBeGreaterThan(titleCharRatio('IIIIII'));
  });

  it('keeps a short narrow title at full size', () => {
    expect(fitTitle('Ill Will', W, BAND, BASE).fontSize).toBe(BASE);
  });
});
