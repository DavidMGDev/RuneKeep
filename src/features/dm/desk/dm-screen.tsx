/**
 * The DM screen (v0.49.0, owner): a session on a desktop window.
 *
 * It has the character sheet's shape. The port on the left holds the DM's screens (the encounters, the running one,
 * the party sheet, the cast, the library), everything right of it is the sheet's own play table with every setting
 * it has, and the DM's controls are its dice. There is no map and nothing here runs the game: it is a screen to run
 * one from behind.
 */
import { useIsFocused } from '@react-navigation/native';
import { type Href, useRouter } from 'expo-router';
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import { StyleSheet, View } from 'react-native';

import FullUi from '../../../../assets/art/new/FullUI.svg';

import { LoadingScreen } from '@/components/loading-screen';
import { PopupDialog } from '@/components/popup-dialog';
import { RuneButton } from '@/components/rune-button';
import { showToast } from '@/components/toast';
import { DmRune } from '@/constants/theme';
import { useDesktop } from '@/hooks/use-desktop';
import type { CardItem } from '@/features/character-sheet/card-data';
import type { PlacedToken } from '@/features/character-sheet/components/card-tokens';
import type { DiceTrayHandle } from '@/features/character-sheet/sheet/dice-tray';
import { DM_STARTING_LOOK } from '@/features/character-sheet/table/deck-look';
import { type DeskDice, PlayTable } from '@/features/character-sheet/table/play-table';
import { type TableHost, TableHostContext } from '@/features/character-sheet/table/table-host';
import { removeTemplates, saveAdversaries } from '@/lib/adversary-library';
import { arrangeDecks, DM_DECKS, type DmDeckKey, type DmTable, removeDeck } from '@/lib/dm-table';
import { dmTableOwner, loadDmTable, saveDmTable } from '@/lib/dm-table-store';
import { applyOrder } from '@/lib/encounter-order';
import { FAVORITES_CATEGORY } from '@/lib/favorites';
import type { Party } from '@/lib/party';
import { changeCombatant, type Combatant, type Session, sortedEncounters } from '@/lib/session';
import { getEncounter, saveEncounter } from '@/lib/session-store';
import { playSfx } from '@/lib/sfx';
import { isUiMuted, setUiMuted } from '@/lib/sfx-prefs';

import { AdversaryInfoPanel } from '../adversary-info';
import { AdversaryLibrary } from '../adversary-library-screen';
import { DmDicePanel } from '../dm-dice-panel';
import { NameDialog } from '../dm-ui';
import { EncounterScreen } from '../encounter-screen';
import { PartyEditorScreen } from '../party-editor';
import { PartyOverviewScreen } from '../party-overview';
import { SessionScreen } from '../session-screen';
import { combatantCard, combatantCardId, encounterCard, encounterCardId, memberCard, memberCardId, templateCard, templateCardId } from './dm-cards';
import { cardRows, controlDice, type ControlsEnv, type SortBy } from './dm-controls';
import { type DeskApis, type DmDesk, DmDeskContext, DmSide, type DmView } from './dm-desk';
import { FearTrack } from './fear-track';
import { useDeskCounters } from './use-counters';
import { type DmRecords, useDmRecords } from './use-dm-records';

const EMPTY_DECK: Record<DmDeckKey, string> = {
  'dm-foes': 'No adversaries here yet. Click the Foes die to add some.',
  'dm-party': 'No characters in this campaign yet. Click the Party die to add them.',
  'dm-npcs': 'No NPC allies in this encounter. Click the Party die to add one.',
  'dm-fights': 'No encounters in this session yet. Click the Encounter die to make one.',
  'dm-saved': 'Adversaries you save to your library show here.',
};

const NO_STATES: TableHost['cardStates'] = { permanent: new Set(), modsOff: new Set(), numberInput: new Set(), domain: new Set(), toggleable: new Set(), expandable: new Set() };
const noWatch = () => () => undefined;

export function DmScreen({ sessionId, encounterId }: { sessionId: string; encounterId?: string }) {
  const router = useRouter();
  const records = useDmRecords(sessionId);
  if (!records) return <LoadingScreen dm label="Raising the screen" />;
  const { session, party } = records;
  if (!session || !party) {
    const back = () => router.replace('/parties' as Href);
    return <PopupDialog dm title="Session not found" body="That session, or its campaign, is no longer on this device." confirmLabel="Back to campaigns" cancelLabel="Back to campaigns" onConfirm={back} onCancel={back} />;
  }
  return <Desk key={party.id} records={records} session={session} party={party} startAt={encounterId} />;
}

