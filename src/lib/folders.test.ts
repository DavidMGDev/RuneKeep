import { addFolder, assign, EMPTY_INDEX, membersOf, removeFolder, renameFolder, setCollapsed } from './folders';

describe('folders', () => {
  it('adds a folder with a name and a colour', () => {
    const idx = addFolder(EMPTY_INDEX, 'Villains');
    expect(idx.folders).toHaveLength(1);
    expect(idx.folders[0].name).toBe('Villains');
    expect(idx.folders[0].color).toMatch(/^#/);
  });
  it('assigns and lists members, and reassigning moves them', () => {
    let idx = addFolder(EMPTY_INDEX, 'A');
    const fid = idx.folders[0].id;
    idx = assign(idx, 'c1', fid);
    idx = assign(idx, 'c2', fid);
    expect(membersOf(idx, fid).sort()).toEqual(['c1', 'c2']);
    idx = assign(idx, 'c1', null); // unassign
    expect(membersOf(idx, fid)).toEqual(['c2']);
  });
  it('renames without touching assignments', () => {
    let idx = assign(addFolder(EMPTY_INDEX, 'A'), 'c1', undefined as never);
    const fid = idx.folders[0].id;
    idx = assign(idx, 'c1', fid);
    idx = renameFolder(idx, fid, 'Heroes');
    expect(idx.folders[0].name).toBe('Heroes');
    expect(membersOf(idx, fid)).toEqual(['c1']);
  });
  it('removing a folder ungroups its members', () => {
    let idx = addFolder(EMPTY_INDEX, 'A');
    const fid = idx.folders[0].id;
    idx = assign(idx, 'c1', fid);
    idx = removeFolder(idx, fid);
    expect(idx.folders).toEqual([]);
    expect(membersOf(idx, fid)).toEqual([]);
    expect(idx.assignments.c1).toBeUndefined();
  });
});

/**
 * v0.27.2: collapsing a group is a preference and has to survive everything.
 *
 * The flag was being written correctly and never read back, so a tidied roster came back open every
 * time the player left the screen. These pin the two halves of that: the round trip, and the fact
 * that deleting one folder must not re-open the others.
 */
describe('a collapsed group', () => {
  it('round-trips through the index', () => {
    const idx = setCollapsed(EMPTY_INDEX, 'fd-1', true);
    expect(idx.collapsed).toContain('fd-1');
    expect(setCollapsed(idx, 'fd-1', false).collapsed).not.toContain('fd-1');
  });

  it('records the ungrouped section like any other group', () => {
    expect(setCollapsed(EMPTY_INDEX, '__ungrouped', true).collapsed).toEqual(['__ungrouped']);
  });

  it('survives another folder being deleted', () => {
    let idx = addFolder(addFolder(EMPTY_INDEX, 'Keep'), 'Bin');
    const [keep, bin] = idx.folders;
    idx = setCollapsed(setCollapsed(idx, keep.id, true), '__ungrouped', true);
    const after = removeFolder(idx, bin.id);
    expect(after.collapsed).toContain(keep.id);
    expect(after.collapsed).toContain('__ungrouped');
  });

  it('forgets the folder that was deleted', () => {
    let idx = addFolder(EMPTY_INDEX, 'Bin');
    const bin = idx.folders[0];
    idx = setCollapsed(idx, bin.id, true);
    expect(removeFolder(idx, bin.id).collapsed).not.toContain(bin.id);
  });
});
