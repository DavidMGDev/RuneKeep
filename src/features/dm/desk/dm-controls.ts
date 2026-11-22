/**
 * The DM screen's seven control dice and what a card's menu offers (v0.49.0).
 *
 * Each die is a group, and a click (or the wheel over it) opens it in the deck die's own menu. Every row runs the
 * handler the phone's button runs, through the screen in the port, so there is one implementation of each.
 */
import { FAVORITES_CATEGORY } from '@/lib/favorites';
import type { MenuSpec, TableRow } from '@/features/character-sheet/table/context-menu';
import { MENU_ICON } from '@/features/character-sheet/table/menu-icons';
import type { TableAction, TableOption } from '@/features/character-sheet/table/table-dice';
import type { DmTable } from '@/lib/dm-table';
import { initialVitals, memberMaxes } from '@/lib/dm-vitals';
import { type Encounter, fighters } from '@/lib/session';
import { isPresent, type VitalKey } from '@/lib/party';

import { combatantCardId, encounterCardId, memberCardId, memberNow, templateCardId, vitalStats } from './dm-cards';
import type { DmView, EncounterApi, PartyApi, SessionApi, Side } from './dm-desk';
import type { DmRecords } from './use-dm-records';

export type SortBy = 'az' | 'za' | 'tier' | 'difficulty' | 'hp' | 'own';

export interface ControlsEnv {
  records: DmRecords;
  table: DmTable;
  view: DmView;
  /** Whether that screen is up, on either side. */
  shown: (view: DmView) => boolean;
  /** The encounter the table is showing. */
  enc: Encounter | null;
  category: string;
  muted: boolean;
  open: (view: DmView, encounterId?: string) => void;
  /** Run with that screen's handlers, bringing it to the port first if it is not there. */
  inEncounter: (run: (api: EncounterApi) => void) => void;
  inSession: (run: (api: SessionApi) => void) => void;
  inParty: (run: (api: PartyApi) => void) => void;
  go: { sessions: () => void; campaigns: () => void; archive: () => void };
  sort: (by: SortBy) => void;
  newDeck: () => void;
  renameDeck: () => void;
  deleteDeck: () => void;
  toggleFear: () => void;
  toggleMute: () => void;
  dice: () => void;
  guide: () => void;
  counters: { open: (start?: { cid?: string }) => void; add: () => void; showAll: (cid: string) => void; out: number };
}

const onOff = (on: boolean) => (on ? 'On' : 'Off');

