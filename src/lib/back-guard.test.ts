import { createGuardStack, type GuardNav } from './back-guard';

const nav = (): GuardNav & { pushes: number } => {
  const o = { pushes: 0, pushSpare: () => { o.pushes++; } };
  return o;
};

describe('who answers a browser Back', () => {
  it('runs the topmost guard and re-arms', () => {
    const n = nav();
    const s = createGuardStack(n);
    const run = jest.fn();
    s.register({ run, web: true });
    expect(s.onPop()).toBe(true);
    expect(run).toHaveBeenCalledTimes(1);
    expect(n.pushes).toBe(1);
  });

  /** An editor open over a screen answers for itself; the screen underneath never hears about it. */
  it('gives it to the TOPMOST guard only', () => {
    const s = createGuardStack(nav());
    const screen = jest.fn();
    const editor = jest.fn();
    s.register({ run: screen, web: true });
    s.register({ run: editor, web: true });
    s.onPop();
    expect(editor).toHaveBeenCalledTimes(1);
    expect(screen).not.toHaveBeenCalled();
  });

  it('falls back to the guard underneath once the top one disarms', () => {
    const s = createGuardStack(nav());
    const screen = jest.fn();
    const editor = jest.fn();
    s.register({ run: screen, web: true });
    const closeEditor = s.register({ run: editor, web: true });
    closeEditor();
    s.onPop();
    expect(editor).not.toHaveBeenCalled();
    expect(screen).toHaveBeenCalledTimes(1);
  });

  it('skips a guard that opted out of the browser half', () => {
    const s = createGuardStack(nav());
    const sheetHosted = jest.fn();
    s.register({ run: sheetHosted, web: false });
    expect(s.onPop()).toBe(false);
    expect(sheetHosted).not.toHaveBeenCalled();
  });

  it('lets the navigation stand when nothing is armed, rather than trapping the user', () => {
    const n = nav();
    const s = createGuardStack(n);
    expect(s.onPop()).toBe(false);
    expect(n.pushes).toBe(0);
  });
});

/**
 * THE v0.43.1 REGRESSION.
 *
 * Disarming used to call `history.back()`, and guards hand over -- the library screen disarms exactly
 * as the card editor arms -- so opening a card popped the route and threw the author out to the pack
 * list. These pin the handover as free of history operations entirely.
 */
describe('arming and disarming never navigate', () => {
  it('costs no history operations when one guard hands over to another', () => {
    const n = nav();
    const s = createGuardStack(n);
    const closeScreen = s.register({ run: () => {}, web: true });
    s.register({ run: () => {}, web: true }); // the editor arrives...
    closeScreen(); // ...and the screen stands down, in the same commit
    expect(n.pushes).toBe(0);
  });

  it('costs nothing when the last guard leaves', () => {
    const n = nav();
    const s = createGuardStack(n);
    s.register({ run: () => {}, web: true })();
    expect(n.pushes).toBe(0);
    expect(s.hasWeb()).toBe(false);
  });

  /** Structural, and the real guarantee: there is no way for this module to move the user at all. */
  it('exposes no way to navigate', () => {
    const n = nav();
    createGuardStack(n);
    expect(Object.keys(n).filter((k) => typeof (n as never)[k] === 'function')).toEqual(['pushSpare']);
  });
});

describe('bookkeeping', () => {
  it('reports whether anything still wants browser backs', () => {
    const s = createGuardStack(nav());
    expect(s.hasWeb()).toBe(false);
    const off = s.register({ run: () => {}, web: true });
    expect(s.hasWeb()).toBe(true);
    off();
    expect(s.hasWeb()).toBe(false);
  });

  it('ignores a guard disarmed twice', () => {
    const s = createGuardStack(nav());
    const a = jest.fn();
    const off = s.register({ run: a, web: true });
    s.register({ run: () => {}, web: true });
    off();
    off();
    expect(s.hasWeb()).toBe(true); // the second call must not remove somebody else's guard
  });
});
