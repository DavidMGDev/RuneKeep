import { canSkipClass, carriesThresholds, carryItems, clampLevel, holdEffects, isGenericName, keptItems, keptLevel, levelForStatBlock, type StatBlockLike } from './characterize';

const WRAITH: StatBlockLike = {
  name: 'Bramble Wraith',
  tier: 2,
  difficulty: 15,
  role: 'Bruiser',
  maxHp: 8,
  maxStress: 4,
  thresholds: { major: 8, severe: 14 },
  atkMod: '+2',
  attack: { name: 'Rusted Blade', range: 'Melee', damage: '1d10+3' },
  damageType: 'Physical',
  motives: 'Ambush, drag away',
  experience: 'Tracker +2',
  description: 'A knot of thorns wearing a dead knight.',
  features: [
    { name: 'Cleave', kind: 'Action', text: 'Hit everything in Melee range.' },
    { name: 'Riposte', kind: 'Reaction', text: 'When missed, deal 1d6.' },
    { name: '', kind: 'Passive', text: '' },
  ],
};

describe('what level a stat block becomes', () => {
  it('lands a typical adversary in the middle of its tier’s band', () => {
    expect(levelForStatBlock(1, 11)).toBe(1);
    expect(levelForStatBlock(2, 14)).toBe(3);
    expect(levelForStatBlock(3, 16)).toBe(6);
    expect(levelForStatBlock(4, 18)).toBe(9);
  });

  it('moves a hard adversary up inside its band, never past it', () => {
    expect(levelForStatBlock(2, 16)).toBe(4);
    expect(levelForStatBlock(2, 24)).toBe(4); // still capped at the band's top
    expect(levelForStatBlock(4, 40)).toBe(10);
  });

  it('moves an easy one down, never below its band', () => {
    expect(levelForStatBlock(2, 12)).toBe(2);
    expect(levelForStatBlock(3, 2)).toBe(5);
    expect(levelForStatBlock(4, 0)).toBe(8);
  });

  it('treats a stat block with no tier as level 1', () => {
    expect(levelForStatBlock(undefined, 20)).toBe(1);
  });

  it('uses the tier alone when there is no difficulty', () => {
    expect(levelForStatBlock(3, undefined)).toBe(6);
  });

  it('clamps whatever the stepper asks for', () => {
    expect(clampLevel(0)).toBe(1);
    expect(clampLevel(99)).toBe(10);
    expect(clampLevel(4)).toBe(4);
  });
});

describe('what a stat block hands over', () => {
  const items = carryItems(WRAITH);

  it('leads with the ones that change the numbers', () => {
    expect(items.slice(0, 4).map((i) => i.kind)).toEqual(['level', 'thresholds', 'vitals', 'evasion']);
  });

  it('carries the level it worked out', () => {
    expect(items.find((i) => i.kind === 'level')?.level).toBe(3);
  });

  it('makes a weapon card out of the standard attack, damage and all', () => {
    const w = items.find((i) => i.kind === 'weapon');
    expect(w?.title).toBe('Rusted Blade');
    expect(w?.text).toContain('1d10+3 physical');
    expect(w?.text).toContain('Melee');
  });

  it('makes one card per feature and labels it by what it is', () => {
    const f = items.filter((i) => i.kind === 'feature');
    expect(f.map((i) => i.title)).toEqual(['Cleave', 'Riposte']); // the blank one is not a feature
    expect(f.map((i) => i.cardLabel)).toEqual(['Action', 'Reaction']);
  });

  it('keeps each feature description, which is the point of the card', () => {
    expect(items.find((i) => i.title === 'Riposte')?.text).toBe('When missed, deal 1d6.');
  });

  it('gathers everything with nowhere else to go onto one stat block card', () => {
    const s = items.find((i) => i.kind === 'statblock');
    expect(s?.text).toContain('Ambush, drag away');
    expect(s?.text).toContain('Tracker +2');
    expect(s?.text).toContain('Bruiser');
  });

  it('offers nothing it does not have', () => {
    const bare = carryItems({ name: 'Rat' });
    expect(bare.map((i) => i.kind)).toEqual(['level']); // no thresholds, vitals, evasion, attack or features
  });

  it('gives every item a stable id, so greying one out survives a rebuild', () => {
    expect(carryItems(WRAITH).map((i) => i.id)).toEqual(items.map((i) => i.id));
    expect(new Set(items.map((i) => i.id)).size).toBe(items.length);
  });
});

