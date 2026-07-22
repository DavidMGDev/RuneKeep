import { addTemplate, removeTemplates } from './adversary-library';
import { newAdversary } from './session';

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
