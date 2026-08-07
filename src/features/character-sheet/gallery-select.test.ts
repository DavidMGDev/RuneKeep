import { NO_SELECTION, clearSelection, holdTile, movedFirst, tapTile } from './gallery-select';

describe('gallery selection', () => {
  it('a tap outside select mode focuses the card and picks nothing', () => {
    const s = tapTile(NO_SELECTION, 'a');
    expect(s.focusId).toBe('a');
    expect(s.selecting).toBe(false);
    expect([...s.selected]).toEqual([]);
  });

  it('a hold enters select mode with that card already picked', () => {
    const s = holdTile(NO_SELECTION, 'a');
    expect(s.selecting).toBe(true);
    expect([...s.selected]).toEqual(['a']);
    expect(s.focusId).toBeNull();
  });

  it('taps toggle once selecting, and never focus', () => {
    let s = holdTile(NO_SELECTION, 'a');
    s = tapTile(s, 'b');
    expect([...s.selected].sort()).toEqual(['a', 'b']);
    expect(s.focusId).toBeNull();
    s = tapTile(s, 'b');
    expect([...s.selected]).toEqual(['a']);
    expect(s.selecting).toBe(true);
  });

  it('deselecting the last card leaves select mode, so the panel is never stranded', () => {
    let s = holdTile(NO_SELECTION, 'a');
    s = tapTile(s, 'a');
    expect(s.selected.size).toBe(0);
    expect(s.selecting).toBe(false);
    // ...and the next tap reads as a look, not a pick.
    expect(tapTile(s, 'b').focusId).toBe('b');
  });

  it('clearing drops the selection and leaves select mode', () => {
    const s = clearSelection(holdTile(holdTile(NO_SELECTION, 'a'), 'b'));
    expect(s.selecting).toBe(false);
    expect(s.selected.size).toBe(0);
  });

  it('holding a card that is already picked keeps it picked', () => {
    const s = holdTile(holdTile(NO_SELECTION, 'a'), 'a');
    expect([...s.selected]).toEqual(['a']);
    expect(s.selecting).toBe(true);
  });
});

describe('movedFirst', () => {
  it('puts the moved cards first and the incumbents after', () => {
    expect(movedFirst(['x', 'y'], ['a', 'b'])).toEqual(['x', 'y', 'a', 'b']);
  });

  it('does not duplicate cards moving within their own category', () => {
    expect(movedFirst(['c'], ['a', 'b', 'c'])).toEqual(['c', 'a', 'b']);
  });

  it('keeps the moved set in the order it was given', () => {
    expect(movedFirst(['c', 'a'], ['a', 'b', 'c'])).toEqual(['c', 'a', 'b']);
  });

  it('is a no-op shape for an empty move', () => {
    expect(movedFirst([], ['a', 'b'])).toEqual(['a', 'b']);
  });
});
