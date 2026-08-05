import type { CharacterFile } from './character-file';
import { applyPromotions, copyRoleOf, instancesOfRef, resolveCopyDeletions } from './card-copies';

const file = (patch: Partial<CharacterFile>): CharacterFile => ({ ...patch } as CharacterFile);

describe('card copies are mirrors of one card (v0.34.8)', () => {
  const f = file({
    cardCopies: [{ id: 'cp-1', ref: 'cc-a' }, { id: 'cp-2', ref: 'cc-a' }],
    cardCategory: { 'cc-a': 'abilities', 'cp-1': 'inventory', 'cp-2': 'notes' },
    cardOrder: { inventory: ['x', 'cp-1'], notes: ['cp-2'] },
  });

  it('names the original and its copies', () => {
    expect(instancesOfRef(f, 'cc-a')).toEqual(['cc-a', 'cp-1', 'cp-2']);
    expect(copyRoleOf(f, 'cc-a')).toEqual({ role: 'original', total: 3 });
    expect(copyRoleOf(f, 'cp-2')).toEqual({ role: 'copy', total: 3 });
    expect(copyRoleOf(f, 'cc-b')).toEqual({ role: 'single', total: 1 });
  });

  it('deleting a copy leaves the card alone', () => {
    expect(resolveCopyDeletions(f, ['cp-1'])).toEqual({ deleteIds: ['cp-1'], promotedRefs: [], consumedCopyIds: [] });
  });

  it('deleting the original promotes the first surviving copy', () => {
    const r = resolveCopyDeletions(f, ['cc-a']);
    expect(r).toEqual({ deleteIds: [], promotedRefs: ['cc-a'], consumedCopyIds: ['cp-1'] });
    const { cardCategory, cardOrder } = applyPromotions(f, r.promotedRefs, r.consumedCopyIds);
    expect(cardCategory['cc-a']).toBe('inventory'); // takes the promoted copy's slot
    expect(cardCategory['cp-1']).toBeUndefined();
    expect(cardOrder.inventory).toEqual(['x', 'cc-a']);
  });

  it('never promotes into a copy that is being deleted in the same breath', () => {
    const r = resolveCopyDeletions(f, ['cc-a', 'cp-1']);
    expect(r.promotedRefs).toEqual(['cc-a']);
    expect(r.consumedCopyIds).toEqual(['cp-2']); // cp-1 is going too, so it cannot be the survivor
    expect(r.deleteIds).toEqual(['cp-1']);
  });

  it('selecting the original AND every copy really deletes the card', () => {
    const r = resolveCopyDeletions(f, ['cc-a', 'cp-1', 'cp-2']);
    expect(r.promotedRefs).toEqual([]);
    expect(new Set(r.deleteIds)).toEqual(new Set(['cc-a', 'cp-1', 'cp-2']));
  });

  it('two originals each claim their own survivor', () => {
    const g = file({ cardCopies: [{ id: 'cp-1', ref: 'a' }, { id: 'cp-2', ref: 'b' }] });
    const r = resolveCopyDeletions(g, ['a', 'b']);
    expect(r.consumedCopyIds).toEqual(['cp-1', 'cp-2']);
  });
});
