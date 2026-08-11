import { type AdversaryCounter, canStep, commitStarts, counterMode, counterNote, detailCounters, isSpent, meaningfulCounters, newCounter, resetCounter, restartCountdowns, setStart, soleCounter, stepCounter } from './dm-counters';

const counter = (over: Partial<AdversaryCounter> = {}): AdversaryCounter => ({ ...newCounter('c1'), ...over });

describe('stepCounter', () => {
  it('moves a resource freely in both directions', () => {
    const c = counter({ kind: 'resource', start: 3, value: 3 });
    expect(stepCounter(c, 1).value).toBe(4);
    expect(stepCounter(c, -1).value).toBe(2);
  });

  it('stops a plain countdown at zero, because that is the end of it (v0.41.4)', () => {
    const c = counter({ kind: 'countdown', start: 4, value: 0 });
    expect(stepCounter(c, -1)).toBe(c);
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

  it('never lets a countdown be wound UP (v0.41.4, owner)', () => {
    // v0.41.3 allowed it. The owner's correction: "countdown type counters should just be to
    // decrease, they cannot increase their counter."
    const c = counter({ kind: 'countdown', start: 4, value: 4, loop: true });
    expect(stepCounter(c, 1)).toBe(c);
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

// ---------------------------------------------------------------- v0.41.4: a countdown only falls

describe('canStep', () => {
  it('lets a resource go either way', () => {
    const c = counter({ kind: 'resource', start: 3, value: 3 });
    expect(canStep(c, 1)).toBe(true);
    expect(canStep(c, -1)).toBe(true);
  });

  it('never lets a countdown be wound up', () => {
    expect(canStep(counter({ kind: 'countdown', start: 4, value: 2 }), 1)).toBe(false);
    expect(canStep(counter({ kind: 'countdown', start: 4, value: 2, loop: true }), 1)).toBe(false);
  });

  it('stops a spent countdown going any further down', () => {
    expect(canStep(counter({ kind: 'countdown', start: 4, value: 0 }), -1)).toBe(false);
  });

  it('lets a LOOPING countdown be pushed off the bottom, because that is its wrap', () => {
    expect(canStep(counter({ kind: 'countdown', start: 4, value: 0, loop: true }), -1)).toBe(true);
  });
});

describe('stepCounter, with the countdown rule', () => {
  it('refuses to move a countdown upwards', () => {
    const c = counter({ kind: 'countdown', start: 4, value: 2 });
    expect(stepCounter(c, 1)).toBe(c);
  });

  it('still wraps a looping one off the bottom', () => {
    expect(stepCounter(counter({ kind: 'countdown', start: 4, value: 0, loop: true }), -1).value).toBe(4);
  });
});

describe('isSpent', () => {
  it('is true for a non-looping countdown at zero', () => {
    expect(isSpent(counter({ kind: 'countdown', start: 4, value: 0 }))).toBe(true);
  });

  it('is never true for a looping one, because zero is where its wrap is reached from', () => {
    expect(isSpent(counter({ kind: 'countdown', start: 4, value: 0, loop: true }))).toBe(false);
  });

  it('is never true for a resource, however low it goes', () => {
    expect(isSpent(counter({ kind: 'resource', start: 4, value: -2 }))).toBe(false);
  });
});

describe('restartCountdowns', () => {
  it('winds every countdown back and leaves resources alone', () => {
    const out = restartCountdowns([
      counter({ id: 'a', kind: 'countdown', start: 4, value: 0 }),
      counter({ id: 'b', kind: 'resource', start: 3, value: 1 }),
    ])!;
    expect(out.map((c) => c.value)).toEqual([4, 1]);
  });

  it('has nothing to do with no counters', () => {
    expect(restartCountdowns(undefined)).toBeUndefined();
  });
});

describe('commitStarts', () => {
  it('moves a counter whose start was edited, even one already in play', () => {
    const before = [counter({ id: 'a', start: 4, value: 1 })];
    const after = [counter({ id: 'a', start: 6, value: 1 })];
    expect(commitStarts(before, after)[0].value).toBe(6);
  });

  it('leaves a counter whose start did not change', () => {
    const before = [counter({ id: 'a', start: 4, value: 1 })];
    const after = [counter({ id: 'a', start: 4, value: 1, name: 'Renamed' })];
    expect(commitStarts(before, after)[0].value).toBe(1);
  });

  it('leaves a brand new counter at whatever it was built with', () => {
    expect(commitStarts([], [counter({ id: 'new', start: 5, value: 5 })])[0].value).toBe(5);
  });
});
