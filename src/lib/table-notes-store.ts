/**
 * Where sticky notes are kept: in the browser's database and not in localStorage with the table's furniture, because
 * what someone wrote must not be lost to a full quota. By whose table it is: a character's id, or `dm-<campaign>`.
 */
import { cleanNotes, type TableNote } from './table-notes';
import { webGet, webRemove, webSet } from './web-store';

// A key to each table, so a sheet open in one tab and the DM screen in another cannot write over each other's notes.
const keyOf = (owner: string) => `runekeep.notes.${owner}`;

export function loadNotes(owner: string): TableNote[] {
  try {
    return cleanNotes(JSON.parse(webGet(keyOf(owner)) ?? '[]'));
  } catch {
    return [];
  }
}

export function saveNotes(owner: string, notes: TableNote[]): void {
  if (notes.length) webSet(keyOf(owner), JSON.stringify(notes));
  else webRemove(keyOf(owner));
}

/** A character or campaign deleted takes its notes with it. */
export function forgetNotes(owner: string): void {
  if (webGet(keyOf(owner)) !== null) webRemove(keyOf(owner));
}
