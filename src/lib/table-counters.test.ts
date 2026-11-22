import { newCounter, stepCounter } from './dm-counters';
import { cleanDmTable } from './dm-table';
import { changeCombatant, type Encounter } from './session';
import { cleanCounters, cleanSpots, counterKey, counterOf, editCounter, freeSpot } from './table-counters';

describe('counters on the DM table', () => {
  const tide = { ...newCounter('ct-a'), name: 'Tide', kind: 'countdown' as const, loop: true, start: 4, value: 0 };

  it('names a campaign counter and a combatant counter apart', () => {
    expect(counterOf(counterKey('ct-a'))).toEqual({ id: 'ct-a' });
    expect(counterOf(counterKey('ct-a', 'c-9'))).toEqual({ id: 'ct-a', cid: 'c-9' });
  });

  it('keeps the rules of a counter when the table moves it', () => {
    expect(editCounter([tide], 'ct-a', (c) => stepCounter(c, -1))[0].value).toBe(4);
    expect(editCounter([tide], 'ct-a', (c) => stepCounter(c, 1))[0].value).toBe(0);
    expect(editCounter([tide], 'ct-a', () => null)).toEqual([]);
  });

  it('never drops one counter on another', () => {
    const spots: Record<string, ReturnType<typeof freeSpot>> = {};
    for (let i = 0; i < 12; i++) spots[i] = freeSpot(spots);
    expect(new Set(Object.values(spots).map((s) => `${s.x},${s.y}`)).size).toBe(12);
  });

  it('survives a stored table, and an old one that had none', () => {
    const t = cleanDmTable({ counters: [tide], spots: { 'ct-a': { x: 0.2, y: 3, k: 9 } } });
    expect(t.counters).toEqual([tide]);
    expect(t.spots['ct-a']).toEqual({ x: 0.2, y: 1, k: 2.2 });
    expect(cleanDmTable({})).toMatchObject({ counters: [], spots: {} });
    expect(cleanCounters([null, 3, { id: 'x|y', name: 'bad' }])).toEqual([]);
    expect(cleanSpots('no')).toEqual({});
  });

  it('finds a combatant on either side', () => {
    const who = (id: string) => ({ id, name: id, show: { hp: false, thresholds: false, stress: false, description: false } });
    const enc = { adversaries: [who('foe')], allies: [{ kind: 'member', charId: 'pc' }, { kind: 'npc', combatant: who('npc') }] } as unknown as Encounter;
    const named = (cid: string) => changeCombatant(enc, cid, (c) => ({ ...c, name: 'changed' }));
    expect(named('foe').adversaries[0].name).toBe('changed');
    expect(named('npc').allies[1]).toMatchObject({ combatant: { name: 'changed' } });
    expect(named('npc').adversaries[0].name).toBe('foe');
  });
});
