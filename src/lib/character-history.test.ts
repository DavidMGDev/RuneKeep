import type { CharacterFile } from './character-file';
import { capEntries, classify, COALESCE_MS, emptyHistory, HISTORY_CAP, preview, readHistory, record, repair, rewind, stripHistory, timeline } from './character-history';

/** A minimal but realistic character file. Only the fields a test touches need to be meaningful. */
function mk(over: Partial<CharacterFile> = {}): CharacterFile {
  return {
    schemaVersion: 1,
    id: 'ch-test',
    createdAt: '2026-01-01T00:00:00.000Z',
    name: 'Aeliana',
    className: 'Wizard',
    subclassCardId: 'sub-1',
    ancestryCardId: 'ancestry-elf',
    communityCardId: 'com-1',
    domainCardIds: ['d1', 'd2'],
    level: 1,
    maxHp: 12,
    resources: { hp: 12, stress: 0, hope: 2, armor: 0 },
    ...over,
  } as CharacterFile;
}

const T0 = new Date('2026-01-01T12:00:00.000Z');
const at = (msAfter: number) => new Date(T0.getTime() + msAfter);

describe('classify', () => {
  it('calls the first record a creation milestone', () => {
    const c = classify(null, mk());
    expect(c.kind).toBe('create');
    expect(c.milestone).toBe(true);
    expect(c.label).toContain('Aeliana');
  });

  it('reads a level change as a milestone regardless of what else moved', () => {
    const c = classify(mk(), mk({ level: 2, resources: { hp: 4, stress: 1, hope: 1, armor: 0 } }));
    expect(c.kind).toBe('level');
    expect(c.milestone).toBe(true);
    expect(c.label).toBe('Levelled up to 2');
  });

  it('labels a resource move in plain language', () => {
    const c = classify(mk(), mk({ resources: { hp: 9, stress: 0, hope: 2, armor: 0 } }));
    expect(c.kind).toBe('resource');
    expect(c.label).toBe('HP 12 → 9');
  });

  it('classifies a structural change as structural even though the save also carries resources', () => {
    // The sheet's single save closure stamps live resources and gold onto EVERY write, so an equip
    // always arrives with the player's HP attached. Classifying by resources first would mislabel
    // every equip in the app as an HP change.
    const prev = mk();
    const next = mk({ enabledCardIds: ['card-a'], resources: { hp: 5, stress: 3, hope: 1, armor: 2 } });
    expect(classify(prev, next).kind).toBe('equip');
  });

  it('needs an explicit intent to tell a rest from a tap on the HP track', () => {
    const prev = mk({ resources: { hp: 4, stress: 4, hope: 1, armor: 0 } });
    const next = mk({ resources: { hp: 12, stress: 0, hope: 1, armor: 0 } });
    expect(classify(prev, next).kind).toBe('resource');
    const rested = classify(prev, next, { kind: 'rest', label: 'Took a long rest' });
    expect(rested.kind).toBe('rest');
    expect(rested.milestone).toBe(true);
  });

  it('distinguishes card changes from reordering', () => {
    expect(classify(mk(), mk({ customCards: [{ id: 'cc-1' }] as never })).kind).toBe('cards');
    expect(classify(mk(), mk({ cardOrder: { abilities: ['a', 'b'] } as never })).kind).toBe('layout');
    expect(classify(mk(), mk({ cardEffectOverrides: { x: [] } as never })).kind).toBe('edit');
  });
});

