/**
 * The DM table's counters (v0.50.0): which lie on the felt, and where every change to one is written. A campaign's
 * own are kept with its table; a combatant's are the encounter's, changed through the one path the screens use.
 */
import { type ReactNode, useCallback, useMemo, useState } from 'react';

import { MENU_ICON } from '@/features/character-sheet/table/menu-icons';
import type { OpenMenu } from '@/features/character-sheet/table/table-host';
import { cue } from '@/features/character-sheet/table/table-sound';
import { type AdversaryCounter, applySettings, newCounter, resetCounter, startOf, stepCounter } from '@/lib/dm-counters';
import type { DmTable } from '@/lib/dm-table';
import { type Combatant, type Encounter, fell, fighters, recover } from '@/lib/session';
import { COUNTER_MAX, counterKey, counterOf, editCounter, freeSpot } from '@/lib/table-counters';

import { type CounterActions, counterGroups, CountersDialog } from './counters-dialog';
import { CounterTile } from './counter-tile';

type Change = (encId: string, cid: string, change: (c: Combatant) => Combatant) => void;

export interface DeskCounters {
  /** Every counter, or opened on one of them, or on one combatant's. */
  open: (start?: { key?: string; cid?: string }) => void;
  /** A campaign counter on the felt, open to be named. `at` is in shares of the felt. */
  add: (at?: { x: number; y: number }) => void;
  showAll: (cid: string) => void;
  /** How many lie on the felt. */
  out: number;
  layer: (w: number, h: number, openMenu: OpenMenu) => ReactNode;
  dialog: ReactNode;
}

const mint = () => `ct-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;

export function useDeskCounters(table: DmTable, update: (change: (t: DmTable) => DmTable) => void, enc: Encounter | null, change: Change): DeskCounters {
  const [opened, setOpened] = useState<{ key?: string; cid?: string } | null>(null);
  const encId = enc?.id;
  const groups = useMemo(() => counterGroups(table.counters, enc ? fighters(enc) : []), [table.counters, enc]);

  const place = useCallback((key: string, at?: { x: number; y: number }) => update((t) => (
    t.spots[key] && !at ? t : { ...t, spots: { ...t.spots, [key]: at ? { ...at, k: 1 } : freeSpot(t.spots) } }
  )), [update]);
  const lift = useCallback((key: string) => update((t) => {
    const { [key]: gone, ...spots } = t.spots;
    void gone;
    return { ...t, spots };
  }), [update]);

  /** Change one counter, wherever it is kept. `null` is gone. */
  const write = useCallback((key: string, next: (c: AdversaryCounter) => AdversaryCounter | null) => {
    const { id, cid } = counterOf(key);
    if (!cid) update((t) => ({ ...t, counters: editCounter(t.counters, id, next) }));
    else if (encId) change(encId, cid, (c) => ({ ...c, counters: editCounter(c.counters ?? [], id, next) }));
  }, [update, change, encId]);

  const act = useMemo<CounterActions>(() => ({
    add: (cid) => {
      const c = { ...newCounter(mint()), name: 'Counter' };
      const key = counterKey(c.id, cid);
      if (!cid) update((t) => (t.counters.length < COUNTER_MAX ? { ...t, counters: [...t.counters, c] } : t));
      else if (encId) change(encId, cid, (who) => ({ ...who, counters: [...(who.counters ?? []), c] }));
      place(key);
      return key;
    },
    // Where it is now stays, unless the start itself was changed: the adversary editor's rule.
    save: (key, next) => write(key, (c) => applySettings(c, next)),
    remove: (key) => { write(key, () => null); lift(key); },
    step: (key, delta) => write(key, (c) => stepCounter(c, delta)),
    spent: (key) => {
      const { cid } = counterOf(key);
      if (!cid) lift(key);
      else if (encId) change(encId, cid, fell);
    },
    reset: (key) => write(key, resetCounter),
    recover: (cid) => { if (encId) change(encId, cid, recover); },
    show: (key, on) => { cue('card:place', on ? 'cardDragEnd' : 'tokenRemove', { volume: 0.6 }); if (on) place(key); else lift(key); },
  }), [update, change, encId, place, lift, write]);

  const open = useCallback((start?: { key?: string; cid?: string }) => setOpened(start ?? {}), []);
  const add = useCallback((at?: { x: number; y: number }) => {
    if (table.counters.length >= COUNTER_MAX) { open(); return; }
    const key = act.add();
    if (at) place(key, at);
    open({ key });
  }, [table.counters.length, act, place, open]);
  const showAll = useCallback((cid: string) => {
    for (const c of groups.find((g) => g.cid === cid)?.counters ?? []) place(counterKey(c.id, cid));
  }, [groups, place]);

  const out = groups.flatMap((g) => g.counters.filter((c) => table.spots[counterKey(c.id, g.cid)]).map((c) => ({ g, c, key: counterKey(c.id, g.cid) })));

  return {
    open,
    add,
    showAll,
    out: out.length,
    layer: (w, h, openMenu) => out.map(({ g, c, key }) => (
      <CounterTile key={key} c={c} owner={g.cid ? g.name : undefined} fallen={g.fallen} spot={table.spots[key]} width={w} height={h}
        onSpot={(spot) => update((t) => ({ ...t, spots: { ...t.spots, [key]: spot } }))}
        onStep={(d) => act.step(key, d)} onSpent={() => act.spent(key)} onRecover={g.cid ? () => act.recover(g.cid!) : undefined}
        onOpen={() => open({ key })} onRemove={() => act.show(key, false)}
        onMenu={(x, y) => openMenu(x, y, {
          title: c.name || 'Counter', icon: MENU_ICON.counters, detail: g.cid ? g.name : `At ${c.value}`,
          rows: [
            { label: 'Edit counter', icon: MENU_ICON.edit, onPress: () => open({ key }) },
            { label: 'Back to its starting value', icon: MENU_ICON.reset, value: String(startOf(c)), disabled: c.value === startOf(c), onPress: () => act.reset(key) },
            { label: 'Normal size', icon: MENU_ICON.size, hidden: table.spots[key].k === 1, onPress: () => update((t) => ({ ...t, spots: { ...t.spots, [key]: { ...t.spots[key], k: 1 } } })) },
            { label: 'Recover', icon: MENU_ICON.recover, hidden: !g.cid || !g.fallen, onPress: () => act.recover(g.cid!) },
            { label: 'Take it off the table', icon: MENU_ICON.offTable, gap: true, onPress: () => act.show(key, false) },
          ],
        })} />
    )),
    dialog: opened ? <CountersDialog groups={groups} spots={table.spots} start={opened} encounterName={enc?.name} act={act} onClose={() => setOpened(null)} /> : null,
  };
}
