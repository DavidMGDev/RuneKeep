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

/**
 * v0.42.4 (owner): "Make sure that a campaign setting has error handling for when players have
 * different expansions, so that if I ban a class they dont have or I allow a ancestry they dont have
 * it doesn't break."
 *
 * The model already answers this, and these say so out loud, because the property is easy to lose:
 * a rule is a KEY, and a key naming content this install has never heard of matches nothing.
 */
describe('content the reader does not have', () => {
  it('a ban on a class that is not installed filters nothing and breaks nothing', () => {
    const rules = cs(['class:class-from-a-pack-i-lack']);
    const mine = ['class-bard', 'class-druid'];
    expect(mine.filter((id) => isOptionOn(rules, 'class', id))).toEqual(mine);
  });

  it('allowing content that is not installed shows nothing extra, because absent is the default', () => {
    const rules = cs(['class:class-bard']);
    expect(isOptionOn(rules, 'ancestry', 'an-ancestry-i-do-not-have')).toBe(true);
  });

  it('KEEPS a rule about content nobody has, so installing the pack later brings it back', () => {
    const rules = cs(['class:from-a-future-pack']);
    const round = JSON.parse(JSON.stringify(rules));
    expect(round.disabled).toContain('class:from-a-future-pack');
    expect(isOptionOn(round, 'class', 'from-a-future-pack')).toBe(false);
  });

  it('a step turned off is still off even when nothing it held is installed', () => {
    expect(isStepOn(cs([stepKey('community')]), 'community')).toBe(false);
  });
});

describe('setKeys as toggle all (v0.42.4)', () => {
  const keys = ['a', 'b', 'c'];

  it('clears a step that still has something available', () => {
    expect(setKeys(cs(['a']), keys, false).disabled.sort()).toEqual(keys);
  });

  it('restores a step that has nothing left', () => {
    expect(setKeys(cs(keys), keys, true).disabled).toEqual([]);
  });
});
