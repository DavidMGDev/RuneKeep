import type { CharacterFile } from './character-file';
import { serializeRkp } from './rkp';
import { friendlyError, routeIncoming } from './rkp-route';

function character(over: Partial<CharacterFile> = {}): CharacterFile {
  return {
    schemaVersion: 1,
    id: 'ch-aeliana',
    createdAt: '2026-01-01T00:00:00.000Z',
    name: 'Aeliana',
    className: 'guardian',
    subclassCardId: 'subclass-stalwart-1-foundation',
    ancestryCardId: 'ancestry-giant',
    communityCardId: 'community-wildborne',
    domainCardIds: ['valor-01-1', 'blade-01-1'],
    level: 1,
  } as CharacterFile;
}

const charFile = () => serializeRkp({ kind: 'character', payload: character() });
const expansionFile = () =>
  serializeRkp({ kind: 'expansion', payload: { id: 'exp-1', name: 'Hollow Deep', version: 1, cards: [] } as never });

describe('routeIncoming — a file can arrive at any moment', () => {
  it('offers to import a character when nothing is in progress', () => {
    const r = routeIncoming({ text: charFile(), location: 'idle', existingCharacterIds: [] });
    expect(r).toEqual({ action: 'confirm-character', name: 'Aeliana', replaces: null });
  });

  it('warns when the character would replace one already on the roster', () => {
    // importCharacter writes to `${file.id}.json` with no collision check, so re-importing your own
    // export silently replaced the live character. The user has to be told.
    const r = routeIncoming({ text: charFile(), location: 'idle', existingCharacterIds: ['ch-aeliana'] });
    expect(r).toMatchObject({ action: 'confirm-character', replaces: 'Aeliana' });
  });

  it('offers to install an expansion', () => {
    const r = routeIncoming({ text: expansionFile(), location: 'idle', existingCharacterIds: [] });
    expect(r).toMatchObject({ action: 'confirm-expansion', name: 'Hollow Deep' });
  });

  it('never imports without a confirmation', () => {
    for (const text of [charFile(), expansionFile()]) {
      const r = routeIncoming({ text, location: 'idle', existingCharacterIds: [] });
      expect(r.action.startsWith('confirm')).toBe(true);
    }
  });
});

describe('routeIncoming — deferral protects work in progress', () => {
  it('defers while a character sheet is open', () => {
    const r = routeIncoming({ text: charFile(), location: 'sheet', existingCharacterIds: [] });
    expect(r.action).toBe('defer');
    expect(r).toHaveProperty('reason', expect.stringContaining('main menu'));
  });

  it('defers while a hero is being created', () => {
    const r = routeIncoming({ text: expansionFile(), location: 'creating', existingCharacterIds: [] });
    expect(r.action).toBe('defer');
  });

  it('defers rather than replacing, even when the file collides', () => {
    // The dangerous combination: an overwrite arriving while the user is mid-session on that very
    // character. Deferral has to win over every other branch.
    const r = routeIncoming({ text: charFile(), location: 'sheet', existingCharacterIds: ['ch-aeliana'] });
    expect(r.action).toBe('defer');
  });
});

describe('routeIncoming — cards and bad files', () => {
  it('explains where a single card belongs instead of half-importing it', () => {
    const card = serializeRkp({ kind: 'card', payload: { id: 'lc-1', title: 'Whispering Blade', kind: 'domain' } as never });
    const r = routeIncoming({ text: card, location: 'idle', existingCharacterIds: [] });
    expect(r.action).toBe('explain-card');
    expect(r).toHaveProperty('message', expect.stringContaining('NFC'));
  });

  it('explains a card even mid-session, since nothing is torn down to say so', () => {
    const card = serializeRkp({ kind: 'card', payload: { id: 'lc-1', title: 'X', kind: 'domain' } as never });
    expect(routeIncoming({ text: card, location: 'sheet', existingCharacterIds: [] }).action).toBe('explain-card');
  });

  it('rejects a file that is not JSON', () => {
    const r = routeIncoming({ text: 'this is not json', location: 'idle', existingCharacterIds: [] });
    expect(r.action).toBe('reject');
  });

  it('rejects a JSON file that is not an rkp', () => {
    const r = routeIncoming({ text: JSON.stringify({ hello: 'world' }), location: 'idle', existingCharacterIds: [] });
    expect(r.action).toBe('reject');
  });
});

describe('friendlyError — players never see developer diagnostics', () => {
  const cases: [string, string][] = [
    ['Not a valid RuneKeep file (bad JSON).', 'readable'],
    ['Card 3 missing id', 'damaged card'],
    ['Unknown .rkp content kind: deck', "isn't a RuneKeep file"],
    ['Expansion missing name', 'incomplete'],
    ['Unknown class', 'does not have'],
    ['This character was made by a newer version of RuneKeep. Update the app to open it.', 'Update the app'],
  ];
  it.each(cases)('rewrites %p into something actionable', (raw, expected) => {
    expect(friendlyError(raw)).toContain(expected);
  });

  it('always offers a next step, never a bare failure', () => {
    for (const [raw] of cases) {
      const msg = friendlyError(raw);
      expect(msg.length).toBeGreaterThan(30);
      expect(msg).toMatch(/[.!]$/);
    }
  });

  it('falls back to a plain sentence for anything unrecognised', () => {
    expect(friendlyError('kaboom')).toBe('That file could not be opened.');
  });
});