describe('record', () => {
  it('records the very first snapshot', () => {
    const h = record(emptyHistory(), null, mk(), {}, T0);
    expect(h.entries).toHaveLength(1);
    expect(h.entries[0].kind).toBe('create');
  });

  it('never mutates the history it was given', () => {
    const h0 = record(emptyHistory(), null, mk(), {}, T0);
    const before = JSON.stringify(h0);
    record(h0, mk(), mk({ resources: { hp: 11, stress: 0, hope: 2, armor: 0 } }), {}, at(1000));
    expect(JSON.stringify(h0)).toBe(before);
  });

  it('coalesces rapid edits to the same resource into one net entry', () => {
    let h = record(emptyHistory(), null, mk(), {}, T0);
    let prev = mk();
    for (let hp = 11; hp >= 8; hp--) {
      const next = mk({ resources: { hp, stress: 0, hope: 2, armor: 0 } });
      h = record(h, prev, next, {}, at((12 - hp) * 500));
      prev = next;
    }
    // create + one folded resource entry
    expect(h.entries).toHaveLength(2);
    expect(h.entries[1].label).toBe('HP 12 → 8');
    expect(h.entries[1].steps).toHaveLength(4);
  });

  it('starts a new entry once the coalesce window has passed', () => {
    let h = record(emptyHistory(), null, mk(), {}, T0);
    const a = mk({ resources: { hp: 11, stress: 0, hope: 2, armor: 0 } });
    h = record(h, mk(), a, {}, at(1000));
    const b = mk({ resources: { hp: 10, stress: 0, hope: 2, armor: 0 } });
    h = record(h, a, b, {}, at(1000 + COALESCE_MS + 1));
    expect(h.entries).toHaveLength(3);
  });

  it('does not coalesce across different resources', () => {
    let h = record(emptyHistory(), null, mk(), {}, T0);
    const a = mk({ resources: { hp: 11, stress: 0, hope: 2, armor: 0 } });
    h = record(h, mk(), a, {}, at(100));
    const b = mk({ resources: { hp: 11, stress: 3, hope: 2, armor: 0 } });
    h = record(h, a, b, {}, at(200));
    expect(h.entries).toHaveLength(3);
    expect(h.entries[2].label).toBe('Stress 0 → 3');
  });

  it('collapses a bulk equip by intent, not by timing', () => {
    // Bulk equip issues one save per card ~35ms apart. Without an intent they'd be N entries for
    // one user action.
    let h = record(emptyHistory(), null, mk(), {}, T0);
    let prev = mk();
    for (let i = 0; i < 8; i++) {
      const next = mk({ enabledCardIds: Array.from({ length: i + 1 }, (_, n) => `c${n}`) });
      h = record(h, prev, next, { kind: 'equip', label: 'Equipped 8 cards' }, at(100 + i * 35));
      prev = next;
    }
    expect(h.entries).toHaveLength(2);
    expect(h.entries[1].label).toBe('Equipped 8 cards');
  });

  it('never coalesces milestones', () => {
    let h = record(emptyHistory(), null, mk(), {}, T0);
    h = record(h, mk(), mk({ level: 2 }), {}, at(100));
    h = record(h, mk({ level: 2 }), mk({ level: 3 }), {}, at(200));
    expect(h.entries).toHaveLength(3);
    expect(h.entries.filter((e) => e.milestone)).toHaveLength(3);
  });

  it('honours separate:true even inside the window', () => {
    let h = record(emptyHistory(), null, mk(), {}, T0);
    const a = mk({ resources: { hp: 11, stress: 0, hope: 2, armor: 0 } });
    h = record(h, mk(), a, {}, at(100));
    const b = mk({ resources: { hp: 10, stress: 0, hope: 2, armor: 0 } });
    h = record(h, a, b, { separate: true }, at(200));
    expect(h.entries).toHaveLength(3);
  });

  it('is safe against a doubled commit under StrictMode', () => {
    // Two mutation paths call the save closure from inside a state updater, which React double-
    // invokes in development. The same prev->next recorded twice must fold, not duplicate.
    let h = record(emptyHistory(), null, mk(), {}, T0);
    const next = mk({ resources: { hp: 11, stress: 0, hope: 2, armor: 0 } });
    h = record(h, mk(), next, {}, at(100));
    h = record(h, mk(), next, {}, at(100));
    expect(h.entries).toHaveLength(2);
  });
});

