import { buildDeckJobs } from '@/features/character-sheet/sheet/deck-jobs';
import { dmDecks } from '@/features/dm/dm-decks';
import { classLabel, type CharacterFile, parseCharacterFile, serializeCharacterFile, toSheetCharacter } from './character-file';
import { classTitlesIn } from './class-links';
import { dressedForClass } from './class-identity';
import type { LibraryCard } from './library';
import { bundledClassOf, customClassFeatures, customClassPages, hasBeastform, withClassCards } from './played-class';
import { restMoveLimit } from './rest';

/**
 * The report (v0.43.3): a Shaman carried by Druid read "LVL 1 DRUID", held the Druid's pages and kit,
 * and found its own class card and pages in the Inventory.
 */
const spec = { startingEvasion: 11, startingHp: 7, hopeFeature: { name: '', text: '' }, summary: 'Healers', domains: ['sage', 'splendor'], fixedItemIds: [], choiceAItemIds: [], choiceBItemIds: [] };
const base: LibraryCard = { id: 'shaman', contentType: 'class', title: 'Shaman', text: '', imageUri: null, color: '#3a7', classSpec: { ...spec, role: 'base' } };
const page = (id: string): LibraryCard => ({ id, contentType: 'class', title: '', text: 'Medicinal Knowledge', imageUri: null, className: 'Shaman', classSpec: { ...spec, role: 'page' } });

const file = (over: Partial<CharacterFile> = {}): CharacterFile => ({
  schemaVersion: 1,
  id: 'c1',
  createdAt: '2026-10-30T00:00:00.000Z',
  name: 'Pinga',
  portraitUri: null,
  className: 'druid',
  subclassCardId: 'subclass-warden-of-the-elements-1-foundation',
  ancestryCardId: 'ancestry-elf',
  communityCardId: 'community-loreborne',
  domainCardIds: [],
  traits: { agility: 0, strength: 0, finesse: 0, instinct: 0, presence: 0, knowledge: 0 },
  experiences: [],
  level: 1,
  gold: { handfuls: 1, bags: 0, chest: 0 },
  ...over,
} as CharacterFile);

const shaman = file({ customClassId: 'shaman', libraryCards: [base, page('p1'), page('p2')], classExpanded: true });

describe('a homebrew class on its carrier', () => {
  it('reads as itself, with its own numbers', () => {
    const sheet = toSheetCharacter(shaman);
    expect(classLabel(shaman)).toBe('Shaman');
    expect(sheet.className).toBe('Shaman');
    expect(sheet.domains).toEqual(['Sage', 'Splendor']);
    expect(sheet.evasion).toBe(11);
    expect(sheet.maxHp).toBe(7);
  });

  it('is not the class it is carried by', () => {
    expect(bundledClassOf(shaman)).toBeUndefined();
    expect(hasBeastform(shaman)).toBe(false);
    expect(hasBeastform({ ...shaman, multiclassName: 'druid' })).toBe(true);
  });

  it('holds no carrier cards and no carrier kit', () => {
    const jobs = buildDeckJobs(shaman);
    expect(jobs.classJob).toBeNull();
    expect(jobs.featJobs).toEqual([]);
    expect(jobs.invJobs).toEqual([]);
    expect(jobs.wildshapeFaceJobs).toEqual([]);
  });

  it('gives its pages the class title and leaves the class card out of play', () => {
    expect(customClassPages(shaman).map((p) => p.title)).toEqual(['Shaman', 'Shaman']);
    const decks = dmDecks(shaman);
    expect(decks.abilities.map((c) => c.id)).toEqual(expect.arrayContaining(['p1', 'p2']));
    expect(decks.inventory.map((c) => c.id)).not.toEqual(expect.arrayContaining(['shaman']));
    expect(decks.inventory.map((c) => c.id)).not.toContain('p1');
  });
});

describe('Celestial Trance on the sheet', () => {
  it('gives an equipped Elf a third downtime move, which is why forge equips origin passives', () => {
    expect(restMoveLimit(toSheetCharacter(file({ enabledCardIds: ['ancestry-elf'] })).restMoves)).toBe(3);
    expect(restMoveLimit(toSheetCharacter(file()).restMoves)).toBe(2);
  });
});

