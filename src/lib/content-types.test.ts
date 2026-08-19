import { cardsOfType, contentTypes, customSteps, isCustomStep, stepKeyFor, stepTypeId, typeLabelsFrom } from './content-types';
import type { LibraryCard } from './library';

const card = (p: Partial<LibraryCard> & { id: string }): LibraryCard => ({
  contentType: 'generic', title: '', text: '', imageUri: null, ...p,
});

const ORDER = card({ id: 't1', contentType: 'type', title: 'Knights Radiant', typeSpec: { step: true, pick: 2 } });
const WINDRUNNER = card({ id: 'c1', title: 'Windrunner', customType: 't1' });
const SKYBREAKER = card({ id: 'c2', title: 'Skybreaker', customType: 't1' });
const PLAIN = card({ id: 'c3', title: 'A rope' });

describe('step keys', () => {
  it('round-trips a type id', () => {
    expect(stepTypeId(stepKeyFor('t1'))).toBe('t1');
  });
  it('never mistakes a built-in deck for a custom one', () => {
    expect(isCustomStep('ancestry')).toBe(false);
    expect(isCustomStep(stepKeyFor('t1'))).toBe(true);
    expect(stepTypeId('ancestry')).toBe('');
  });
});

describe('contentTypes', () => {
  it('finds named type cards only', () => {
    const unnamed = card({ id: 't2', contentType: 'type', title: '   ' });
    expect(contentTypes([ORDER, unnamed, PLAIN]).map((c) => c.id)).toEqual(['t1']);
  });
  it('handles no cards at all', () => {
    expect(contentTypes(undefined)).toEqual([]);
  });
});

describe('cardsOfType', () => {
  it('returns only the cards naming that type', () => {
    expect(cardsOfType([ORDER, WINDRUNNER, SKYBREAKER, PLAIN], 't1').map((c) => c.id)).toEqual(['c1', 'c2']);
  });
});

describe('customSteps', () => {
  it('offers a step for a type that asked for one and has cards', () => {
    expect(customSteps([ORDER, WINDRUNNER, SKYBREAKER])).toEqual([
      { typeId: 't1', key: 'custom:t1', label: 'Knights Radiant', pick: 2, hint: undefined },
    ]);
  });
  it('offers nothing for a type with no cards, because the step could not be answered', () => {
    expect(customSteps([ORDER])).toEqual([]);
  });
  it('offers nothing when the author left the step off', () => {
    const off = { ...ORDER, typeSpec: { step: false, pick: 1 } };
    expect(customSteps([off, WINDRUNNER])).toEqual([]);
  });
  it('uses the step label when the author gave one, and clamps a nonsense pick', () => {
    const named = { ...ORDER, typeSpec: { step: true, pick: 0, stepLabel: 'Order', stepHint: 'Pick your Order.' } };
    expect(customSteps([named, WINDRUNNER])[0]).toEqual({ typeId: 't1', key: 'custom:t1', label: 'Order', pick: 1, hint: 'Pick your Order.' });
  });
});

describe('typeLabelsFrom', () => {
  it('prefers the chip word, falling back to the type name', () => {
    const chipped = { ...ORDER, plaque: { label: 'Order' } };
    expect(typeLabelsFrom([ORDER])).toEqual(['Knights Radiant']);
    expect(typeLabelsFrom([chipped])).toEqual(['Order']);
  });
});
