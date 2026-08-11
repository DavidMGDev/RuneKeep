import { type AdversaryCounter, counterMode, counterNote, detailCounters, meaningfulCounters, newCounter, resetCounter, setStart, soleCounter, stepCounter } from './dm-counters';

const counter = (over: Partial<AdversaryCounter> = {}): AdversaryCounter => ({ ...newCounter('c1'), ...over });

describe('stepCounter', () => {
  it('moves a resource freely in both directions', () => {
    const c = counter({ kind: 'resource', start: 3, value: 3 });
    expect(stepCounter(c, 1).value).toBe(4);
    expect(stepCounter(c, -1).value).toBe(2);
  });

  it('lets a plain countdown run past zero', () => {
    const c = counter({ kind: 'countdown', start: 4, value: 0 });
    expect(stepCounter(c, -1).value).toBe(-1);
  });

  it('sends a looping countdown back to its start when it goes below zero', () => {
    const c = counter({ kind: 'countdown', start: 4, value: 0, loop: true });
    expect(stepCounter(c, -1).value).toBe(4);
  });

  it('keeps counting down from the start once it has come round', () => {
    let c = counter({ kind: 'countdown', start: 4, value: 0, loop: true });
    c = stepCounter(c, -1);
    expect(stepCounter(c, -1).value).toBe(3);
  });

  it('lets a looping countdown be wound UP past its start', () => {
    // The owner's rule: "or upwards if the user so desires". Only the floor wraps.
    const c = counter({ kind: 'countdown', start: 4, value: 4, loop: true });
    expect(stepCounter(c, 1).value).toBe(5);
  });

  it('does not wrap a resource, whatever its loop flag says', () => {
    const c = counter({ kind: 'resource', start: 4, value: 0, loop: true });
    expect(stepCounter(c, -1).value).toBe(-1);
  });
});

describe('setStart', () => {
  it('carries an untouched counter to the new start', () => {
    expect(setStart(counter({ start: 0, value: 0 }), 4)).toMatchObject({ start: 4, value: 4 });
  });

  it('leaves a counter that is already in play where it is', () => {
    expect(setStart(counter({ start: 4, value: 2 }), 6)).toMatchObject({ start: 6, value: 2 });
  });
});

describe('resetCounter', () => {
  it('puts it back to its start', () => {
    expect(resetCounter(counter({ start: 6, value: -3 })).value).toBe(6);
  });
});

describe('counterMode', () => {
  it('is none with no counters and with none taken over', () => {
    expect(counterMode(undefined)).toBe('none');
    expect(counterMode([counter()])).toBe('none');
  });

  it('is a title when exactly one has taken over', () => {
    expect(counterMode([counter({ takeOver: true }), counter({ id: 'c2' })])).toBe('title');
  });

  it('is a list once two have', () => {
    expect(counterMode([counter({ takeOver: true }), counter({ id: 'c2', takeOver: true })])).toBe('list');
  });
});

describe('soleCounter and detailCounters', () => {
  const a = counter({ id: 'a', name: 'Charges', takeOver: true });
  const b = counter({ id: 'b', name: 'Rounds' });

  it('names the one that took over', () => {
    expect(soleCounter([a, b])?.id).toBe('a');
  });

  it('names nothing when two did', () => {
    expect(soleCounter([a, { ...b, takeOver: true }])).toBeNull();
  });

  it('leaves the rest to the stat block', () => {
    expect(detailCounters([a, b]).map((c) => c.id)).toEqual(['b']);
  });
});

describe('meaningfulCounters', () => {
  it('drops the ones that were added and never filled in', () => {
    const kept = meaningfulCounters([counter({ id: 'a', name: 'Charges' }), counter({ id: 'b' }), counter({ id: 'c', text: 'Rounds left' })]);
    expect(kept.map((c) => c.id)).toEqual(['a', 'c']);
  });
});

describe('counterNote', () => {
  it('says what kind it is, and where a looping one comes back to', () => {
    expect(counterNote(counter({ kind: 'resource' }))).toBe('Resource');
    expect(counterNote(counter({ kind: 'countdown' }))).toBe('Countdown');
    expect(counterNote(counter({ kind: 'countdown', loop: true, start: 4 }))).toBe('Countdown · restarts at 4');
  });
});