describe('a bundled class', () => {
  it('keeps every lookup it had', () => {
    const druid = file();
    expect(bundledClassOf(druid)).toBe('druid');
    expect(hasBeastform(druid)).toBe(true);
    expect(toSheetCharacter(druid).className).toBe('Druid');
    expect(buildDeckJobs(druid).featJobs.length).toBeGreaterThan(0);
    expect(buildDeckJobs(druid).invJobs.length).toBeGreaterThan(0);
  });

  it('falls back to its carrier if the homebrew card is missing from the file', () => {
    expect(bundledClassOf(file({ customClassId: 'gone' }))).toBe('druid');
  });
});

/**
 * The report (v0.43.4): "Vodou Healing Powers" never reached a Shaman's Arsenal, and an existing
 * Shaman read as Druid with its pages in the Inventory, because loading the file stripped the class.
 */
describe('a Shaman that survives being saved and loaded', () => {
  const vodou: LibraryCard = { id: 'vodou', contentType: 'feature', title: 'Vodou Healing Powers', text: '', imageUri: null, className: 'Shaman', functions: [{ id: 'f1', kind: 'counter', title: 'Charges' } as never] };
  const rite: LibraryCard = { id: 'rite', contentType: 'feature', title: 'Bone Rite', text: '', imageUri: null, className: 'Shaman', linkSubclass: 'Bonecaller', functionCategory: { key: 'fc-rites', label: 'Rites', icon: 'leaf' } };
  const bard: LibraryCard = { id: 'bardish', contentType: 'feature', title: 'Song', text: '', imageUri: null, className: 'Bard' };
  const bonecaller: LibraryCard = { id: 'bc1', contentType: 'subclass', title: 'Bonecaller', text: '', imageUri: null, className: 'Shaman', tier: 1 };
  const pack = [base, page('p1'), page('p2'), vodou, rite, bard, bonecaller];

  it('keeps its class spec, counters and element sections through a load', () => {
    const withElement = { ...vodou, sections: [{ body: '', functionId: 'f1', align: 'center' as const }] };
    const loaded = parseCharacterFile(serializeCharacterFile({ ...shaman, domainCardIds: [], libraryCards: [base, page('p1'), withElement] }));
    expect(classLabel(loaded)).toBe('Shaman');
    expect(customClassPages(loaded).map((p) => p.id)).toEqual(['p1']);
    const held = loaded.libraryCards!.find((c) => c.id === 'vodou')!;
    expect(held.functions?.[0].id).toBe('f1');
    expect(held.sections?.[0]).toMatchObject({ functionId: 'f1', align: 'center' });
  });

  it('gets back what an older load stripped, from the installed pack', () => {
    const stripped = { ...shaman, libraryCards: shaman.libraryCards!.map(({ classSpec: _, ...c }) => c as LibraryCard) };
    expect(classLabel(stripped)).toBe('Druid');
    const whole = withClassCards(stripped, pack);
    expect(classLabel(whole)).toBe('Shaman');
    expect(customClassPages(whole).map((p) => p.id)).toEqual(['p1', 'p2']);
  });

  it('is handed its whole-class feature cards, and only its own subclass ones', () => {
    const whole = withClassCards(shaman, pack);
    expect(customClassFeatures(whole).map((c) => c.id)).toEqual(['vodou']);
    expect(dmDecks(whole).abilities.map((c) => c.id)).toContain('vodou');
    expect(dmDecks(whole).inventory.map((c) => c.id)).not.toContain('vodou');
    const boned = withClassCards({ ...shaman, subclassCardId: 'bc1', libraryCards: [...shaman.libraryCards!, bonecaller] }, pack);
    expect(customClassFeatures(boned).map((c) => c.id)).toEqual(['vodou', 'rite']);
    expect(boned.customCategories).toEqual([{ id: 'fc-rites', label: 'Rites', icon: 'leaf' }]);
    expect(boned.cardCategory?.rite).toBe('fc-rites');
  });

  it('changes nothing the second time, so opening the sheet does not save every time', () => {
    const once = withClassCards(shaman, pack);
    expect(withClassCards(once, pack)).toBe(once);
    expect(withClassCards(file(), pack)).toEqual(file());
  });

  it('wears its class banner on a feature card', () => {
    const banner = { ...page('p1'), imageUri: 'banner.png' };
    const dressed = dressedForClass(vodou, [base, banner]);
    expect(dressed.imageUri).toBe('banner.png');
    expect(dressed.title).toBe('Vodou Healing Powers');
  });
});

describe('the class chips in the card editor', () => {
  it('name each class once, never its pages', () => {
    expect(classTitlesIn([base, page('p1'), { ...page('p2'), title: 'Shaman' }, { ...base, id: 'dup', title: 'shaman ' }])).toEqual(['Shaman']);
  });
});