export function controlDice(e: ControlsEnv): TableAction[] {
  const { enc, records, table, view } = e;
  const noFight = !enc;
  const count = records.encounters.length;
  const customDeck = table.decks.some((d) => d.key === e.category);

  const lifecycle: TableOption = enc?.status === 'active'
    ? { key: 'finish', label: 'Finish encounter', glyph: 'finish', onPress: () => e.inEncounter((a) => a.finish()) }
    : enc?.status === 'completed'
      ? { key: 'restart', label: 'Restart encounter', glyph: 'reset', onPress: () => e.inEncounter((a) => a.restart()) }
      : { key: 'start', label: 'Start encounter', glyph: 'start', disabled: noFight, onPress: () => e.inEncounter((a) => a.start()) };

  return [
    {
      key: 'dm-screen', label: 'Screen', glyph: 'screen', verb: 'Change screen', sides: ['fight', 'party', 'book', 'exit'],
      menu: () => [
        { key: 'session', label: 'Encounters', glyph: 'log', sub: String(count), on: view === 'session', onPress: () => e.open('session') },
        { key: 'encounter', label: 'This encounter', glyph: 'fight', disabled: noFight, on: view === 'encounter', onPress: () => enc && e.open('encounter', enc.id) },
        { key: 'party', label: 'Party sheet', glyph: 'party', on: e.shown('party'), onPress: () => e.open('party') },
        { key: 'cast', label: 'Cast', glyph: 'edit', on: e.shown('cast'), onPress: () => e.open('cast') },
        { key: 'library', label: 'Adversary library', glyph: 'book', on: view === 'library', onPress: () => e.open('library') },
        { key: 'archive', label: 'Card archive', glyph: 'cards', onPress: e.go.archive },
        { key: 'sessions', label: 'All sessions', glyph: 'move', onPress: e.go.sessions },
        { key: 'campaigns', label: 'Campaigns', glyph: 'exit', onPress: e.go.campaigns },
      ],
    },
    {
      key: 'dm-fight', label: 'Encounter', glyph: 'fight', verb: 'Run the encounter', sides: ['start', 'finish', 'copy', 'add'],
      menu: () => [
        lifecycle,
        { key: 'new', label: 'New encounter', glyph: 'add', onPress: () => e.inSession((a) => a.create()) },
        { key: 'options', label: 'Options', glyph: 'state', disabled: noFight, onPress: () => e.inEncounter((a) => a.options()) },
        { key: 'details', label: 'Edit details', glyph: 'edit', disabled: noFight, onPress: () => enc && e.inSession((a) => a.edit(enc.id)) },
        { key: 'duplicate', label: 'Duplicate', glyph: 'copy', disabled: noFight, onPress: () => enc && e.inSession((a) => a.duplicate(enc.id)) },
        { key: 'send', label: 'Move or copy', glyph: 'move', disabled: noFight, onPress: () => enc && e.inSession((a) => a.move(enc.id)) },
        { key: 'delete', label: 'Delete encounter', glyph: 'bin', disabled: noFight, onPress: () => enc && e.inSession((a) => a.remove(enc.id)) },
      ],
    },
    {
      key: 'dm-party', label: 'Party', glyph: 'party', verb: 'Manage the party', sides: ['add', 'state', 'book', 'sort'],
      menu: () => [
        { key: 'mods', label: 'Party modifiers', glyph: 'state', sub: String(records.party?.globalEffects?.length ?? 0), onPress: () => e.inParty((a) => a.partyModifiers()) },
        { key: 'add', label: 'Add characters', glyph: 'add', onPress: () => e.inParty((a) => a.add()) },
        { key: 'cast', label: 'Who is here', glyph: 'check', onPress: () => e.open('cast') },
        { key: 'npc', label: 'Add an NPC', glyph: 'party', disabled: noFight, onPress: () => e.inEncounter((a) => a.addNpc()) },
        { key: 'allies', label: 'Ally from library', glyph: 'book', disabled: noFight, onPress: () => e.inEncounter((a) => a.library('ally')) },
        { key: 'order', label: 'Reorder allies', glyph: 'sort', disabled: !enc || enc.allies.length < 2, onPress: () => e.inEncounter((a) => a.reorder('ally')) },
      ],
    },
    {
      key: 'dm-foes', label: 'Foes', glyph: 'foe', verb: 'Manage the adversaries', sides: ['add', 'book', 'info', 'sort'],
      menu: () => [
        { key: 'spawn', label: 'Spawn from library', glyph: 'book', disabled: noFight, onPress: () => e.inEncounter((a) => a.library('adversary')) },
        { key: 'blank', label: 'Blank adversary', glyph: 'add', disabled: noFight, onPress: () => e.inEncounter((a) => a.addAdversary()) },
        { key: 'order', label: 'Reorder adversaries', glyph: 'sort', disabled: !enc || enc.adversaries.length < 2, onPress: () => e.inEncounter((a) => a.reorder('adversary')) },
        { key: 'library', label: 'Browse the library', glyph: 'cards', onPress: () => e.open('library') },
        { key: 'guide', label: 'Adversary guide', glyph: 'info', onPress: e.guide },
      ],
    },
    {
      key: 'dm-log', label: 'Log', glyph: 'log', verb: 'Use the log', sides: ['note', 'check', 'edit', 'party'],
      menu: () => [
        { key: 'open', label: 'Open the log', glyph: 'log', disabled: noFight, sub: enc ? String(enc.log.length) : '', onPress: () => e.inEncounter((a) => a.log()) },
        { key: 'write', label: 'Add to the log', glyph: 'edit', disabled: noFight, onPress: () => e.inEncounter((a) => a.log(true)) },
        { key: 'auto', label: 'Auto-log changes', glyph: 'check', disabled: noFight, sub: enc ? onOff(enc.options.autoLog) : '', onPress: () => e.inEncounter((a) => a.toggleAutoLog()) },
        { key: 'share', label: 'Share vitals', glyph: 'party', disabled: noFight, sub: enc ? onOff(enc.options.globalSync) : '', onPress: () => e.inEncounter((a) => a.toggleSync()) },
      ],
    },
    {
      key: 'dm-cards', label: 'Cards', glyph: 'cards', verb: 'Arrange the decks', sides: ['sort', 'add', 'edit', 'bin'],
      menu: () => {
        const fixed = e.category === FAVORITES_CATEGORY;
        return [
          { key: 'az', label: 'Sort A to Z', glyph: 'sort', disabled: fixed, onPress: () => e.sort('az') },
          { key: 'za', label: 'Sort Z to A', glyph: 'sort', disabled: fixed, onPress: () => e.sort('za') },
          { key: 'tier', label: 'Sort by tier', glyph: 'sort', disabled: fixed, onPress: () => e.sort('tier') },
          { key: 'difficulty', label: 'Sort by difficulty', glyph: 'sort', disabled: fixed, onPress: () => e.sort('difficulty') },
          { key: 'hp', label: 'Sort by hit points', glyph: 'sort', disabled: fixed, onPress: () => e.sort('hp') },
          { key: 'own', label: 'Original order', glyph: 'reset', disabled: !table.order[e.category], onPress: () => e.sort('own') },
          { key: 'new', label: 'New category', glyph: 'add', onPress: e.newDeck },
          { key: 'rename', label: 'Rename category', glyph: 'edit', disabled: !customDeck, onPress: e.renameDeck },
          { key: 'delete', label: 'Delete category', glyph: 'bin', disabled: !customDeck, onPress: e.deleteDeck },
        ];
      },
    },
    {
      key: 'dm-tools', label: 'Tools', glyph: 'settings', verb: 'Open the tools', sides: ['counter', 'fear', 'roll', 'cards'],
      menu: () => [
        { key: 'counters', label: 'Counters', glyph: 'counter', sub: String(e.counters.out), onPress: () => e.counters.open() },
        { key: 'newCounter', label: 'New counter', glyph: 'add', onPress: () => e.counters.add() },
        { key: 'fear', label: 'Fear tracker', glyph: 'fear', sub: onOff(table.fear.on), onPress: e.toggleFear },
        { key: 'dice', gap: true, label: 'Dice tray', glyph: 'roll', onPress: e.dice },
        { key: 'archive', label: 'Card archive', glyph: 'cards', onPress: e.go.archive },
        { key: 'mute', label: 'Mute UI sounds', glyph: 'mute', sub: onOff(e.muted), onPress: e.toggleMute },
      ],
    },
  ];
}

