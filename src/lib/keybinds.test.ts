import { intentFor, type KeyContext, SHIFT_STEP } from './keybinds';

const ctx = (over: Partial<KeyContext> = {}): KeyContext => ({ typing: false, overlay: false, focused: false, editing: false, ...over });

describe('moving along the carousel', () => {
  it('takes arrows and WASD as the same thing', () => {
    expect(intentFor({ key: 'ArrowLeft' }, ctx())).toEqual({ kind: 'move', step: -1 });
    expect(intentFor({ key: 'a' }, ctx())).toEqual({ kind: 'move', step: -1 });
    expect(intentFor({ key: 'ArrowRight' }, ctx())).toEqual({ kind: 'move', step: 1 });
    expect(intentFor({ key: 'd' }, ctx())).toEqual({ kind: 'move', step: 1 });
  });

  it('does not care about capitals, so caps lock is not a trap', () => {
    expect(intentFor({ key: 'A' }, ctx())).toEqual({ kind: 'move', step: -1 });
    expect(intentFor({ key: 'D' }, ctx())).toEqual({ kind: 'move', step: 1 });
  });

  it('crosses two at a time with shift, in both directions', () => {
    expect(intentFor({ key: 'ArrowRight', shift: true }, ctx())).toEqual({ kind: 'move', step: SHIFT_STEP });
    expect(intentFor({ key: 'a', shift: true }, ctx())).toEqual({ kind: 'move', step: -SHIFT_STEP });
  });
});

describe('up and down', () => {
  it('focuses and unfocuses', () => {
    expect(intentFor({ key: 'w' }, ctx())).toEqual({ kind: 'focus' });
    expect(intentFor({ key: 'ArrowUp' }, ctx())).toEqual({ kind: 'focus' });
    expect(intentFor({ key: 's' }, ctx())).toEqual({ kind: 'unfocus' });
    expect(intentFor({ key: 'ArrowDown' }, ctx())).toEqual({ kind: 'unfocus' });
  });

  it('changes category when shifted', () => {
    expect(intentFor({ key: 'ArrowUp', shift: true }, ctx())).toEqual({ kind: 'category', step: -1 });
    expect(intentFor({ key: 'ArrowDown', shift: true }, ctx())).toEqual({ kind: 'category', step: 1 });
  });
});

describe('space and E', () => {
  it('equips with space', () => {
    expect(intentFor({ key: ' ' }, ctx())).toEqual({ kind: 'toggle' });
  });

  // In edit mode a tap raises a card rather than equipping it, so space has to follow.
  it('raises the card instead while editing', () => {
    expect(intentFor({ key: ' ' }, ctx({ editing: true }))).toEqual({ kind: 'select' });
  });

  it('toggles edit mode with E', () => {
    expect(intentFor({ key: 'e' }, ctx())).toEqual({ kind: 'editMode' });
    expect(intentFor({ key: 'E' }, ctx())).toEqual({ kind: 'editMode' });
  });
});

describe('keeping out of the way', () => {
  // The reason the resolver takes a context at all: typing "was" must not steer the carousel.
  it('lets a text field have every ordinary key', () => {
    for (const key of ['w', 'a', 's', 'd', 'e', ' ', 'ArrowLeft', 'ArrowUp']) {
      expect(intentFor({ key }, ctx({ typing: true }))).toBeNull();
    }
  });

  it('still takes Enter and Escape while typing, since they mean the same everywhere', () => {
    expect(intentFor({ key: 'Enter' }, ctx({ typing: true }))).toEqual({ kind: 'confirm' });
    expect(intentFor({ key: 'Escape' }, ctx({ typing: true }))).toEqual({ kind: 'dismiss' });
  });

  it('leaves modifier combinations to the browser', () => {
    expect(intentFor({ key: 'a', ctrl: true }, ctx())).toBeNull();
    expect(intentFor({ key: 'r', meta: true }, ctx())).toBeNull();
    expect(intentFor({ key: 'ArrowLeft', alt: true }, ctx())).toBeNull();
    // Even Enter and Escape: Ctrl+Enter and Alt+Escape belong to the OS.
    expect(intentFor({ key: 'Enter', ctrl: true }, ctx())).toBeNull();
  });

  it('gives an open overlay everything except Escape and Enter', () => {
    expect(intentFor({ key: 'a' }, ctx({ overlay: true }))).toBeNull();
    expect(intentFor({ key: ' ' }, ctx({ overlay: true }))).toBeNull();
    expect(intentFor({ key: 'e' }, ctx({ overlay: true }))).toBeNull();
    expect(intentFor({ key: 'Escape' }, ctx({ overlay: true }))).toEqual({ kind: 'dismiss' });
    expect(intentFor({ key: 'Enter' }, ctx({ overlay: true }))).toEqual({ kind: 'confirm' });
  });

  it('ignores keys it has no use for', () => {
    expect(intentFor({ key: 'q' }, ctx())).toBeNull();
    expect(intentFor({ key: 'F5' }, ctx())).toBeNull();
    expect(intentFor({ key: 'Tab' }, ctx())).toBeNull();
  });
});

describe('edit mode', () => {
  const editing = { typing: false, overlay: false, focused: false, editing: true };

  it('ignores up and down, which have nothing to act on in a flat row', () => {
    expect(intentFor({ key: 'ArrowUp' }, editing)).toBeNull();
    expect(intentFor({ key: 'ArrowDown' }, editing)).toBeNull();
    expect(intentFor({ key: 'w' }, editing)).toBeNull();
    expect(intentFor({ key: 's' }, editing)).toBeNull();
  });

  it('still moves along the row and across categories', () => {
    expect(intentFor({ key: 'ArrowLeft' }, editing)).toEqual({ kind: 'move', step: -1 });
    expect(intentFor({ key: 'ArrowUp', shift: true }, editing)).toEqual({ kind: 'category', step: -1 });
  });

  it('hands both keys back once edit mode is off', () => {
    const normal = { ...editing, editing: false };
    expect(intentFor({ key: 'ArrowUp' }, normal)).toEqual({ kind: 'focus' });
    expect(intentFor({ key: 'ArrowDown' }, normal)).toEqual({ kind: 'unfocus' });
  });
});
