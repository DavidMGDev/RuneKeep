import { campaignNote, countOn, EMPTY_CAMPAIGN_SETTINGS, isOptionOn, isStepOn, isStepVisible, mergeSettings, optionKey, setKeys, stepKey, syncSteps, toggleKey } from './campaign-settings';

const cs = (disabled: string[]) => ({ on: true, disabled });

describe('isOptionOn', () => {
  it('allows everything when there are no settings at all', () => {
    expect(isOptionOn(undefined, 'class', 'bard')).toBe(true);
  });

  it('allows everything when the author never turned settings on', () => {
    expect(isOptionOn({ on: false, disabled: [optionKey('class', 'bard')] }, 'class', 'bard')).toBe(true);
  });

  it('refuses what is turned off', () => {
    expect(isOptionOn(cs([optionKey('class', 'bard')]), 'class', 'bard')).toBe(false);
  });

  it('allows an option nobody has said anything about, which is how a new one arrives on', () => {
    expect(isOptionOn(cs([optionKey('class', 'bard')]), 'class', 'druid')).toBe(true);
  });

  it('does not confuse two decks that share an id', () => {
    expect(isOptionOn(cs([optionKey('class', 'x')]), 'ancestry', 'x')).toBe(true);
  });
});

describe('isStepOn / isStepVisible', () => {
  it('hides a step the DM turned off', () => {
    expect(isStepOn(cs([stepKey('community')]), 'community')).toBe(false);
  });

  it('hides a step with nothing left in it, because an empty carousel is a dead end', () => {
    expect(isStepVisible(cs([]), 'ancestry', 0)).toBe(false);
    expect(isStepVisible(cs([]), 'ancestry', 3)).toBe(true);
  });

  it('shows every step when no campaign is running', () => {
    expect(isStepVisible(undefined, 'ancestry', 2)).toBe(true);
  });
});

describe('mergeSettings', () => {
  it('is inert when nothing is on', () => {
    expect(mergeSettings([undefined, { on: false, disabled: ['class:bard'] }])).toEqual(EMPTY_CAMPAIGN_SETTINGS);
  });

  it('unions, so a second pack can never re-open what the first closed', () => {
    const out = mergeSettings([cs(['class:bard']), cs(['class:druid'])]);
    expect(out.disabled.sort()).toEqual(['class:bard', 'class:druid']);
    expect(out.on).toBe(true);
  });

  it('ignores an inactive pack entirely', () => {
    expect(mergeSettings([cs(['class:bard']), { on: false, disabled: ['class:druid'] }]).disabled).toEqual(['class:bard']);
  });

  it('does not repeat a restriction two packs share', () => {
    expect(mergeSettings([cs(['class:bard']), cs(['class:bard'])]).disabled).toEqual(['class:bard']);
  });
});

describe('setKeys', () => {
  it('disables a whole group', () => {
    expect(setKeys(cs([]), ['a', 'b'], false).disabled.sort()).toEqual(['a', 'b']);
  });

  it('enables a whole group', () => {
    expect(setKeys(cs(['a', 'b', 'c']), ['a', 'b'], true).disabled).toEqual(['c']);
  });

  it('is idempotent', () => {
    expect(setKeys(setKeys(cs([]), ['a'], false), ['a'], false).disabled).toEqual(['a']);
  });

  it('keeps the on flag', () => {
    expect(setKeys({ on: false, disabled: [] }, ['a'], false).on).toBe(false);
  });
});

describe('syncSteps', () => {
  const g = [{ deck: 'ancestry', keys: ['ancestry:a', 'ancestry:b'] }];

  it('turns a step off once its last option goes', () => {
    expect(syncSteps(cs(['ancestry:a', 'ancestry:b']), g).disabled).toContain(stepKey('ancestry'));
  });

  it('turns it back on the moment one returns', () => {
    expect(syncSteps(cs(['ancestry:a', stepKey('ancestry')]), g).disabled).not.toContain(stepKey('ancestry'));
  });

  it('says nothing about a group with no options at all', () => {
    expect(syncSteps(cs([stepKey('community')]), [{ deck: 'community', keys: [] }]).disabled).toContain(stepKey('community'));
  });
});

describe('toggleKey', () => {
  it('goes both ways', () => {
    const off = toggleKey(cs([]), 'a');
    expect(off.disabled).toEqual(['a']);
    expect(toggleKey(off, 'a').disabled).toEqual([]);
  });
});

describe('countOn', () => {
  it('counts what is still available', () => {
    expect(countOn(cs(['a']), ['a', 'b', 'c'])).toBe(2);
  });
});

describe('campaignNote', () => {
  it('says nothing when nothing limits creation', () => {
    expect(campaignNote([])).toBe('');
  });

  it('names one', () => {
    expect(campaignNote(['Ashfall'])).toBe('Creation is limited by Ashfall.');
  });

  it('names several', () => {
    expect(campaignNote(['Ashfall', 'Deepwater', 'Thorn'])).toBe('Creation is limited by Ashfall, Deepwater and Thorn.');
  });
});