const VITALS: [key: VitalKey, label: string, short: string, icon: string][] = [
  ['hp', 'Set Hit Points', 'HP', MENU_ICON.hp], ['armor', 'Set Armor', 'Armor', MENU_ICON.armor],
  ['stress', 'Set Stress', 'Stress', MENU_ICON.stress], ['hope', 'Set Hope', 'Hope', MENU_ICON.hope],
];
/** Four buttons, each showing where it stands. `now` is in the order of VITALS, as the card prints them. */
const vitalRows = (now: [string, string][], set: (key: VitalKey) => void): TableRow[] =>
  VITALS.map(([key, label, short, icon], i) => ({ label, short, icon, quick: true, value: now[i]?.[1], onPress: () => set(key) }));

const STATUS: Record<Encounter['status'], string> = { prepared: 'Prepared', active: 'Running', completed: 'Finished' };

/** Whose menu it is: the card's own name, and what it is. */
export function cardHead(e: ControlsEnv, id: string): Omit<MenuSpec, 'rows'> {
  const { records, enc } = e;
  const fight = records.encounters.find((x) => encounterCardId(x.id) === id);
  if (fight) return { title: fight.name, detail: STATUS[fight.status], icon: MENU_ICON.fight };
  const template = records.saved.find((x) => templateCardId(x.id) === id);
  if (template) return { title: template.name, detail: 'Saved', icon: MENU_ICON.save };
  const member = records.party?.memberIds.find((m) => memberCardId(m) === id);
  if (records.party && member) {
    return { title: records.files[member]?.name ?? 'Character', detail: isPresent(records.party, member) ? 'Party' : 'Away', icon: MENU_ICON.cards };
  }
  const c = enc ? fighters(enc).find((x) => combatantCardId(x.id) === id) : undefined;
  if (!c) return { title: 'Card', icon: MENU_ICON.cards };
  const foe = enc!.adversaries.some((x) => x.id === c.id);
  return { title: c.name, detail: c.fallen ? 'Fallen' : foe ? 'Adversary' : 'Ally', icon: foe ? MENU_ICON.fight : MENU_ICON.addAlly };
}

