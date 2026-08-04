import type { CharacterFile } from './character-file';
import { cardMoves, capEntries, classify, compactableCount, compactHistory, recoverableCards, restoreCard, COALESCE_MS, emptyHistory, HISTORY_CAP, KEPT_IMAGE, preview, readHistory, record, rehydrateImages, repair, rewind, stripHistory, timeline } from './character-history';

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

describe('a save that changed nothing', () => {
  it('is not recorded', () => {
    const h = record(emptyHistory(), null, mk(), {}, T0);
    expect(record(h, mk(), mk(), {}, at(60_000))).toBe(h);
  });

  it('leaves a rewind in place instead of truncating the future', () => {
    let h = record(emptyHistory(), null, mk(), {}, T0);
    h = record(h, mk(), mk({ level: 2 }), {}, at(60_000));
    h = record(h, mk({ level: 2 }), mk({ level: 3 }), {}, at(120_000));
    const browsing = { ...h, rewoundTo: 0 };
    // The sheet saves on mount and on unmount without the player touching anything; those must not
    // count as "you changed something", or browsing the timeline destroys it.
    const after = record(browsing, mk(), mk(), {}, at(180_000));
    expect(after.entries).toHaveLength(3);
    expect(after.rewoundTo).toBe(0);
  });

  it('still truncates on the first real change after a rewind', () => {
    let h = record(emptyHistory(), null, mk(), {}, T0);
    h = record(h, mk(), mk({ level: 2 }), {}, at(60_000));
    h = record(h, mk({ level: 2 }), mk({ level: 3 }), {}, at(120_000));
    const after = record({ ...h, rewoundTo: 0 }, mk(), mk({ level: 5 }), {}, at(180_000));
    expect(after.entries).toHaveLength(2);
    expect(after.rewoundTo).toBeNull();
  });
});

describe('storage hygiene', () => {
  it('strips nested history from a snapshot', () => {
    const withHistory = { ...mk(), history: { version: 1, entries: [1, 2, 3], rewoundTo: null } } as unknown as CharacterFile;
    expect('history' in stripHistory(withHistory)).toBe(false);
  });

  it('never nests a chain inside a snapshot', () => {
    let h = record(emptyHistory(), null, mk(), {}, T0);
    const withH = { ...mk({ level: 2 }), history: h } as CharacterFile;
    h = record(h, mk(), withH, {}, at(60_000));
    expect('history' in h.entries[1].snapshot).toBe(false);
  });

  it('treats an absent or foreign history as empty rather than throwing', () => {
    expect(readHistory(undefined).entries).toEqual([]);
    expect(readHistory({ version: 99, entries: [] }).entries).toEqual([]);
    expect(readHistory({ version: 1, entries: 'nope' }).entries).toEqual([]);
  });
});

describe('the card trash is derived from history, not stored', () => {
  const withCards = (cards: { id: string; title: string }[]) => mk({ customCards: cards as never });

  it('lists an authored card that existed before and is gone now', () => {
    let h = record(emptyHistory(), null, withCards([{ id: 'cc-1', title: 'Ember Ward' }]), {}, T0);
    const after = mk({ customCards: [] as never });
    h = record(h, withCards([{ id: 'cc-1', title: 'Ember Ward' }]), after, {}, at(60_000));
    const rec = recoverableCards(h, after);
    expect(rec).toHaveLength(1);
    expect(rec[0]).toMatchObject({ id: 'cc-1', title: 'Ember Ward', collection: 'customCards' });
  });

  it('does not list cards the character still has', () => {
    const live = withCards([{ id: 'cc-1', title: 'Ember Ward' }]);
    const h = record(emptyHistory(), null, live, {}, T0);
    expect(recoverableCards(h, live)).toEqual([]);
  });

  it('stops listing a card once it has been restored', () => {
    let h = record(emptyHistory(), null, withCards([{ id: 'cc-1', title: 'Ember Ward' }]), {}, T0);
    const gone = mk({ customCards: [] as never });
    h = record(h, withCards([{ id: 'cc-1', title: 'Ember Ward' }]), gone, {}, at(60_000));
    const back = restoreCard(gone, recoverableCards(h, gone)[0]);
    expect(recoverableCards(h, back)).toEqual([]);
  });

  it('puts a restored card back in the collection it came from', () => {
    let h = record(emptyHistory(), null, mk({ notes: [{ id: 'n-1', title: 'Tavern' }] as never }), {}, T0);
    const gone = mk({ notes: [] as never });
    h = record(h, mk({ notes: [{ id: 'n-1', title: 'Tavern' }] as never }), gone, {}, at(60_000));
    const rec = recoverableCards(h, gone);
    expect(rec[0].collection).toBe('notes');
    const back = restoreCard(gone, rec[0]);
    expect((back.notes as unknown as { id: string }[]).map((n) => n.id)).toEqual(['n-1']);
  });

  it('restoring twice is a no-op rather than a duplicate', () => {
    let h = record(emptyHistory(), null, withCards([{ id: 'cc-1', title: 'Ember Ward' }]), {}, T0);
    const gone = mk({ customCards: [] as never });
    h = record(h, withCards([{ id: 'cc-1', title: 'Ember Ward' }]), gone, {}, at(60_000));
    const rec = recoverableCards(h, gone)[0];
    const once = restoreCard(gone, rec);
    expect((restoreCard(once, rec).customCards as unknown as unknown[]).length).toBe(1);
  });
});

