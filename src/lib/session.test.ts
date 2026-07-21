import { addMembers, type MemberMaxes, type MemberVitals, newParty, togglePresent } from './party';
import {
  canEditMembers,
  combatantDelta,
  completeEncounter,
  formatStatLog,
  memberDelta,
  memberVitals,
  newAdversary,
  newEncounter,
  newSession,
  nextIndex,
  setActive,
  sortedEncounters,
  type Encounter,
} from './session';

const M: MemberMaxes = { maxHp: 6, stressMax: 6, hopeMax: 6, armorMax: 3 };
const V: MemberVitals = { hp: 6, stress: 0, hope: 2, armor: 3 };

function setup() {
  let party = addMembers(newParty('P'), [{ charId: 'a', vitals: { ...V } }, { charId: 'b', vitals: { ...V } }]);
  party = togglePresent(party, 'b'); // b absent
  const session = newSession(party.id, 'S');
  const enc = newEncounter(session, party, nextIndex([]));
  return { party, session, enc };
}

describe('encounter creation', () => {
  it('numbers from existing count + 1', () => {
    expect(nextIndex([])).toBe(1);
    expect(nextIndex([{} as Encounter, {} as Encounter])).toBe(3);
  });
  it('auto-adds only present members as allies', () => {
    const { enc } = setup();
    expect(enc.allies).toEqual([{ kind: 'member', charId: 'a' }]);
    expect(enc.name).toBe('Encounter #1');
    expect(enc.status).toBe('prepared');
  });
  it('names adversaries Adversary #X', () => {
    expect(newAdversary(0).name).toBe('Adversary #1');
    expect(newAdversary(3).name).toBe('Adversary #4');
  });
});

describe('global vs local + edit gating', () => {
  it('a prepared encounter cannot write global (PRD #35)', () => {
    const { party, enc } = setup();
    expect(canEditMembers(enc)).toBe(false);
    const r = memberDelta(enc, party, 'a', 'hp', -2, M);
    expect(r.party.global.a.hp).toBe(6); // unchanged
  });
  it('an active synced encounter writes the party global', () => {
    const { party, session, enc } = setup();
    const active = setActive(session, enc).encounter;
    const r = memberDelta(active, party, 'a', 'hp', -2, M);
    expect(r.party.global.a.hp).toBe(4);
    expect(memberVitals(active, r.party, 'a')?.hp).toBe(4);
  });
  it('a non-synced encounter keeps local vitals and leaves global intact', () => {
    const { party, session, enc } = setup();
    const active: Encounter = { ...setActive(session, enc).encounter, options: { globalSync: false, autoLog: true } };
    const r = memberDelta(active, party, 'a', 'hp', -3, M);
    expect(r.party.global.a.hp).toBe(6); // global untouched
    expect(r.encounter.localVitals?.a.hp).toBe(3);
    expect(memberVitals(r.encounter, r.party, 'a')?.hp).toBe(3);
  });
});

describe('completion archives party state (PRD #36)', () => {
  it('freezes current global and clears active, leaving live global to carry forward', () => {
    const { party, session, enc } = setup();
    const { session: s2, encounter: active } = setActive(session, enc);
    const r = memberDelta(active, party, 'a', 'hp', -2, M); // a now at 4
    const done = completeEncounter(s2, r.encounter, r.party);
    expect(done.encounter.status).toBe('completed');
    expect(done.encounter.archivedGlobal?.a.hp).toBe(4); // snapshot
    expect(done.session.activeEncounterId).toBeUndefined();
    expect(r.party.global.a.hp).toBe(4); // party carries forward untouched
  });
});

describe('combatants + log', () => {
  it('clamps combatant hp to its own max', () => {
    const c = newAdversary(0); // maxHp 10, hp 0
    expect(combatantDelta(c, 'hp', 4).hp).toBe(4);
    expect(combatantDelta(c, 'hp', -1).hp).toBe(0);
    expect(combatantDelta({ ...c, hp: 8 }, 'hp', 5).hp).toBe(10);
  });
  it('formats a stat log line with side, name and resulting value', () => {
    expect(formatStatLog('Player', 'Aria', 'hp', 6, 4)).toContain('Aria');
    expect(formatStatLog('Player', 'Aria', 'hp', 6, 4)).toContain('**4**');
    expect(formatStatLog('Adversary', 'Ogre', 'stress', 0, 1)).toContain('Stress');
  });
  it('pins the active encounter on top, rest newest-first', () => {
    const encs: Encounter[] = [
      { id: 'e1', index: 1 } as Encounter,
      { id: 'e2', index: 2 } as Encounter,
      { id: 'e3', index: 3 } as Encounter,
    ];
    expect(sortedEncounters(encs, 'e1').map((e) => e.id)).toEqual(['e1', 'e3', 'e2']);
    expect(sortedEncounters(encs, undefined).map((e) => e.id)).toEqual(['e3', 'e2', 'e1']);
  });
});
