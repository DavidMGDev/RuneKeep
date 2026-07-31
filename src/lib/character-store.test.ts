/**
 * The write queue (v0.27.4).
 *
 * Saving a character serializes the whole file, history included, and writes it synchronously,
 * because expo-file-system's modern API has no asynchronous write. Doing that on every tap is a
 * large part of why the app felt slower than the browser build, so writes are now coalesced.
 *
 * Coalescing a persistence path is only safe if a queued character is invisible as stale and can
 * never be lost, which is what these check.
 */
const mockDisk = new Map<string, string>();
const mockState = { writes: 0 };

jest.mock('expo-file-system', () => {
  class File {
    name: string;
    constructor(dirOrUri: unknown, name?: string) {
      this.name = name ?? String(dirOrUri);
    }
    get exists() {
      return mockDisk.has(this.name);
    }
    write(content: string) {
      mockState.writes += 1;
      mockDisk.set(this.name, content);
    }
    textSync() {
      return mockDisk.get(this.name) ?? '';
    }
    delete() {
      mockDisk.delete(this.name);
    }
  }
  class Directory {
    exists = true;
    create() {}
    list() {
      return [...mockDisk.keys()].map((n) => new File(null, n));
    }
  }
  return { File, Directory, Paths: { document: 'doc', cache: 'cache' } };
});

import { type CharacterFile } from './character-file';
import { deleteCharacter, flushCharacters, getCharacter, listCharacters, saveCharacter } from './character-store';

function mk(id: string, name: string): CharacterFile {
  return {
    schemaVersion: 1,
    id,
    createdAt: '2026-01-01T00:00:00.000Z',
    name,
    className: 'warrior',
    level: 1,
  } as unknown as CharacterFile;
}

beforeEach(() => {
  mockDisk.clear();
  mockState.writes = 0;
  jest.useFakeTimers();
});
afterEach(() => {
  flushCharacters();
  jest.useRealTimers();
});

it('does not touch the disk on every save', async () => {
  for (let i = 0; i < 8; i++) await saveCharacter(mk('c1', `n${i}`));
  expect(mockState.writes).toBe(0);
  jest.advanceTimersByTime(400);
  expect(mockState.writes).toBe(1); // eight taps, one write
});

it('reads back the queued version, not the stale one on disk', async () => {
  await saveCharacter(mk('c1', 'Old'));
  flushCharacters();
  await saveCharacter(mk('c1', 'New'));
  expect((await getCharacter('c1'))?.name).toBe('New');
  expect((await listCharacters()).map((c) => c.name)).toEqual(['New']);
});

it('lists a character that has never reached the disk', async () => {
  await saveCharacter(mk('c1', 'Fresh'));
  expect((await listCharacters()).map((c) => c.name)).toEqual(['Fresh']);
});

it('writes everything queued when the app backgrounds', async () => {
  await saveCharacter(mk('c1', 'One'));
  await saveCharacter(mk('c2', 'Two'));
  flushCharacters();
  expect(mockState.writes).toBe(2);
  expect(mockDisk.has('c1.json')).toBe(true);
  expect(mockDisk.has('c2.json')).toBe(true);
});

it('never resurrects a character deleted while a write was queued', async () => {
  await saveCharacter(mk('c1', 'Doomed'));
  await deleteCharacter('c1');
  jest.advanceTimersByTime(400);
  flushCharacters();
  expect(mockDisk.has('c1.json')).toBe(false);
  expect(await getCharacter('c1')).toBeNull();
  expect(await listCharacters()).toEqual([]);
});