describe('a write the app made itself', () => {
  it('is never recorded and never truncates a rewind', () => {
    let h = record(emptyHistory(), null, mk(), {}, T0);
    h = record(h, mk(), mk({ level: 2 }), {}, at(60_000));
    h = record(h, mk({ level: 2 }), mk({ level: 3 }), {}, at(120_000));
    const browsing = { ...h, rewoundTo: 0 };
    // The welcome-note seeding is exactly this shape: a REAL change (so the no-op guard cannot help)
    // that the player did not make, fired by restoring a snapshot from before the note existed.
    const after = record(browsing, mk(), mk({ name: 'seeded' }), { system: true }, at(180_000));
    expect(after).toBe(browsing);
    expect(after.entries).toHaveLength(3);
    expect(after.rewoundTo).toBe(0);
  });

  it('does not stop the player from truncating with their own next edit', () => {
    let h = record(emptyHistory(), null, mk(), {}, T0);
    h = record(h, mk(), mk({ level: 2 }), {}, at(60_000));
    const after = record({ ...h, rewoundTo: 0 }, mk(), mk({ level: 9 }), {}, at(120_000));
    expect(after.entries).toHaveLength(2);
    expect(after.rewoundTo).toBeNull();
  });
});

describe('which cards an entry moved', () => {
  it('reports nothing when nothing moved', () => {
    expect(cardMoves(mk(), mk())).toEqual({ added: [], removed: [] });
  });

  it('names an equipped card and an unequipped one', () => {
    const before = mk({ enabledCardIds: ['blade-01-1'] } as Partial<CharacterFile>);
    const after = mk({ enabledCardIds: ['bone-01-1'] } as Partial<CharacterFile>);
    expect(cardMoves(before, after)).toEqual({ added: ['bone-01-1'], removed: ['blade-01-1'] });
  });

  it('counts a card the player authored', () => {
    const after = mk({ customCards: [{ id: 'cc-1', title: 'Backpack' }] } as unknown as Partial<CharacterFile>);
    expect(cardMoves(mk(), after).added).toEqual(['cc-1']);
  });

  it('treats a tombstoned card as gone, since that is what the player saw', () => {
    // A system card is never spliced out of its array; it is listed in removedCardIds instead.
    const before = mk({ domainCardIds: ['d1', 'd2'] } as Partial<CharacterFile>);
    const after = mk({ domainCardIds: ['d1', 'd2'], removedCardIds: ['d2'] } as unknown as Partial<CharacterFile>);
    expect(cardMoves(before, after)).toEqual({ added: [], removed: ['d2'] });
  });

  it('treats restoring one as a return', () => {
    const before = mk({ domainCardIds: ['d1'], removedCardIds: ['d1'] } as unknown as Partial<CharacterFile>);
    const after = mk({ domainCardIds: ['d1'] } as Partial<CharacterFile>);
    expect(cardMoves(before, after)).toEqual({ added: ['d1'], removed: [] });
  });

  it('follows a single-slot field like a weapon', () => {
    const before = mk({ weaponPrimaryId: 'wpn-broadsword' } as Partial<CharacterFile>);
    const after = mk({ weaponPrimaryId: 'wpn-axe' } as Partial<CharacterFile>);
    expect(cardMoves(before, after)).toEqual({ added: ['wpn-axe'], removed: ['wpn-broadsword'] });
  });

  it('survives a missing snapshot', () => {
    // From nothing, every card the character holds counts as arriving, which is correct: the fixture
    // has an ancestry, a subclass and two domain cards before anything is added to it.
    const fromNothing = cardMoves(null, mk({ enabledCardIds: ['x'] } as Partial<CharacterFile>));
    expect(fromNothing.added).toContain('x');
    expect(fromNothing.removed).toEqual([]);
    expect(cardMoves(mk(), null).added).toEqual([]);
    expect(cardMoves(mk(), null).removed).toContain('ancestry-elf');
  });
});

