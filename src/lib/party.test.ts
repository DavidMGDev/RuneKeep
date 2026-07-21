import { addMembers, applyVitalDelta, type MemberMaxes, type MemberVitals, newParty, presentMemberIds, removeMember, setVital, togglePresent } from './party';

const M: MemberMaxes = { maxHp: 6, stressMax: 6, hopeMax: 6, armorMax: 3 };
const V: MemberVitals = { hp: 6, stress: 0, hope: 2, armor: 3 };

describe('party vitals', () => {
  it('clamps a delta to [0, max]', () => {
    expect(applyVitalDelta(V, 'hp', -10, M).hp).toBe(0);
    expect(applyVitalDelta(V, 'hp', +5, M).hp).toBe(6);
    expect(applyVitalDelta(V, 'stress', +2, M).stress).toBe(2);
    expect(applyVitalDelta(V, 'armor', +9, M).armor).toBe(3);
  });
  it('sets an exact value, clamped', () => {
    expect(setVital(V, 'hope', 99, M).hope).toBe(6);
    expect(setVital(V, 'hope', -1, M).hope).toBe(0);
    expect(setVital(V, 'hp', 4, M).hp).toBe(4);
  });
});

describe('party membership', () => {
  it('adds members once and seeds present + global', () => {
    let p = newParty('The Bold');
    p = addMembers(p, [{ charId: 'a', vitals: V }, { charId: 'b', vitals: V }]);
    p = addMembers(p, [{ charId: 'a', vitals: { ...V, hp: 1 } }]); // dup ignored, vitals not overwritten
    expect(p.memberIds).toEqual(['a', 'b']);
    expect(p.global.a.hp).toBe(6);
    expect(presentMemberIds(p)).toEqual(['a', 'b']);
  });
  it('present toggle drops a member from the default ally set', () => {
    let p = addMembers(newParty('x'), [{ charId: 'a', vitals: V }, { charId: 'b', vitals: V }]);
    p = togglePresent(p, 'b');
    expect(presentMemberIds(p)).toEqual(['a']);
  });
  it('removing a member clears its id, present and global', () => {
    let p = addMembers(newParty('x'), [{ charId: 'a', vitals: V }, { charId: 'b', vitals: V }]);
    p = removeMember(p, 'a');
    expect(p.memberIds).toEqual(['b']);
    expect(p.global.a).toBeUndefined();
    expect(p.present.a).toBeUndefined();
  });
});
