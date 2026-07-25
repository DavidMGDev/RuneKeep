import { BASE_ADVERSARIES } from '@/data/adversaries';
import { VOID_ADVERSARIES } from '@/data/void-adversaries';
import { addTemplate, baseToCombatant, removeTemplates } from './adversary-library';
import { newAdversary } from './session';

describe('The Hope and Fear roster (v0.21.0 item 7)', () => {
  it('has the full Hope and Fear adversary roster with unique ids and no overlap with the base roster', () => {
    expect(VOID_ADVERSARIES).toHaveLength(135);
    const ids = new Set(VOID_ADVERSARIES.map((a) => a.id));
    expect(ids.size).toBe(VOID_ADVERSARIES.length);
    const baseIds = new Set(BASE_ADVERSARIES.map((a) => a.id));
    expect(VOID_ADVERSARIES.every((a) => !baseIds.has(a.id))).toBe(true);
    expect(VOID_ADVERSARIES.every((a) => a.id.startsWith('void-'))).toBe(true);
  });
  it('carries the Evolution feature kind (Mountain Troll)', () => {
    const troll = VOID_ADVERSARIES.find((a) => a.name === 'Mountain Troll');
    expect(troll?.features.some((f) => f.kind === 'Evolution')).toBe(true);
  });
});

describe('base adversary roster (v0.17.0)', () => {
  it('has the full SRD roster with unique ids and required fields', () => {
    expect(BASE_ADVERSARIES.length).toBeGreaterThan(100);
    const ids = new Set(BASE_ADVERSARIES.map((a) => a.id));
    expect(ids.size).toBe(BASE_ADVERSARIES.length); // no duplicate ids
    for (const a of BASE_ADVERSARIES) {
      expect(a.name.length).toBeGreaterThan(0);
      expect([1, 2, 3, 4]).toContain(a.tier);
      expect(a.hp).toBeGreaterThanOrEqual(0);
    }
  });
  it('baseToCombatant makes a fresh full-HP instance carrying the stat block', () => {
    const b = BASE_ADVERSARIES.find((a) => a.thresholds.includes('/'))!;
    const c = baseToCombatant(b);
    expect(c.id).toMatch(/^ad-/);
    expect(c.hp).toBe(b.hp);
    expect(c.maxHp).toBe(b.hp);
    expect(c.fallen).toBeFalsy();
    expect(c.role).toBe(b.role);
    expect(c.baseGameId).toBe(b.id);
    expect(c.thresholds?.major).toBeGreaterThan(0);
    expect(c.features).toEqual(b.features);
  });
  it('baseToCombatant handles "None" thresholds (minions)', () => {
    const b = BASE_ADVERSARIES.find((a) => a.thresholds === 'None');
    if (b) {
      const c = baseToCombatant(b);
      expect(c.thresholds).toEqual({ major: 0, severe: 0 });
      expect(c.show.thresholds).toBe(false);
    }
  });
});

describe('adversary library', () => {
  it('saves a template as a fresh, upright, full-HP copy', () => {
    const c = { ...newAdversary(0), hp: 0, maxHp: 12, fallen: true };
    const list = addTemplate([], c);
    expect(list).toHaveLength(1);
    expect(list[0].id).not.toBe(c.id);
    expect(list[0].hp).toBe(12);
    expect(list[0].fallen).toBe(false);
  });
  it('removes selected templates', () => {
    let list = addTemplate(addTemplate([], newAdversary(0)), newAdversary(1));
    const keep = list[1].id;
    list = removeTemplates(list, new Set([list[0].id]));
    expect(list.map((t) => t.id)).toEqual([keep]);
  });
});