describe('inline images never enter a snapshot (v0.33.1)', () => {
  const PHOTO = `data:image/jpeg;base64,${'A'.repeat(500)}`;
  const live = mk({
    portraitUri: PHOTO,
    customCards: [
      { id: 'cc-1', title: 'Torch', text: '', imageUri: PHOTO },
      { id: 'cc-2', title: 'Rope', text: '', imageUri: null },
    ],
  } as Partial<CharacterFile>);

  it('replaces the bytes with a placeholder, and leaves file:// paths alone', () => {
    const snap = stripHistory(live);
    expect(snap.portraitUri).toBe(KEPT_IMAGE);
    expect(JSON.stringify(snap)).not.toContain('AAAA');
    expect(stripHistory(mk({ portraitUri: 'file:///images/a.jpg' })).portraitUri).toBe('file:///images/a.jpg');
  });

  it('does not copy the character it was given', () => {
    stripHistory(live);
    expect(live.portraitUri).toBe(PHOTO);
    expect((live.customCards ?? [])[0].imageUri).toBe(PHOTO);
  });

  it('puts the live picture back on rewind, matching cards by id', () => {
    const back = rehydrateImages(stripHistory(live), live);
    expect(back.portraitUri).toBe(PHOTO);
    expect((back.customCards ?? [])[0].imageUri).toBe(PHOTO);
    expect((back.customCards ?? [])[1].imageUri).toBeNull();
  });

  it('clears the placeholder when there is no live image to take, rather than leaving it on screen', () => {
    const gone = rehydrateImages(stripHistory(live), mk({ portraitUri: null, customCards: [] } as Partial<CharacterFile>));
    expect(gone.portraitUri).toBeNull();
    expect((gone.customCards ?? [])[0].imageUri).toBeNull();
  });

  it('rewind returns a character with its picture, not a placeholder', () => {
    const h = record(record(emptyHistory(), null, stripHistory(live), {}, T0), stripHistory(live), stripHistory(mk({ ...live, level: 2 })), {}, at(1));
    const r = rewind(h, 0, live);
    expect(r.file.portraitUri).toBe(PHOTO);
  });
});

