import { advanceRemaining, applyAdvance, type CardFunction, canStepFunction, clampCounter, cycleFunction, cycleLabel, defaultState, functionSummary, functionsAt, meaningfulFunctions, newFunction, setTextValue, stateOf, stepFunction } from './card-functions';

const counter = (over: Partial<CardFunction> = {}): CardFunction => ({ ...newFunction('f1', 'counter'), ...over });
const cycle = (over: Partial<CardFunction> = {}): CardFunction => ({ ...newFunction('f2', 'cycle'), ...over });
const text = (over: Partial<CardFunction> = {}): CardFunction => ({ ...newFunction('f3', 'text'), ...over });

describe('defaultState', () => {
  it('starts a counter where the author said', () => {
    expect(defaultState(counter({ start: 3 }))).toEqual({ n: 3 });
  });

  it('holds a start above the maximum down to it, rather than showing an impossible number', () => {
    expect(defaultState(counter({ start: 9, max: 5 }))).toEqual({ n: 5 });
  });

  it('starts a cycle on the option the author chose', () => {
    expect(defaultState(cycle({ options: ['A', 'B', 'C'], startIndex: 2 }))).toEqual({ i: 2 });
  });

  it('wraps a start index the author put out of range', () => {
    expect(defaultState(cycle({ options: ['A', 'B'], startIndex: 5 }))).toEqual({ i: 1 });
  });

  it('starts a text field empty', () => {
    expect(defaultState(text())).toEqual({ s: '' });
  });

  it('is what an untouched card renders, so nothing has to be stored', () => {
    expect(stateOf(counter({ start: 2 }), undefined)).toEqual({ n: 2 });
  });
});

describe('clampCounter', () => {
  it('never goes below zero', () => {
    expect(clampCounter(counter(), -4)).toBe(0);
  });

  it('never passes a maximum that was set', () => {
    expect(clampCounter(counter({ max: 5 }), 9)).toBe(5);
  });

  it('has no ceiling when none was set', () => {
    expect(clampCounter(counter(), 999)).toBe(999);
  });
});

describe('stepFunction', () => {
  it('moves an ordinary counter both ways', () => {
    expect(stepFunction(counter({ start: 2 }), { n: 2 }, 1)).toEqual({ n: 3 });
    expect(stepFunction(counter({ start: 2 }), { n: 2 }, -1)).toEqual({ n: 1 });
  });

  it('stops at the maximum', () => {
    expect(stepFunction(counter({ max: 3 }), { n: 3 }, 1)).toEqual({ n: 3 });
  });

  it('stops at zero', () => {
    expect(stepFunction(counter(), { n: 0 }, -1)).toEqual({ n: 0 });
  });

  it('never lets a countdown be wound up, like the DM’s', () => {
    expect(canStepFunction(counter({ countdown: true, start: 4 }), { n: 2 }, 1)).toBe(false);
    expect(stepFunction(counter({ countdown: true, start: 4 }), { n: 2 }, 1)).toEqual({ n: 2 });
  });

  it('sends a restarting countdown back to its start off the bottom', () => {
    expect(stepFunction(counter({ countdown: true, loop: true, start: 4 }), { n: 0 }, -1)).toEqual({ n: 4 });
  });

  it('leaves a plain countdown at zero', () => {
    expect(stepFunction(counter({ countdown: true, start: 4 }), { n: 0 }, -1)).toEqual({ n: 0 });
  });
});

describe('cycleFunction', () => {
  it('walks its options', () => {
    const f = cycle({ options: ['Calm', 'Roused', 'Raging'] });
    expect(cycleFunction(f, { i: 0 })).toEqual({ i: 1 });
    expect(cycleFunction(f, { i: 1 })).toEqual({ i: 2 });
  });

  it('comes back round at the end', () => {
    expect(cycleFunction(cycle({ options: ['A', 'B'] }), { i: 1 })).toEqual({ i: 0 });
  });

  it('does nothing with no options, rather than dividing by zero', () => {
    expect(cycleFunction(cycle({ options: [] }), { i: 0 })).toEqual({ i: 0 });
  });

  it('reads out the option it is on', () => {
    expect(cycleLabel(cycle({ options: ['Calm', 'Raging'] }), { i: 1 })).toBe('Raging');
  });

  it('reads out a dash rather than nothing when the author gave no options', () => {
    expect(cycleLabel(cycle({ options: [] }), {})).toBe('—');
  });
});

describe('setTextValue', () => {
  it('writes what the player typed', () => {
    expect(setTextValue('the oath I swore')).toEqual({ s: 'the oath I swore' });
  });
});

