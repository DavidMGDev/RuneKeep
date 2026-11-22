/**
 * The seam between the DM screen and the DM screens it is made of (v0.49.0).
 *
 * The desktop DM screen does not re-implement the session, the encounter, the party sheet or the cast: it shows those
 * very screens in its port, so nothing the phone can do is missing. Each screen hands the table what its control dice
 * and card menus need (`useDeskApi`), and asks the desk to go places instead of pushing routes (`useDmDesk`).
 * Outside the DM screen both are inert, and the screens are exactly the phone's.
 *
 * Two of them can be open at once (v0.50.2: the party beside the encounter), each writing the party and the
 * characters whole. So on the desk a screen writes those at once, with no debounce, and follows the other's
 * writes (`useDeskFollow`): neither ever holds a copy old enough to write back over a change.
 */
import { createContext, type ReactNode, useContext, useEffect, useLayoutEffect, useRef } from 'react';

import { DesktopPortal } from '@/components/desktop-portal';
import { useDesktop } from '@/hooks/use-desktop';
import type { Combatant, CombatantStat } from '@/lib/session';
import type { VitalKey } from '@/lib/party';
import { webWatch } from '@/lib/web-store';

export type DmView = 'session' | 'encounter' | 'party' | 'cast' | 'library';
export type Side = 'ally' | 'adversary';

export interface EncounterApi {
  id: string;
  start: () => void;
  finish: () => void;
  restart: () => void;
  options: () => void;
  log: (write?: boolean) => void;
  toggleAutoLog: () => void;
  toggleSync: () => void;
  addAdversary: () => void;
  addNpc: () => void;
  library: (side: Side) => void;
  reorder: (side: Side) => void;
  /** A template from the DM's own library into this fight. */
  spawn: (templateId: string, as: Side) => void;
  edit: (cid: string) => void;
  /** Any change to one combatant, saved at once: the table draws from what is saved. */
  change: (cid: string, fn: (c: Combatant) => Combatant) => void;
  image: (cid: string) => void;
  fell: (cid: string) => void;
  recover: (cid: string) => void;
  remove: (cid: string, from: Side) => void;
  saveTemplate: (cid: string) => void;
  convert: (cid: string, from: Side) => void;
  characterize: (cid: string, from: Side) => void;
  presence: (charId: string) => void;
  modifiers: (charId: string) => void;
  cards: (charId: string) => void;
  setStat: (cid: string, stat: CombatantStat) => void;
  /** `member`: one of the party's; otherwise a characterized entry of this fight. */
  setVital: (charId: string, key: VitalKey, member: boolean) => void;
  /** A party member's vital moved, as the fight's own row moves it: logged, and held to the fight's maximum. */
  moveVital: (charId: string, key: VitalKey, delta: number) => void;
}

export interface SessionApi {
  id: string;
  create: () => void;
  edit: (encId: string) => void;
  duplicate: (encId: string) => void;
  move: (encId: string) => void;
  remove: (encId: string) => void;
}

export interface PartyApi {
  id: string;
  add: () => void;
  partyModifiers: () => void;
  modifiers: (charId: string) => void;
  cards: (charId: string) => void;
  presence: (charId: string) => void;
  setVital: (charId: string, key: VitalKey) => void;
}

export interface DeskApis {
  encounter: EncounterApi;
  session: SessionApi;
  party: PartyApi;
}

export interface DmDesk {
  open: (view: DmView, encounterId?: string) => void;
  /** Where Back goes from the cast and the library: the party's list, or the encounter or list last on the screen. */
  back: () => void;
  register: <K extends keyof DeskApis>(kind: K, api: DeskApis[K] | null) => void;
}

export const DmDeskContext = createContext<DmDesk | null>(null);
export const useDmDesk = (): DmDesk | null => useContext(DmDeskContext);

/** A screen in the port offers itself to the table, afresh with every render so what it runs is never stale. */
export function useDeskApi<K extends keyof DeskApis>(kind: K, api: DeskApis[K] | null): void {
  const desk = useDmDesk();
  useLayoutEffect(() => {
    if (!desk) return;
    desk.register(kind, api);
    return () => desk.register(kind, null);
  });
}

const SHARED = new Set(['runekeep.parties', 'runekeep.characters']);

/** On the desk, read what the screens share again after every write of it. Inert elsewhere. */
export function useDeskFollow<T>(read: () => Promise<T>, apply: (value: T) => void): void {
  const desk = useDmDesk();
  const latest = useRef({ read, apply });
  latest.current = { read, apply };
  useEffect(() => {
    if (!desk) return;
    let live = true, queued = false, turn = 0;
    const off = webWatch((key) => {
      if (!SHARED.has(key) || queued) return;
      queued = true;
      // After the handler that wrote: it may write the party and then each member's file.
      queueMicrotask(async () => {
        queued = false;
        const mine = ++turn;
        const value = await latest.current.read();
        if (live && mine === turn) latest.current.apply(value);
      });
    });
    return () => { live = false; off(); };
  }, [desk]);
}

/**
 * A DM panel that is full screen on a phone. On the DM screen it opens in the slot beside the port, as every sheet
 * panel does; everywhere else it is drawn where it was written. Leave `onClose` out for an editor holding unsaved
 * work: then Escape and a click outside cannot throw it away.
 */
export function DmSide({ children, onClose }: { children: ReactNode; onClose?: () => void }) {
  if (!useDesktop()) return <>{children}</>;
  return <DesktopPortal to="side" onDismiss={onClose}>{children}</DesktopPortal>;
}
