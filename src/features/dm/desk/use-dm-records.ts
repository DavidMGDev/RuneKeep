/**
 * What the DM screen's table is drawn from (v0.49.0): the same saved records the screens in the port write. They are
 * read again a moment after each write instead of being shared as state, so the screens stay as they are on a phone.
 */
import { useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';

import { loadAdversaries, type SavedAdversary } from '@/lib/adversary-library';
import type { CharacterFile } from '@/lib/character-file';
import { listCharacters } from '@/lib/character-store';
import type { Party } from '@/lib/party';
import { getParty } from '@/lib/party-store';
import type { Encounter, Session } from '@/lib/session';
import { getSession, listEncounters } from '@/lib/session-store';
import { webWatch } from '@/lib/web-store';

export interface DmRecords {
  session: Session | null;
  party: Party | null;
  encounters: Encounter[];
  files: Record<string, CharacterFile>;
  saved: SavedAdversary[];
}

const WATCHED = new Set(['runekeep.sessions', 'runekeep.parties', 'runekeep.encounters', 'runekeep.characters', 'runekeep.adversaries']);

/** null while the first read is out. */
export function useDmRecords(sessionId: string): DmRecords | null {
  const [records, setRecords] = useState<DmRecords | null>(null);
  useFocusEffect(useCallback(() => {
    let live = true;
    let latest = 0;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const read = async () => {
      const turn = ++latest;
      const session = await getSession(sessionId);
      const [party, encounters, all, saved] = await Promise.all([
        session ? getParty(session.partyId) : Promise.resolve(null),
        listEncounters(sessionId),
        listCharacters(),
        loadAdversaries(),
      ]);
      // A read overtaken by a newer one says nothing.
      if (live && turn === latest) setRecords({ session, party, encounters, saved, files: Object.fromEntries(all.map((f) => [f.id, f])) });
    };
    void read();
    const off = webWatch((key) => {
      if (!WATCHED.has(key)) return;
      clearTimeout(timer);
      timer = setTimeout(() => void read(), 30);
    });
    return () => {
      live = false;
      clearTimeout(timer);
      off();
    };
  }, [sessionId]));
  return records;
}
