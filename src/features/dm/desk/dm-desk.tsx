/**
 * The seam between the DM screen and the DM screens it is made of (v0.49.0).
 *
 * The desktop DM screen does not re-implement the session, the encounter, the party sheet or the cast: it shows those
 * very screens in its port, so nothing the phone can do is missing. Each screen hands the table what its control dice
 * and card menus need (`useDeskApi`), and asks the desk to go places instead of pushing routes (`useDmDesk`).
 * Outside the DM screen both are inert, and the screens are exactly the phone's.
 */
import { createContext, type ReactNode, useContext, useLayoutEffect } from 'react';

import { DesktopPortal } from '@/components/desktop-portal';
import { useDesktop } from '@/hooks/use-desktop';
import type { CombatantStat } from '@/lib/session';
import type { VitalKey } from '@/lib/party';

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

/**
 * A DM panel that is full screen on a phone. On the DM screen it opens in the slot beside the port, as every sheet
 * panel does; everywhere else it is drawn where it was written. Leave `onClose` out for an editor holding unsaved
 * work: then Escape and a click outside cannot throw it away.
 */
export function DmSide({ children, onClose }: { children: ReactNode; onClose?: () => void }) {
  if (!useDesktop()) return <>{children}</>;
  return <DesktopPortal to="side" onDismiss={onClose}>{children}</DesktopPortal>;
}
