/** The DM screen's tables, one to a campaign, in the browser's database. See `dm-table`. */
import { cleanDmTable, type DmTable } from './dm-table';
import { forgetNotes } from './table-notes-store';
import { webGet, webSet } from './web-store';

const KEY = 'runekeep.dmTables';

/** The id a campaign's table is kept under, beside the characters' own. */
export const dmTableOwner = (partyId: string): string => `dm-${partyId}`;

function readAll(): Record<string, unknown> {
  try {
    const raw: unknown = JSON.parse(webGet(KEY) ?? '{}');
    return raw && typeof raw === 'object' && !Array.isArray(raw) ? (raw as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}

export const loadDmTable = (partyId: string): DmTable => cleanDmTable(readAll()[partyId]);

export function saveDmTable(partyId: string, table: DmTable): void {
  webSet(KEY, JSON.stringify({ ...readAll(), [partyId]: table }));
}

export function forgetDmTable(partyId: string): void {
  const all = readAll();
  if (partyId in all) {
    delete all[partyId];
    webSet(KEY, JSON.stringify(all));
  }
  forgetNotes(dmTableOwner(partyId));
}