describe('greying an item out', () => {
  const items = carryItems(WRAITH);

  it('drops it entirely', () => {
    const kept = keptItems(items, new Set(['carry-weapon', 'carry-feature-0']));
    expect(kept.map((i) => i.title)).not.toContain('Rusted Blade');
    expect(kept.map((i) => i.title)).not.toContain('Cleave');
    expect(kept.map((i) => i.title)).toContain('Riposte');
  });

  it('sends the character back to level 1 when the level card goes', () => {
    expect(keptLevel(items, new Set())).toBe(3);
    expect(keptLevel(items, new Set(['carry-level']))).toBe(1);
  });
});

describe('holding the stat block’s numbers', () => {
  const items = carryItems(WRAITH);
  const have = { majorThreshold: 5, severeThreshold: 10, maxHp: 6, stressMax: 6, evasion: 10 };

  it('writes exactly the difference, so the sheet reads what the stat block said', () => {
    const e = holdEffects(items, new Set(), have);
    expect(e).toContainEqual({ target: 'majorThreshold', delta: 3, mode: 'bonus', note: 'Carried from the stat block' });
    expect(e).toContainEqual({ target: 'severeThreshold', delta: 4, mode: 'bonus', note: 'Carried from the stat block' });
    expect(e).toContainEqual({ target: 'maxHp', delta: 2, mode: 'bonus', note: 'Carried from the stat block' });
  });

  it('writes nothing when the sheet already agrees', () => {
    const e = holdEffects(items, new Set(), { majorThreshold: 8, severeThreshold: 14, maxHp: 8, stressMax: 4, evasion: 15 });
    expect(e).toEqual([]);
  });

  it('writes nothing for an item the DM greyed out', () => {
    const e = holdEffects(items, new Set(['carry-thresholds', 'carry-vitals', 'carry-evasion']), have);
    expect(e).toEqual([]);
  });

  it('knows when to warn about armor', () => {
    expect(carriesThresholds(items, new Set())).toBe(true);
    expect(carriesThresholds(items, new Set(['carry-thresholds']))).toBe(false);
    expect(carriesThresholds(carryItems({ name: 'Rat' }), new Set())).toBe(false);
  });
});

describe('difficulty becomes Evasion', () => {
  const items = carryItems(WRAITH);

  it('carries the difficulty across as the Evasion to hit', () => {
    expect(items.find((i) => i.kind === 'evasion')?.evasion).toBe(15);
  });

  it('makes up the difference against whatever the class gives', () => {
    // A Bard starts on 10 Evasion; a difficulty 15 adversary must still read 15.
    const e = holdEffects(items, new Set(), { majorThreshold: 8, severeThreshold: 14, maxHp: 8, stressMax: 4, evasion: 10 });
    expect(e).toContainEqual({ target: 'evasion', delta: 5, mode: 'bonus', note: 'Carried from the stat block' });
  });
});

describe('when the class step can be skipped', () => {
  it('lets it go once hit points AND evasion are both carried', () => {
    expect(canSkipClass(carryItems(WRAITH), new Set())).toBe(true);
  });

  it('puts the class back the moment either is left behind', () => {
    const items = carryItems(WRAITH);
    expect(canSkipClass(items, new Set(['carry-evasion']))).toBe(false);
    expect(canSkipClass(items, new Set(['carry-vitals']))).toBe(false);
  });

  it('never lets a bare stat block skip it', () => {
    expect(canSkipClass(carryItems({ name: 'Rat' }), new Set())).toBe(false);
  });
});

describe('a name the app made up', () => {
  it('knows a placeholder when it sees one', () => {
    for (const n of ['Adversary #3', 'adversary 12', 'NPC', 'Ally #1', 'Combatant']) expect(isGenericName(n)).toBe(true);
  });

  it('leaves a real name alone', () => {
    for (const n of ['Bramble Wraith', 'Acid Burrower', 'Ser Adversary of Vale', 'Npcorax']) expect(isGenericName(n)).toBe(false);
  });
});

describe('the weapon card', () => {
  const w = carryItems(WRAITH).find((i) => i.kind === 'weapon');

  it('puts every stat on its own row', () => {
    expect(w?.text.split('\n')).toEqual(['- **Range:** Melee', '- **Damage:** 1d10+3 physical', '- **Attack:** +2']);
  });

  it('does not say the damage type twice', () => {
    const abbreviated = carryItems({ ...WRAITH, attack: { name: 'Claws', range: 'Very Close', damage: '1d12+2 phy' } });
    expect(abbreviated.find((i) => i.kind === 'weapon')?.text).toContain('- **Damage:** 1d12+2 phy\n');
  });
});
