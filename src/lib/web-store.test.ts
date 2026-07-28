import { hydrateWebStore, resetWebStore, webBackend, webGet, webRemove, webSet } from './web-store';

/**
 * Jest runs with `Platform.OS === 'ios'`, so `hydrateWebStore` short-circuits and the backend stays
 * on the `localStorage` path. That is exactly the branch worth pinning: it is what a browser with
 * IndexedDB blocked falls back to, and if it is broken the app loses data silently rather than
 * loudly. The IndexedDB path needs a real browser and is checked by running the export.
 */
describe('web store', () => {
  beforeEach(() => {
    resetWebStore();
    globalThis.localStorage?.clear?.();
  });

  it('reads back what it wrote, in the same tick', () => {
    webSet('runekeep.characters', '[{"id":"a"}]');
    expect(webGet('runekeep.characters')).toBe('[{"id":"a"}]');
  });

  it('answers null for a key nothing has written', () => {
    expect(webGet('runekeep.characters')).toBeNull();
  });

  it('forgets a removed key rather than returning a stale value', () => {
    webSet('runekeep.draft', '{"x":1}');
    webRemove('runekeep.draft');
    expect(webGet('runekeep.draft')).toBeNull();
  });

  it('overwrites rather than appending', () => {
    webSet('runekeep.parties', 'one');
    webSet('runekeep.parties', 'two');
    expect(webGet('runekeep.parties')).toBe('two');
  });

  it('resolves hydration off web without touching a browser API', async () => {
    await expect(hydrateWebStore()).resolves.toBeUndefined();
  });

  it('reports the fallback backend when IndexedDB never opened', () => {
    expect(webBackend()).toBe('local');
  });

  it('survives a write when localStorage itself throws, which is the quota case', () => {
    const store = globalThis.localStorage;
    Object.defineProperty(globalThis, 'localStorage', {
      configurable: true,
      value: {
        setItem: () => {
          throw new Error('QuotaExceededError');
        },
        getItem: () => null,
        removeItem: () => {},
      },
    });
    expect(() => webSet('runekeep.characters', 'big')).not.toThrow();
    // The session still has it, which is the difference between a slow failure and a lost edit.
    expect(webGet('runekeep.characters')).toBe('big');
    Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: store });
  });
});
