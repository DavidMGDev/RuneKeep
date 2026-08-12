import { type MarkCycle, pressMark, stripMark, toggleBullet, wordRangeAt } from './markdown-marks';

const cursor = (n: number) => ({ start: n, end: n });

describe('wordRangeAt', () => {
  it('finds the word the cursor is inside', () => {
    expect(wordRangeAt('mark a Stress', 7)).toEqual({ start: 7, end: 13 });
  });

  it('claims the word the cursor sits just after, which is where typing leaves it', () => {
    expect(wordRangeAt('mark', 4)).toEqual({ start: 0, end: 4 });
  });

  it('returns an empty range in whitespace', () => {
    const r = wordRangeAt('a  b', 2);
    expect(r.end).toBe(r.start);
  });

  it('clamps a cursor past the end', () => {
    expect(wordRangeAt('ab', 99)).toEqual({ start: 0, end: 2 });
  });
});

describe('stripMark', () => {
  it('removes bold', () => {
    expect(stripMark('a **b** c', '**')).toBe('a b c');
  });

  it('removes italic without leaving half a bold behind', () => {
    expect(stripMark('**a** *b*', '*')).toBe('a b');
  });
});

describe('pressMark', () => {
  const press = (text: string, at: number, mark: '**' | '*', cycle?: MarkCycle) => pressMark(text, cursor(at), mark, cycle);

  it('bolds the word under the cursor on the first press', () => {
    expect(press('mark a Stress', 7, '**').text).toBe('mark a **Stress**');
  });

  it('honours a real selection when there is one', () => {
    expect(pressMark('mark a Stress', { start: 0, end: 4 }, '**', undefined).text).toBe('**mark** a Stress');
  });

  it('bolds the whole section on the second press, without doubling the markers', () => {
    const one = press('mark a Stress', 7, '**');
    expect(pressMark(one.text, cursor(7), '**', one.cycle).text).toBe('**mark a Stress**');
  });

  it('clears every mark on the third press', () => {
    const one = press('mark a Stress', 7, '**');
    const two = pressMark(one.text, cursor(7), '**', one.cycle);
    expect(pressMark(two.text, cursor(7), '**', two.cycle).text).toBe('mark a Stress');
  });

  it('starts over on the fourth', () => {
    let r = press('mark a Stress', 7, '**');
    for (let i = 0; i < 3; i++) r = pressMark(r.text, cursor(7), '**', r.cycle);
    expect(r.text).toBe('mark a **Stress**');
  });

  it('starts a new cycle when the author typed in between, which drops the cycle', () => {
    const one = press('mark a Stress', 7, '**');
    expect(press(`${one.text} now`, 7, '**').text).toContain('****');
  });

  it('does not carry a bold cycle into an italic press: italic starts its own', () => {
    const one = press('mark a Stress', 7, '**');
    const two = pressMark(one.text, cursor(7), '*', one.cycle);
    expect(two.text).toBe('mark a ***Stress***');
    expect(two.cycle.step).toBe(1);
  });

  it('italics work the same way', () => {
    expect(press('a word', 2, '*').text).toBe('a *word*');
  });

  it('leaves the text alone when the cursor is in whitespace and nothing is selected', () => {
    expect(press('a  b', 2, '**').text).toBe('a  b');
  });

  it('is reversible: three presses return the original', () => {
    const start = 'mark a **Stress** now';
    let r = pressMark(start, cursor(7), '**', undefined);
    r = pressMark(r.text, cursor(7), '**', r.cycle);
    r = pressMark(r.text, cursor(7), '**', r.cycle);
    expect(r.text).toBe('mark a Stress now');
  });
});

describe('toggleBullet', () => {
  it('adds a bullet to the line the cursor is in', () => {
    expect(toggleBullet('one\ntwo', 5)).toBe('one\n- two');
  });

  it('takes it off again', () => {
    expect(toggleBullet('one\n- two', 7)).toBe('one\ntwo');
  });

  it('works on the first line', () => {
    expect(toggleBullet('one', 1)).toBe('- one');
  });
});