describe('rewind', () => {
  /** create -> HP 12→9 -> equip -> level 2 */
  function campaign() {
    let h = record(emptyHistory(), null, mk(), {}, T0);
    const a = mk({ resources: { hp: 9, stress: 0, hope: 2, armor: 0 } });
    h = record(h, mk(), a, {}, at(60_000));
    const b = mk({ resources: a.resources, enabledCardIds: ['robes'] });
    h = record(h, a, b, {}, at(120_000));
    const c = mk({ resources: a.resources, enabledCardIds: ['robes'], level: 2 });
    h = record(h, b, c, {}, at(180_000));
    return { h, live: c };
  }

  it('restores the character exactly as it was', () => {
    const { h, live } = campaign();
    const r = rewind(h, 1, live);
    expect(r.file.resources?.hp).toBe(9);
    expect(r.file.enabledCardIds).toBeUndefined();
    expect(r.file.level).toBe(1);
  });

  it('reports how much would be discarded without discarding it yet', () => {
    const { h, live } = campaign();
    const r = rewind(h, 1, live);
    expect(r.discards).toBe(2);
    expect(r.history.entries).toHaveLength(4); // still all there — browsing is free
    expect(r.history.rewoundTo).toBe(1);
  });

  it('marks the entries after the rewind point as discarded in the timeline', () => {
    const { h, live } = campaign();
    const r = rewind(h, 1, live);
    const rows = timeline(r.history);
    expect(rows.filter((x) => x.discarded)).toHaveLength(2);
    expect(rows[0].index).toBe(3); // newest first
  });

  it('destroys the future on the next real change — no fast-forward, ever', () => {
    const { h, live } = campaign();
    const r = rewind(h, 1, live);
    const after = record(r.history, r.file, mk({ resources: { hp: 8, stress: 0, hope: 2, armor: 0 } }), {}, at(240_000));
    expect(after.entries).toHaveLength(3); // create, the rewound-to entry, the new one
    expect(after.rewoundTo).toBeNull();
    expect(after.entries.some((e) => e.kind === 'level')).toBe(false);
  });

  it('returning to the head clears the rewound marker', () => {
    const { h, live } = campaign();
    const r = rewind(h, 1, live);
    expect(preview(r.history, 3).rewoundTo).toBeNull();
  });

  it('is a no-op for an out-of-range index', () => {
    const { h, live } = campaign();
    expect(rewind(h, 99, live).file).toBe(live);
  });
});

describe('repair — a snapshot is validated, not trusted', () => {
  it('clamps HP that exceeds the restored build maximum, and says so', () => {
    // Resources are stored but clamped against DERIVED maxima on read, so a rewind is lossy here.
    // Silently yielding a different number would be the worst outcome.
    const { file, repairs } = repair(mk({ maxHp: 6, resources: { hp: 9, stress: 0, hope: 2, armor: 0 } }));
    expect(file.resources?.hp).toBe(6);
    expect(repairs).toHaveLength(1);
    expect(repairs[0]).toContain('HP reduced to 6');
  });

  it('leaves a valid snapshot untouched and reports nothing', () => {
    const { file, repairs } = repair(mk());
    expect(repairs).toEqual([]);
    expect(file.resources?.hp).toBe(12);
  });
});

describe('retention', () => {
  it('keeps history bounded', () => {
    const entries = Array.from({ length: HISTORY_CAP + 50 }, (_, i) => ({
      id: `e${i}`, at: at(i * 1000).toISOString(), kind: 'resource' as const, label: `HP ${i}`, milestone: false, steps: [], key: 'resource:hp', snapshot: mk(),
    }));
    expect(capEntries(entries).length).toBeLessThanOrEqual(HISTORY_CAP);
  });

  it('preserves milestones when ordinary entries age out', () => {
    const entries = Array.from({ length: HISTORY_CAP + 50 }, (_, i) => ({
      id: `e${i}`, at: at(i * 1000).toISOString(), kind: (i === 2 ? 'level' : 'resource') as 'level' | 'resource', label: `e${i}`, milestone: i === 2, steps: [], key: 'k', snapshot: mk(),
    }));
    const kept = capEntries(entries);
    expect(kept.some((e) => e.milestone)).toBe(true);
  });

  it('always keeps creation — it is the only way back to the character as made', () => {
    const entries = Array.from({ length: HISTORY_CAP + 200 }, (_, i) => ({
      id: `e${i}`, at: at(i * 1000).toISOString(), kind: (i === 0 ? 'create' : 'resource') as 'create' | 'resource', label: `e${i}`, milestone: i === 0, steps: [], key: 'k', snapshot: mk(),
    }));
    expect(capEntries(entries)[0].id).toBe('e0');
  });
});

describe('storage hygiene', () => {
  it('strips nested history from a snapshot', () => {
    const withHistory = { ...mk(), history: { version: 1, entries: [1, 2, 3], rewoundTo: null } } as unknown as CharacterFile;
    expect('history' in stripHistory(withHistory)).toBe(false);
  });

  it('never nests a chain inside a snapshot', () => {
    let h = record(emptyHistory(), null, mk(), {}, T0);
    const withH = { ...mk(), history: h } as CharacterFile;
    h = record(h, mk(), withH, {}, at(60_000));
    expect('history' in h.entries[1].snapshot).toBe(false);
  });

  it('treats an absent or foreign history as empty rather than throwing', () => {
    expect(readHistory(undefined).entries).toEqual([]);
    expect(readHistory({ version: 99, entries: [] }).entries).toEqual([]);
    expect(readHistory({ version: 1, entries: 'nope' }).entries).toEqual([]);
  });
});
