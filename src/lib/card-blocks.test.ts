import { addFunction, blocksOf, needsRemoveConfirm, migrateBlocks, moveBlock, needsBlockMigration, orderedFunctions, prunedFunctions, removeFunction, textSections } from './card-blocks';
import type { CardFunction } from './card-functions';
import type { CardSection } from './library';

const fn = (id: string, over: Partial<CardFunction> = {}): CardFunction => ({ id, kind: 'counter', title: id, ...over });
const txt = (body: string): CardSection => ({ body });
const slot = (id: string): CardSection => ({ body: '', functionId: id });

describe('blocksOf', () => {
  it('pairs a function section with its configuration', () => {
    const b = blocksOf([txt('a'), slot('x')], [fn('x')]);
    expect(b[0].fn).toBeUndefined();
    expect(b[1].fn?.id).toBe('x');
  });

  it('carries the real index, so an edit can name the block', () => {
    expect(blocksOf([txt('a'), txt('b')], []).map((x) => x.index)).toEqual([0, 1]);
  });

  it('leaves a section naming an element that is gone as plain text', () => {
    expect(blocksOf([slot('missing')], [])[0].fn).toBeUndefined();
  });

  it('copes with a card that has neither', () => {
    expect(blocksOf(undefined, undefined)).toEqual([]);
  });
});

describe('textSections / orderedFunctions', () => {
  it('splits the two kinds', () => {
    const s = [txt('a'), slot('x'), txt('b')];
    expect(textSections(s).map((x) => x.body)).toEqual(['a', 'b']);
    expect(orderedFunctions(s, [fn('x')]).map((f) => f.id)).toEqual(['x']);
  });

  it('returns the elements IN CARD ORDER, not in the order they were configured', () => {
    const s = [slot('b'), slot('a')];
    expect(orderedFunctions(s, [fn('a'), fn('b')]).map((f) => f.id)).toEqual(['b', 'a']);
  });
});

describe('addFunction / removeFunction', () => {
  it('places a new element at the end of the body', () => {
    const r = addFunction([txt('a')], [], fn('x'));
    expect(r.sections[1].functionId).toBe('x');
    expect(r.functions).toHaveLength(1);
  });

  it('removes the element AND the section that placed it', () => {
    const r = removeFunction([txt('a'), slot('x')], [fn('x')], 'x');
    expect(r.sections).toHaveLength(1);
    expect(r.functions).toEqual([]);
  });
});

describe('moveBlock', () => {
  it('swaps neighbours', () => {
    expect(moveBlock([txt('a'), txt('b')], 0, 1).map((s) => s.body)).toEqual(['b', 'a']);
  });

  it('moves an element the same way a paragraph moves', () => {
    expect(moveBlock([txt('a'), slot('x')], 1, -1)[0].functionId).toBe('x');
  });

  it('does nothing at either end', () => {
    const s = [txt('a'), txt('b')];
    expect(moveBlock(s, 0, -1)).toBe(s);
    expect(moveBlock(s, 1, 1)).toBe(s);
  });
});

describe('prunedFunctions', () => {
  it('drops a configuration no section places any more', () => {
    expect(prunedFunctions([txt('a')], [fn('x')])).toEqual([]);
  });

  it('keeps one that is still placed', () => {
    expect(prunedFunctions([slot('x')], [fn('x')])).toHaveLength(1);
  });
});

describe('migrateBlocks', () => {
  // A card from before v0.42.3: no title (the field did not exist), a placement, and its own lines.
  const old = (id: string, over: Partial<CardFunction>): CardFunction => ({ ...fn(id, over), title: undefined as unknown as string });
  const legacy = [
    old('up', { placement: 'above', label: 'Charges', before: 'Spend one to strike.' }),
    old('down', { placement: 'below', after: 'Raise it once per tier.' }),
  ];

  it('leaves a card that never had elements exactly as it was', () => {
    const s = [txt('a')];
    expect(migrateBlocks(s, []).sections).toBe(s);
  });

  it('leaves an already-migrated card alone', () => {
    const s = [slot('x')];
    expect(migrateBlocks(s, [fn('x')]).sections).toBe(s);
    expect(needsBlockMigration(s, [fn('x')])).toBe(false);
  });

  it('puts an above element before the text and a below element after it', () => {
    const out = migrateBlocks([txt('body')], legacy).sections;
    expect(out.map((s) => s.functionId ?? s.body)).toEqual(['Spend one to strike.', 'up', 'body', 'down', 'Raise it once per tier.']);
  });

  it('keeps every authored word, because before and after become real sections', () => {
    const bodies = migrateBlocks([txt('body')], legacy).sections.map((s) => s.body);
    expect(bodies).toContain('Spend one to strike.');
    expect(bodies).toContain('Raise it once per tier.');
  });

  it('keeps the element ids, so the player state and any advancement still point at them', () => {
    expect(migrateBlocks([txt('b')], legacy).functions.map((f) => f.id)).toEqual(['up', 'down']);
  });

  it('promotes the old label to the title, because that is what it was doing', () => {
    expect(migrateBlocks([txt('b')], legacy).functions[0].title).toBe('Charges');
  });

  it('gives an element that had no label something to be called', () => {
    expect(migrateBlocks([txt('b')], legacy).functions[1].title).toBeTruthy();
  });

  it('clears the fields it migrated, so a second read is a no-op', () => {
    const once = migrateBlocks([txt('b')], legacy);
    expect(once.functions[0].placement).toBeUndefined();
    expect(once.functions[0].before).toBeUndefined();
    expect(migrateBlocks(once.sections, once.functions).sections).toBe(once.sections);
  });
});

describe('needsRemoveConfirm (v0.42.4)', () => {
  it('asks about a section with words in it', () => {
    expect(needsRemoveConfirm(txt('Mark a Stress.'))).toBe(true);
  });

  it('asks about a section that has only a name', () => {
    expect(needsRemoveConfirm({ body: '', name: 'Quick' })).toBe(true);
  });

  it('always asks about an element, because there is more to it than what is on screen', () => {
    expect(needsRemoveConfirm(slot('x'))).toBe(true);
  });

  it('does not ask about an empty section, so tidying up is not twelve confirmations', () => {
    expect(needsRemoveConfirm(txt(''))).toBe(false);
    expect(needsRemoveConfirm(txt('   '))).toBe(false);
  });
});