describe('functionSummary', () => {
  it('says what an author configured', () => {
    expect(functionSummary(counter({ start: 2, max: 5 }))).toBe('Counter, 2, 5');
    expect(functionSummary(counter({ start: 2, min: 1, max: 5 }))).toBe('Counter, 2, 1 to 5');
    expect(functionSummary(counter({ countdown: true, loop: true, start: 3 }))).toBe('Countdown, 3, restarts');
    expect(functionSummary(text({ lines: 3 }))).toBe('Text, 3 lines');
    expect(functionSummary(cycle({ options: ['A', 'B', 'C'] }))).toBe('Cycle, 3 options');
  });
});

describe('meaningfulFunctions', () => {
  it('drops a cycle with nothing to cycle through', () => {
    expect(meaningfulFunctions([cycle({ options: ['', ' '] })])).toEqual([]);
  });

  it('keeps a counter and a text field, which need no configuration to work', () => {
    expect(meaningfulFunctions([counter(), text()])).toHaveLength(2);
  });
});

describe('functionsAt', () => {
  it('separates what sits above the body from what sits below', () => {
    const above = counter({ id: 'a', placement: 'above' });
    const below = text({ id: 'b', placement: 'below' });
    expect(functionsAt([above, below], 'above').map((f) => f.id)).toEqual(['a']);
    expect(functionsAt([above, below], 'below').map((f) => f.id)).toEqual(['b']);
  });
});

// ------------------------------------- v0.42.1: ranges, locking and level advancements ----------

describe('a counter with a RANGE (v0.42.1)', () => {
  it('never goes below its floor', () => {
    const c = counter({ min: 1, start: 2 });
    expect(stepFunction(c, { n: 1 }, -1)).toEqual({ n: 1 });
    expect(canStepFunction(c, { n: 1 }, -1)).toBe(false);
  });

  it('never goes above its ceiling', () => {
    expect(stepFunction(counter({ min: 1, max: 4 }), { n: 4 }, 1)).toEqual({ n: 4 });
  });

  it('holds a start outside the range inside it', () => {
    expect(defaultState(counter({ min: 2, max: 6, start: 0 }))).toEqual({ n: 2 });
  });
});

describe('a LOCKED element', () => {
  it('cannot be stepped', () => {
    const c = counter({ locked: true, start: 4 });
    expect(canStepFunction(c, { n: 4 }, -1)).toBe(false);
    expect(stepFunction(c, { n: 4 }, -1)).toEqual({ n: 4 });
  });

  it('cannot be cycled', () => {
    const f = cycle({ locked: true, options: ['A', 'B'] });
    expect(cycleFunction(f, { i: 0 })).toEqual({ i: 0 });
  });

  it('says so in its summary', () => {
    expect(functionSummary(counter({ locked: true }))).toContain('locked');
    expect(functionSummary(counter({ hidden: true }))).toContain('hidden until unlocked');
  });
});

describe('applyAdvance', () => {
  it('steps a die: the value and the whole range move together', () => {
    // The Brawler's Combo Die going d4 to d6, which is the case the owner named.
    const die = counter({ start: 4, min: 4, max: 4, locked: true });
    const out = applyAdvance(die, { n: 4 }, { kind: 'step', by: 2 });
    expect(out.fn).toMatchObject({ start: 6, min: 6, max: 6 });
    expect(out.state).toEqual({ n: 6 });
  });

  it('sets a counter outright', () => {
    const out = applyAdvance(counter({ start: 1, max: 9 }), { n: 1 }, { kind: 'set', value: 5 });
    expect(out.state).toEqual({ n: 5 });
  });

  it('sets a cycle to one of its options', () => {
    const out = applyAdvance(cycle({ options: ['A', 'B', 'C'] }), { i: 0 }, { kind: 'set', value: 2 });
    expect(out.state).toEqual({ i: 2 });
  });

  it('unlocks without disturbing the number', () => {
    const out = applyAdvance(counter({ start: 3, locked: true, hidden: true }), { n: 2 }, { kind: 'unlock' });
    expect(out.fn.locked).toBe(false);
    expect(out.fn.hidden).toBe(false);
    expect(out.state).toEqual({ n: 2 });
  });
});

describe('advanceRemaining', () => {
  const adv = { id: 'a', label: 'Raise the Combo Die', functionId: 'f1', tiers: [2, 3, 4], perTier: 1 as const, effect: { kind: 'step' as const, by: 2 } };

  it('is nothing at a tier it does not offer', () => {
    expect(advanceRemaining(adv, 1, 0)).toBe(0);
  });

  it('is once per tier, and only once', () => {
    expect(advanceRemaining(adv, 2, 0)).toBe(1);
    expect(advanceRemaining(adv, 2, 1)).toBe(0);
  });

  it('is twice when the author said twice', () => {
    expect(advanceRemaining({ ...adv, perTier: 2 }, 3, 1)).toBe(1);
  });

  it('is offered at every tier when the author named none', () => {
    expect(advanceRemaining({ ...adv, tiers: [] }, 1, 0)).toBe(1);
  });
});
