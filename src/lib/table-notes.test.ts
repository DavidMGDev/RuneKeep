import { cleanNotes, editNote, isNoteId, mendNotes, newNote, NOTE_TEXT_MAX, NOTE_W, tearNote } from './table-notes';

describe('sticky notes', () => {
  const note = { ...newNote('a1', 0.4, 0.6, 0), text: 'The tide gate opens at dusk' };

  it('starts physical, with an id the engine can carry in a key', () => {
    expect(note.phys).toBe(true);
    expect(isNoteId(note.id)).toBe(true);
    expect(note.id).not.toContain(':');
  });

  it('keeps what was written when it is torn, and mends it whole', () => {
    const torn = tearNote([note], note.id);
    expect(torn[0]).toMatchObject({ torn: true, text: note.text });
    expect(cleanNotes(JSON.parse(JSON.stringify(torn)))[0]).toMatchObject({ torn: true, text: note.text });
    const mended = mendNotes(torn)[0];
    expect(mended.torn).toBeUndefined();
    expect(mended.text).toBe(note.text);
  });

  it('repairs a bad position and never drops the writing for it', () => {
    const [n] = cleanNotes([{ id: 'note-x', text: 'keep me', fx: 'no', fy: 9, w: NaN, paper: 'plaid' }]);
    expect(n).toMatchObject({ text: 'keep me', fx: 0.5, fy: 1, w: NOTE_W, paper: 'gold', phys: true });
  });

  it('drops only what is not a note', () => {
    expect(cleanNotes([null, 4, { id: 'card-1', text: '' }, { id: 'note-a:b', text: '' }, note])).toEqual([note]);
    expect(cleanNotes('nonsense')).toEqual([]);
  });

  it('shrinks a note still at the old default and leaves a resized one alone', () => {
    expect(cleanNotes([{ ...note, w: 160 }, { ...note, id: 'note-b', w: 240 }]).map((n) => n.w)).toEqual([NOTE_W, 240]);
  });

  it('stops writing at the limit', () => {
    expect(editNote([note], note.id, { text: 'a'.repeat(NOTE_TEXT_MAX + 50) })[0].text).toHaveLength(NOTE_TEXT_MAX);
  });
});
