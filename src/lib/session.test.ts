import { addMembers, type MemberMaxes, type MemberVitals, newParty, togglePresent } from './party';
import {
  canEditMembers,
  cloneCombatant,
  combatantDelta,
  completeEncounter,
  deleteLogEntries,
  duplicateEncounter,
  editLogEntry,
  fell,
  formatStatLog,
  type LogEntry,
  memberDelta,
  memberVitals,
  moveEncounterToSession,
  moveLogEntry,
  newAdversary,
  newEncounter,
  newSession,
  nextIndex,
  recover,
  restartEncounter,
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

describe('fallen adversaries (PRD #9)', () => {
  it('reaching 0 HP falls with a half-max recover target', () => {
    const c = { ...newAdversary(0), hp: 3, maxHp: 10 };
    const downed = combatantDelta(c, 'hp', -3);
    expect(downed.hp).toBe(0);
    expect(downed.fallen).toBe(true);
    expect(downed.recoverHp).toBe(5); // ceil(10/2)
    expect(recover(downed).hp).toBe(5);
    expect(recover(downed).fallen).toBe(false);
  });
  it('the X (fell) preserves current HP as the recover target', () => {
    const c = { ...newAdversary(0), hp: 7, maxHp: 10 };
    const downed = fell(c);
    expect(downed.fallen).toBe(true);
    expect(downed.recoverHp).toBe(7);
    expect(recover(downed).hp).toBe(7);
  });
  it('healing above 0 clears the fallen flag', () => {
    const c = { ...newAdversary(0), hp: 0, maxHp: 10, fallen: true, recoverHp: 5 };
    expect(combatantDelta(c, 'hp', 2).fallen).toBe(false);
  });
  it('cloneCombatant resets to a fresh, upright, full-HP copy', () => {
    const c = { ...newAdversary(0), hp: 0, maxHp: 8, fallen: true, recoverHp: 4 };
    const copy = cloneCombatant(c);
    expect(copy.id).not.toBe(c.id);
    expect(copy.hp).toBe(8);
    expect(copy.fallen).toBe(false);
  });
});

describe('encounter reuse + restart', () => {
  it('duplicate makes a prepared copy with a new index and upright combatants', () => {
    const { enc } = setup();
    const withAdv: Encounter = { ...enc, adversaries: [{ ...newAdversary(0), hp: 0, maxHp: 6, fallen: true }] };
    const dup = duplicateEncounter(withAdv, 5);
    expect(dup.id).not.toBe(withAdv.id);
    expect(dup.index).toBe(5);
    expect(dup.status).toBe('prepared');
    expect(dup.adversaries[0].hp).toBe(6);
    expect(dup.adversaries[0].fallen).toBe(false);
    expect(dup.log).toEqual([]);
  });
  it('move re-homes an encounter to another session and reindexes', () => {
    const { enc } = setup();
    const moved = moveEncounterToSession(enc, 'other-session', 2);
    expect(moved.sessionId).toBe('other-session');
    expect(moved.index).toBe(2);
  });
  it('restart from encounter state rewinds the party global and revives adversaries', () => {
    const { party, session, enc } = setup();
    const active = setActive(session, enc).encounter;
    const r1 = memberDelta(active, party, 'a', 'hp', -3, M); // party a → 3
    const completed = completeEncounter(setActive(session, enc).session, { ...r1.encounter, adversaries: [{ ...newAdversary(0), hp: 0, maxHp: 8, fallen: true, recoverHp: 4 }] }, r1.party);
    // now the party keeps moving after completion
    const partyLater = { ...r1.party, global: { ...r1.party.global, a: { ...r1.party.global.a, hp: 1 } } };
    const restarted = restartEncounter(completed.session, completed.encounter, partyLater, 'encounter');
    expect(restarted.encounter.status).toBe('active');
    expect(restarted.encounter.adversaries[0].fallen).toBe(false); // revived
    expect(restarted.encounter.adversaries[0].hp).toBe(4);
    expect(restarted.party.global.a.hp).toBe(3); // rewound to the archived snapshot, not the later 1
  });
});

describe('log editing + reorder (PRD #5/#18)', () => {
  const log: LogEntry[] = [
    { id: 'n1', at: '', kind: 'note', text: 'first note' },
    { id: 's1', at: '', kind: 'stat', text: 'auto' },
    { id: 'n2', at: '', kind: 'note', text: 'second note' },
  ];
  it('edits an entry in place', () => {
    expect(editLogEntry(log, 'n2', 'edited').find((e) => e.id === 'n2')?.text).toBe('edited');
  });
  it('moves a note to an earlier index', () => {
    expect(moveLogEntry(log, 'n2', 0).map((e) => e.id)).toEqual(['n2', 'n1', 's1']);
  });
  it('deletes selected entries', () => {
    expect(deleteLogEntries(log, new Set(['s1'])).map((e) => e.id)).toEqual(['n1', 'n2']);
  });
});
