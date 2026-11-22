/** The DM screen's tables, one to a campaign, in the browser's database. See `dm-table`. */
import { cleanDmTable, type DmTable } from './dm-table';
import { forgetNotes } from './table-notes-store';
import { webGet, webRemove, webSet } from './web-store';

const keyOf = (partyId: string) => `runekeep.dmTable.${partyId}`;

/** The id a campaign's table is kept under, beside the characters' own. */
export const dmTableOwner = (partyId: string): string => `dm-${partyId}`;

export function loadDmTable(partyId: string): DmTable {
  try {
    return cleanDmTable(JSON.parse(webGet(keyOf(partyId)) ?? '{}'));
  } catch {
    return cleanDmTable({});
  }
}

export function saveDmTable(partyId: string, table: DmTable): void {
  webSet(keyOf(partyId), JSON.stringify(table));
}

export function forgetDmTable(partyId: string): void {
  if (webGet(keyOf(partyId)) !== null) webRemove(keyOf(partyId));
  forgetNotes(dmTableOwner(partyId));
}