describe('the card trash (v0.34.0)', () => {
  const note = { id: 'note-1', title: 'Session notes', text: '' };

  it('offers a deleted authored card back', () => {
    const had = mk({ notes: [note] } as Partial<CharacterFile>);
    const gone = mk({ notes: [], removedCardIds: ['note-1'] } as Partial<CharacterFile>);
    const h = record(record(emptyHistory(), null, stripHistory(had), {}, T0), stripHistory(had), stripHistory(gone), {}, at(1));
    const trash = recoverableCards(h, gone);
    expect(trash.map((t) => t.id)).toContain('note-1');
  });

  // The reported bug: restoring put the object back and the tombstone went on hiding it.
  it('lifts the tombstone as well as putting the card back, or the restore does nothing at all', () => {
    const had = mk({ notes: [note] } as Partial<CharacterFile>);
    const gone = mk({ notes: [], removedCardIds: ['note-1'] } as Partial<CharacterFile>);
    const h = record(record(emptyHistory(), null, stripHistory(had), {}, T0), stripHistory(had), stripHistory(gone), {}, at(1));
    const rec = recoverableCards(h, gone).find((t) => t.id === 'note-1')!;
    const back = restoreCard(gone, rec, 'notes');
    expect(back.notes).toHaveLength(1);
    expect(back.removedCardIds ?? []).not.toContain('note-1');
  });

  it('files the restored card in the deck the player chose', () => {
    const had = mk({ notes: [note] } as Partial<CharacterFile>);
    const gone = mk({ notes: [], removedCardIds: ['note-1'] } as Partial<CharacterFile>);
    const h = record(record(emptyHistory(), null, stripHistory(had), {}, T0), stripHistory(had), stripHistory(gone), {}, at(1));
    const rec = recoverableCards(h, gone).find((t) => t.id === 'note-1')!;
    expect(restoreCard(gone, rec, 'inventory').cardCategory?.['note-1']).toBe('inventory');
  });

  // The other half: a deleted armor never reached the trash, because it is hidden rather than spliced.
  it('lists a tombstoned system card, which nothing removed from the file', () => {
    const had = mk({ armorId: 'armor-gambeson' } as Partial<CharacterFile>);
    const gone = mk({ armorId: 'armor-gambeson', removedCardIds: ['armor-gambeson'] } as Partial<CharacterFile>);
    const h = record(record(emptyHistory(), null, stripHistory(had), {}, T0), stripHistory(had), stripHistory(gone), {}, at(1));
    const rec = recoverableCards(h, gone).find((t) => t.id === 'armor-gambeson');
    expect(rec).toBeTruthy();
    expect(rec!.collection).toBeNull();
  });

  it('restores a system card by lifting its tombstone and nothing else', () => {
    const gone = mk({ armorId: 'armor-gambeson', removedCardIds: ['armor-gambeson'] } as Partial<CharacterFile>);
    const rec = { id: 'armor-gambeson', title: 'Gambeson', collection: null as null, at: T0.toISOString() };
    const back = restoreCard(gone, rec, 'inventory');
    expect(back.removedCardIds).toEqual([]);
    expect(back.armorId).toBe('armor-gambeson');
    expect(back.cardCategory?.['armor-gambeson']).toBe('inventory');
  });

  it('never mutates the character it restores into', () => {
    const gone = mk({ notes: [], removedCardIds: ['x'] } as Partial<CharacterFile>);
    const before = JSON.stringify(gone);
    restoreCard(gone, { id: 'x', title: 'x', collection: null, at: T0.toISOString() }, 'notes');
    expect(JSON.stringify(gone)).toBe(before);
  });
});
describe('an app-initiated write (v0.34.5)', () => {
  it('costs nothing at all: it never even looks at the character', () => {
    const h = record(emptyHistory(), null, mk({ name: 'A' }));
    // A Proxy that throws on ANY read is the only way to prove the early return runs first.
    const tripwire = new Proxy({} as CharacterFile, {
      get() {
        throw new Error('a system write must not read the character');
      },
    });
    expect(record(h, mk({ name: 'A' }), tripwire, { system: true })).toBe(h);
  });
});
describe('compacting a long campaign (owner, v0.34.6)', () => {
  const build = () => {
    let h = record(emptyHistory(), null, mk({ name: 'A' }));
    h = record(h, mk({ name: 'A' }), mk({ name: 'A', resources: { hp: 5, stress: 0, hope: 2, armor: 0 } }));
    h = record(h, mk({ name: 'A' }), mk({ name: 'A', level: 2 }));
    h = record(h, mk({ name: 'A', level: 2 }), mk({ name: 'A', level: 2, resources: { hp: 3, stress: 1, hope: 2, armor: 0 } }));
    h = record(h, mk({ name: 'A', level: 2 }), mk({ name: 'A', level: 3 }));
    return h;
  };

  it('keeps creation and every level, and nothing else', () => {
    const kinds = compactHistory(build()).entries.map((e) => e.kind);
    expect(kinds).toEqual(['create', 'level', 'level']);
  });

  it('says how many it would drop, before it drops them', () => {
    const h = build();
    expect(compactableCount(h)).toBe(h.entries.length - 3);
  });

  it('clears the rewind position, because every index just moved', () => {
    const h = preview(build(), 1);
    expect(h.rewoundTo).toBe(1);
    expect(compactHistory(h).rewoundTo).toBeNull();
  });

  it('is a no-op on a history that is already only milestones', () => {
    const once = compactHistory(build());
    expect(compactHistory(once).entries).toHaveLength(once.entries.length);
    expect(compactableCount(once)).toBe(0);
  });

  it('never throws creation away, whatever else goes', () => {
    expect(compactHistory(build()).entries[0].kind).toBe('create');
  });
});
