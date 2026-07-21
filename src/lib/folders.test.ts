import { addFolder, assign, EMPTY_INDEX, membersOf, removeFolder, renameFolder } from './folders';

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