/** What a card in the hand or on the felt can have done to it. */
export function cardRows(e: ControlsEnv, id: string): TableRow[] {
  const { enc, records } = e;

  const fight = records.encounters.find((x) => encounterCardId(x.id) === id);
  if (fight) {
    return [
      { label: 'Open encounter', icon: MENU_ICON.open, gap: true, onPress: () => e.open('encounter', fight.id) },
      { label: 'Edit its details', icon: MENU_ICON.edit, onPress: () => e.inSession((a) => a.edit(fight.id)) },
      { label: 'Duplicate it', icon: MENU_ICON.duplicate, onPress: () => e.inSession((a) => a.duplicate(fight.id)) },
      { label: 'Move or copy to a session', icon: MENU_ICON.toSession, onPress: () => e.inSession((a) => a.move(fight.id)) },
      { label: 'Delete encounter', icon: MENU_ICON.bin, danger: true, onPress: () => e.inSession((a) => a.remove(fight.id)) },
    ];
  }

  const template = records.saved.find((x) => templateCardId(x.id) === id);
  if (template) {
    return [
      { label: 'Add as an adversary', icon: MENU_ICON.addFoe, gap: true, disabled: !enc, onPress: () => e.inEncounter((a) => a.spawn(template.id, 'adversary')) },
      { label: 'Add as an ally', icon: MENU_ICON.addAlly, disabled: !enc, onPress: () => e.inEncounter((a) => a.spawn(template.id, 'ally')) },
    ];
  }

  const party = records.party;
  const member = party?.memberIds.find((m) => memberCardId(m) === id);
  if (party && member) {
    // Only the running encounter and the party sheet may change a member's vitals.
    const inFight = enc?.status === 'active' && enc.allies.some((a) => a.kind === 'member' && a.charId === member);
    return [
      ...(records.files[member]
        ? vitalRows((({ vitals, maxes }) => vitalStats(vitals, maxes))(memberNow(records.files[member], party, enc)),
            (key) => (inFight ? e.inEncounter((a) => a.setVital(member, key, true)) : e.inParty((a) => a.setVital(member, key))))
        : []),
      { label: 'Their modifiers', icon: MENU_ICON.modifiers, gap: true, onPress: () => (inFight ? e.inEncounter((a) => a.modifiers(member)) : e.inParty((a) => a.modifiers(member))) },
      { label: 'Their cards', icon: MENU_ICON.cards, onPress: () => (inFight ? e.inEncounter((a) => a.cards(member)) : e.inParty((a) => a.cards(member))) },
      { label: isPresent(party, member) ? 'Mark as away' : 'Mark as present', icon: isPresent(party, member) ? MENU_ICON.away : MENU_ICON.present, onPress: () => (inFight ? e.inEncounter((a) => a.presence(member)) : e.inParty((a) => a.presence(member))) },
    ];
  }

  if (!enc) return [];
  const foe = enc.adversaries.find((c) => combatantCardId(c.id) === id);
  const npc = enc.allies.flatMap((a) => (a.kind === 'npc' && combatantCardId(a.combatant.id) === id ? [a.combatant] : []))[0];
  const c = foe ?? npc;
  if (!c) return [];
  const side: Side = foe ? 'adversary' : 'ally';
  const file = c.charId ? records.files[c.charId] : undefined;
  const move: TableRow = { label: foe ? 'Make it an ally' : 'Make it an adversary', icon: MENU_ICON.swap, gap: true, onPress: () => e.inEncounter((a) => a.convert(c.id, side)) };
  const remove: TableRow = { label: 'Remove from encounter', icon: MENU_ICON.remove, danger: true, onPress: () => e.inEncounter((a) => a.remove(c.id, side)) };
  const save: TableRow = { label: 'Save to my library', icon: MENU_ICON.save, onPress: () => e.inEncounter((a) => a.saveTemplate(c.id)) };
  if (file) {
    return [
      ...vitalRows(vitalStats(enc.charVitals?.[file.id] ?? initialVitals(file), memberMaxes(file)), (key) => e.inEncounter((a) => a.setVital(file.id, key, false))),
      { label: 'Their modifiers', icon: MENU_ICON.modifiers, gap: true, onPress: () => e.inEncounter((a) => a.modifiers(file.id)) },
      { label: 'Their cards', icon: MENU_ICON.cards, onPress: () => e.inEncounter((a) => a.cards(file.id)) },
      move,
      ...(foe ? [save] : []),
      remove,
    ];
  }
  const tracked = c.counters?.length ?? 0;
  return [
    ...(c.maxHp ? [{ label: 'Set Hit Points', short: 'HP', icon: MENU_ICON.hp, quick: true, value: `${c.hp ?? 0}/${c.maxHp}`, onPress: () => e.inEncounter((a) => a.setStat(c.id, 'hp')) }] : []),
    ...(c.maxStress ? [{ label: 'Set Stress', short: 'Stress', icon: MENU_ICON.stress, quick: true, value: `${c.stress ?? 0}/${c.maxStress}`, onPress: () => e.inEncounter((a) => a.setStat(c.id, 'stress')) }] : []),
    c.fallen
      ? { label: 'Recover', icon: MENU_ICON.recover, quick: true, onPress: () => e.inEncounter((a) => a.recover(c.id)) }
      : { label: 'Mark as fallen', short: 'Mark fallen', icon: MENU_ICON.fallen, quick: true, onPress: () => e.inEncounter((a) => a.fell(c.id)) },
    { label: 'Edit stat block', icon: MENU_ICON.edit, gap: true, onPress: () => e.inEncounter((a) => a.edit(c.id)) },
    { label: 'Counters', icon: MENU_ICON.counters, value: tracked ? String(tracked) : undefined, onPress: () => e.counters.open({ cid: c.id }) },
    ...(tracked ? [{ label: 'Put its counters on the table', icon: MENU_ICON.counter, onPress: () => e.counters.showAll(c.id) }] : []),
    ...(c.portraitUri ? [{ label: 'See the picture', icon: MENU_ICON.picture, onPress: () => e.inEncounter((a) => a.image(c.id)) }] : []),
    move,
    save,
    ...(c.charId ? [] : [{ label: 'Characterize', icon: MENU_ICON.characterize, value: 'Full sheet', onPress: () => e.inEncounter((a) => a.characterize(c.id, side)) }]),
    remove,
  ];
}