type Pending = { [K in keyof DeskApis]: { kind: K; id: string; run: (api: DeskApis[K]) => void } }[keyof DeskApis];
type Dialog = { kind: 'newDeck' } | { kind: 'renameDeck'; key: string } | { kind: 'deleteDeck'; key: string } | { kind: 'move'; ids: string[] };

function Desk({ records, session, party, startAt }: { records: DmRecords; session: Session; party: Party; startAt?: string }) {
  const router = useRouter();
  const desktop = useDesktop();
  const focused = useIsFocused();
  const { encounters, files, saved } = records;

  // ---------------------------------------------------------------- what the port shows
  // A session with a fight running opens on the fight; any other, on its encounters.
  const first = startAt ?? session.activeEncounterId ?? null;
  const [view, setView] = useState<DmView>(first && encounters.some((e) => e.id === first) ? 'encounter' : 'session');
  const [encId, setEncId] = useState<string | null>(first);
  /** The encounter the table is about: the one last opened, or the running one, or the newest. */
  const enc = useMemo(
    () => encounters.find((e) => e.id === encId) ?? sortedEncounters(encounters, session.activeEncounterId)[0] ?? null,
    [encounters, encId, session.activeEncounterId],
  );
  const encRef = useRef(enc);
  encRef.current = enc;

  const apis = useRef<Partial<DeskApis>>({});
  const pending = useRef<Pending | null>(null);
  const desk = useMemo<DmDesk>(() => ({
    open: (next, id) => {
      pending.current = null;
      const target = id ?? encRef.current?.id;
      if (next === 'encounter') {
        if (!target) return;
        setEncId(target);
      }
      setView(next);
    },
    register: (kind, api) => {
      if (!api) { delete apis.current[kind]; return; }
      apis.current[kind] = api;
      const job = pending.current;
      if (!job || job.kind !== kind || job.id !== api.id) return;
      pending.current = null;
      // After the screen's own commit: what is run sets state on it.
      queueMicrotask(() => {
        const now = apis.current[kind];
        if (now?.id === job.id) (job.run as (a: typeof now) => void)(now);
      });
    },
  }), []);

  /** Run with a screen's handlers: at once if it is in the port, else once it is. */
  const within = useCallback(<K extends keyof DeskApis>(kind: K, id: string | undefined, run: (api: DeskApis[K]) => void) => {
    if (!id) return;
    const api = apis.current[kind];
    if (api?.id === id) { run(api); return; }
    desk.open(kind, kind === 'encounter' ? id : undefined);
    pending.current = { kind, id, run } as Pending;
  }, [desk]);

  const viewRef = useRef(view);
  viewRef.current = view;
  const writes = useRef<Promise<unknown>>(Promise.resolve());
  /**
   * A counter moved on the table. With the encounter in the port it goes through that screen, which holds the record.
   * With any other screen there nothing holds one, so it is written straight, one write after the other, and the
   * port is left where the DM had it.
   */
  const changeOne = useCallback((id: string, cid: string, fn: (c: Combatant) => Combatant) => {
    if (viewRef.current === 'encounter') { within('encounter', id, (a) => a.change(cid, fn)); return; }
    writes.current = writes.current.then(async () => {
      const now = await getEncounter(id);
      if (now) await saveEncounter(changeCombatant(now, cid, fn));
    }).catch(() => showToast('That change could not be saved. Try it again'));
  }, [within]);

  // The encounter in the port is in the address, so a reload comes back to it.
  useEffect(() => {
    if (!focused) return;
    router.setParams({ encounter: view === 'encounter' && encId ? encId : undefined } as never);
  }, [focused, view, encId, router]);

  // ---------------------------------------------------------------- what this campaign's table remembers
  const [table, setTableState] = useState<DmTable>(() => loadDmTable(party.id));
  const tableRef = useRef(table);
  tableRef.current = table;
  const update = useCallback((change: (t: DmTable) => DmTable) => {
    const next = change(tableRef.current);
    tableRef.current = next;
    setTableState(next);
    saveDmTable(party.id, next);
  }, [party.id]);

  const base = useMemo<Record<DmDeckKey, CardItem[]>>(() => ({
    'dm-foes': enc ? applyOrder(enc.adversaries, enc.order?.adversaries).map((c) => combatantCard(c, 'adversary', files, enc)) : [],
    'dm-party': party.memberIds.flatMap((id) => (files[id] ? [memberCard(files[id], party, enc)] : [])),
    'dm-npcs': enc ? enc.allies.flatMap((a) => (a.kind === 'npc' ? [combatantCard(a.combatant, 'ally', files, enc)] : [])) : [],
    'dm-fights': sortedEncounters(encounters, session.activeEncounterId).map(encounterCard),
    'dm-saved': saved.map(templateCard),
  }), [enc, party, files, encounters, saved, session.activeEncounterId]);
  const decks = useMemo(() => arrangeDecks(base, table), [base, table]);
  const category = decks[table.category] ? table.category : 'dm-foes';

  // ---------------------------------------------------------------- the table's own dialogs
  const [dialog, setDialog] = useState<Dialog | null>(null);
  const [tray, setTray] = useState(false);
  const [guide, setGuide] = useState(false);
  const [muted, setMuted] = useState(isUiMuted);

  const sort = useCallback((by: SortBy) => {
    if (by === 'own') {
      update((t) => {
        const { [category]: dropped, ...order } = t.order;
        void dropped;
        return { ...t, order };
      });
      return;
    }
    // A card is only a picture: what it is sorted by is looked up from what it was drawn from.
    const facts = new Map<string, { name: string; tier?: number; difficulty?: number; hp?: number }>();
    for (const c of saved) facts.set(templateCardId(c.id), { ...c, hp: c.maxHp });
    for (const id of party.memberIds) if (files[id]) facts.set(memberCardId(id), { name: files[id].name, hp: party.global[id]?.hp });
    for (const e of encounters) {
      facts.set(encounterCardId(e.id), { name: e.name });
      for (const c of e.adversaries) facts.set(combatantCardId(c.id), c);
      for (const a of e.allies) if (a.kind === 'npc') facts.set(combatantCardId(a.combatant.id), a.combatant);
    }
    const name = (id: string) => facts.get(id)?.name ?? '';
    const ids = (decks[category] ?? []).map((c) => c.id).sort((a, b) => {
      if (by === 'az' || by === 'za') return name(a).localeCompare(name(b), undefined, { numeric: true }) * (by === 'az' ? 1 : -1);
      // What has no such number goes last.
      const x = facts.get(a)?.[by] ?? Infinity, y = facts.get(b)?.[by] ?? Infinity;
      return x === y ? name(a).localeCompare(name(b), undefined, { numeric: true }) : x < y ? -1 : 1;
    });
    playSfx('cardDragEnd');
    update((t) => ({ ...t, order: { ...t.order, [category]: ids } }));
  }, [category, decks, saved, party, files, encounters, update]);

  const counters = useDeskCounters(table, update, enc, changeOne);
  const env = useMemo<ControlsEnv>(() => ({
    records, table, view, enc, category, muted, sort, counters,
    open: desk.open,
    inEncounter: (run) => within('encounter', enc?.id, run),
    inSession: (run) => within('session', session.id, run),
    inParty: (run) => within('party', party.id, run),
    go: {
      sessions: () => router.push(`/sessions?campaign=${party.id}` as Href),
      campaigns: () => (router.canDismiss() ? router.dismissTo('/parties' as Href) : router.replace('/parties' as Href)),
      archive: () => router.push('/gallery' as Href),
    },
    newDeck: () => setDialog({ kind: 'newDeck' }),
    renameDeck: () => setDialog({ kind: 'renameDeck', key: category }),
    deleteDeck: () => setDialog({ kind: 'deleteDeck', key: category }),
    toggleFear: () => update((t) => ({ ...t, fear: { ...t.fear, on: !t.fear.on } })),
    toggleMute: () => {
      const next = !isUiMuted();
      setUiMuted(next);
      setMuted(next);
      if (!next) playSfx('buttonTap');
    },
    dice: () => setTray(true),
    guide: () => setGuide(true),
  }), [records, table, view, enc, category, muted, sort, counters, desk, within, session.id, party.id, router, update]);

  const host = useMemo<TableHost>(() => {
    const custom = table.decks.map((d) => d.key);
    const ring = [...DM_DECKS.map((d) => d.key as string), ...custom];
    const toggle = (list: string[], id: string) => (list.includes(id) ? list.filter((x) => x !== id) : [...list, id]);
    const show = (c: string) => {
      if (c === tableRef.current.category) return;
      playSfx('carouselScroll');
      update((t) => ({ ...t, category: c }));
    };
    const tokens = (id: string, change: (list: PlacedToken[]) => PlacedToken[]) => update((t) => {
      const list = change(t.tokens[id] ?? []);
      const { [id]: dropped, ...rest } = t.tokens;
      void dropped;
      return { ...t, tokens: list.length ? { ...rest, [id]: list } : rest };
    });
    return {
      decks,
      category,
      ring,
      categoryMeta: Object.fromEntries([
        ...DM_DECKS.map((d) => [d.key, { label: d.label, icon: d.icon, builtin: false }] as const),
        ...table.decks.map((d) => [d.key, { label: d.label, icon: 'gem', builtin: false }] as const),
        [FAVORITES_CATEGORY, { label: 'Favorites', builtin: true }] as const,
      ]),
      setCategory: show,
      cycleCategory: (dir) => show(ring[(Math.max(0, ring.indexOf(category)) + dir + ring.length) % ring.length]),
      openFavorites: () => (decks[FAVORITES_CATEGORY].length ? show(FAVORITES_CATEGORY) : showToast('No favorites yet. Right click a card to add it')),
      enabledIds: new Set(table.marked),
      cardStates: NO_STATES,
      crossOuts: {},
      toggleCard: (id) => { playSfx('cardSelect'); update((t) => ({ ...t, marked: toggle(t.marked, id) })); },
      isFavorited: (id) => table.favorites.includes(id),
      cardAction: (kind, ids) => {
        if (kind === 'move') setDialog({ kind: 'move', ids });
        else if (kind === 'favorite' || kind === 'unfavorite') {
          playSfx('cardSelect');
          update((t) => ({ ...t, favorites: kind === 'favorite' ? [...new Set([...t.favorites, ...ids])] : t.favorites.filter((x) => !ids.includes(x)) }));
        }
      },
      nfcAvailable: false,
      onReorderCards: (_moved, to, ordered) => update((t) => ({ ...t, order: { ...t.order, [to]: ordered } })),
      cardTokens: table.tokens,
      tokenColor: table.tokenColor ?? '',
      setTokenColor: (color) => update((t) => ({ ...t, tokenColor: color })),
      placeToken: (id, token) => tokens(id, (list) => [...list, token]),
      removeToken: (id, tid) => tokens(id, (list) => list.filter((x) => x.id !== tid)),
      updateToken: (id, tid, patch) => tokens(id, (list) => list.map((x) => (x.id === tid ? { ...x, ...patch } : x))),
      dm: {
        start: DM_STARTING_LOOK,
        controls: controlDice(env),
        cardRows: (id) => cardRows(env, id),
        emptyDeck: !enc && (category === 'dm-foes' || category === 'dm-npcs') ? 'No encounter yet. Click the Encounter die to make one.' : EMPTY_DECK[category as DmDeckKey] ?? (category === FAVORITES_CATEGORY ? 'No favorites yet. Right click a card to add it.' : 'Nothing in this category yet. Right click a card and move it here.'),
        counters: { open: () => counters.open(), add: counters.add },
        layer: (w, h) => (
          <>
            {table.fear.on ? <FearTrack fear={table.fear} width={w} height={h} onChange={(patch) => update((t) => ({ ...t, fear: { ...t.fear, ...patch } }))} /> : null}
            {counters.layer(w, h)}
          </>
        ),
      },
    };
  }, [decks, category, table, env, enc, counters, update]);

  // ---------------------------------------------------------------- dice, layers, keys
  const trayRef = useRef<DiceTrayHandle | null>(null);
  const backRef = useRef<(() => boolean) | null>(null);
  const dice = useMemo<DeskDice>(() => ({
    up: false,
    onToggle: () => undefined,
    handleRef: trayRef,
    presets: {
      presets: table.presets,
      trayDice: () => trayRef.current?.currentDice() ?? [],
      cardVars: [],
      onWrite: (slot, preset) => update((t) => ({ ...t, presets: t.presets.map((p, i) => (i === slot ? preset : p)) })),
      // A DM's preset has a flat bonus and nothing else: there is no sheet under it.
      onPlay: (p) => trayRef.current?.playPreset(p.dice, p.name, p.modifier?.value ?? 0),
    },
  }), [table.presets, update]);

  const layers = desktop?.layers;
  const panels = useSyncExternalStore(layers?.watch ?? noWatch, () => layers?.count() ?? 0);
  // Behind a panel the port takes no clicks and no Tab, as the sheet's does.
  const port = useRef<View>(null);
  useLayoutEffect(() => {
    const el = port.current as unknown as HTMLElement | null;
    if (!el?.setAttribute) return;
    if (desktop && panels) el.setAttribute('inert', '');
    else el.removeAttribute('inert');
  }, [desktop, panels]);
  useEffect(() => {
    if (!focused || !layers) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape' || e.defaultPrevented || e.isComposing) return;
      const closed = layers.dismissTop();
      if (closed === 'dismissed') { e.preventDefault(); e.stopPropagation(); }
    };
    document.addEventListener('keydown', onKey, true);
    return () => document.removeEventListener('keydown', onKey, true);
  }, [focused, layers]);

  const deleteSaved = (ids: Set<string>) => void saveAdversaries(removeTemplates(saved, ids));
  const shownEnc = encId ?? enc?.id;

  return (
    <DmDeskContext.Provider value={desk}>
      <View style={{ flex: 1, backgroundColor: DmRune.ink }}>
        <View ref={port} style={{ flex: 1 }}>
          {view === 'encounter' && shownEnc ? <EncounterScreen key={shownEnc} encounterId={shownEnc} />
            : view === 'party' ? <PartyOverviewScreen partyId={party.id} />
            : view === 'cast' ? <PartyEditorScreen partyId={party.id} />
            : view === 'library' ? (
              <>
                <AdversaryLibrary mode="browse" savedList={saved} onDeleteSaved={deleteSaved} onClose={() => desk.open(enc ? 'encounter' : 'session')} />
                {/* The library is an overlay on a phone and brings no frame; in the port it is a screen like the rest. */}
                <View style={[StyleSheet.absoluteFill, { zIndex: 351 }]} pointerEvents="none"><FullUi width="100%" height="100%" preserveAspectRatio="none" /></View>
              </>
            )
            : <SessionScreen />}
        </View>
        {focused && desktop ? (
          <TableHostContext.Provider value={host}>
            <PlayTable characterId={dmTableOwner(party.id)} dice={dice} overlay={panels > 0} backRef={backRef} onOpen={(p) => { if (p === 'newCategory') setDialog({ kind: 'newDeck' }); }} />
          </TableHostContext.Provider>
        ) : null}

        {counters.dialog}
        {tray ? <DmSide onClose={() => setTray(false)}><DmDicePanel onClose={() => setTray(false)} /></DmSide> : null}
        {guide ? <DmSide onClose={() => setGuide(false)}><AdversaryInfoPanel onClose={() => setGuide(false)} /></DmSide> : null}
        {dialog?.kind === 'newDeck' ? (
          <NameDialog title="New category" placeholder="Category name" confirmLabel="Create" onCancel={() => setDialog(null)}
            onConfirm={(label) => {
              setDialog(null);
              const key = `own-${Date.now().toString(36)}`;
              update((t) => ({ ...t, decks: [...t.decks, { key, label }], category: key }));
            }} />
        ) : dialog?.kind === 'renameDeck' ? (
          <NameDialog title="Rename category" placeholder="Category name" initial={table.decks.find((d) => d.key === dialog.key)?.label} onCancel={() => setDialog(null)}
            onConfirm={(label) => {
              setDialog(null);
              update((t) => ({ ...t, decks: t.decks.map((d) => (d.key === dialog.key ? { ...d, label } : d)) }));
            }} />
        ) : dialog?.kind === 'deleteDeck' ? (
          <PopupDialog dm destructive title="Delete this category?" body="Its cards go back to the decks they came from." confirmLabel="Delete" onCancel={() => setDialog(null)}
            onConfirm={() => { setDialog(null); update((t) => removeDeck(t, dialog.key)); }} />
        ) : dialog?.kind === 'move' ? (
          <PopupDialog dm title="Move to deck" body={table.decks.length ? undefined : 'Make a category first: click the Cards die, then New category.'} confirmLabel="Cancel" cancelLabel="Cancel" onConfirm={() => setDialog(null)} onCancel={() => setDialog(null)}>
            <View style={{ gap: 10, marginTop: 14 }}>
              {table.decks.filter((d) => d.key !== category).map((d) => (
                <RuneButton key={d.key} label={d.label} kind="secondary" height={40} dm
                  onPress={() => { setDialog(null); update((t) => ({ ...t, moved: { ...t.moved, ...Object.fromEntries(dialog.ids.map((id) => [id, d.key])) } })); }} />
              ))}
              {dialog.ids.some((id) => table.moved[id]) ? (
                <RuneButton label="Back to its own deck" kind="ghost" height={40} dm
                  onPress={() => { setDialog(null); update((t) => ({ ...t, moved: Object.fromEntries(Object.entries(t.moved).filter(([id]) => !dialog.ids.includes(id))) })); }} />
              ) : null}
            </View>
          </PopupDialog>
        ) : null}
      </View>
    </DmDeskContext.Provider>
  );
}
