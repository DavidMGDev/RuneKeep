/**
 * The browser write queue (v0.33.1).
 *
 * Web used to take an early return in `saveCharacter` that read the whole roster back out of storage,
 * parsed it, spliced one character in and re-serialized ALL of it, synchronously, on every save. A
 * save happens on every token dropped and every die tapped, so placing a token in a browser froze for
 * about a second while the same gesture was instant in the app.
 *
 * These pin the two halves of the fix: a save does not touch storage on its own, and nothing can
 * observe a queued character as stale in the meantime.
 */
import type { CharacterFile } from './character-file';
import { deleteCharacter, flushCharacters, getCharacter, listCharacters, saveCharacter } from './character-store';

jest.mock('react-native', () => ({ Platform: { OS: 'web' } }));

const mockStore = new Map<string, string>();
const mockState = { writes: 0 };
jest.mock('./web-store', () => ({
  webGet: (k: string) => mockStore.get(k) ?? null,
  webSet: (k: string, v: string) => {
    mockState.writes += 1;
    mockStore.set(k, v);
  },
}));

// The share path drags in expo modules this test has no use for.
jest.mock('./image-embed', () => ({ embedCharacterImages: async (f: unknown) => f }));
jest.mock('./library-store', () => ({ canShareFiles: () => false, webShareFile: () => null }));

const mk = (id: string, name: string): CharacterFile =>
  ({ schemaVersion: 1, id, createdAt: '2026-01-01T00:00:00.000Z', name, className: 'Wizard', level: 1, domainCardIds: [] }) as unknown as CharacterFile;

beforeEach(() => {
  flushCharacters(); // drain the previous test's queue BEFORE clearing, or it lands in this one
  mockStore.clear();
  mockState.writes = 0;
});

describe('saving in a browser', () => {
  it('does not write on every save', async () => {
    for (let i = 0; i < 20; i += 1) await saveCharacter(mk('c1', `Take ${i}`));
    expect(mockState.writes).toBe(0);
    flushCharacters();
    expect(mockState.writes).toBe(1);
  });

  it('reads back the queued version, not the stale one in storage', async () => {
    await saveCharacter(mk('c1', 'Old'));
    flushCharacters();
    await saveCharacter(mk('c1', 'New'));
    expect((await getCharacter('c1'))?.name).toBe('New');
    expect((await listCharacters()).map((c) => c.name)).toEqual(['New']);
  });

  it('lists a character that has never reached storage', async () => {
    await saveCharacter(mk('c2', 'Fresh'));
    expect((await listCharacters()).map((c) => c.name)).toEqual(['Fresh']);
  });

  it('never resurrects a character deleted while a write was queued', async () => {
    await saveCharacter(mk('c3', 'Doomed'));
    await deleteCharacter('c3');
    flushCharacters();
    expect(await getCharacter('c3')).toBeNull();
    expect(await listCharacters()).toEqual([]);
  });
});
