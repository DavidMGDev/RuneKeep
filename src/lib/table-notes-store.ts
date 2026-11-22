/**
 * Where sticky notes are kept: in the browser's database and not in localStorage with the table's furniture, because
 * what someone wrote must not be lost to a full quota. By whose table it is: a character's id, or `dm-<campaign>`.
 */
import { cleanNotes, type TableNote } from './table-notes';
import { webGet, webSet } from './web-store';

const KEY = 'runekeep.notes';

function readAll(): Record<string, unknown> {
  try {
    const raw: unknown = JSON.parse(webGet(KEY) ?? '{}');
    return raw && typeof raw === 'object' && !Array.isArray(raw) ? (raw as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}

export const loadNotes = (owner: string): TableNote[] => cleanNotes(readAll()[owner]);

export function saveNotes(owner: string, notes: TableNote[]): void {
  const all = readAll();
  if (notes.length) all[owner] = notes;
  else delete all[owner];
  webSet(KEY, JSON.stringify(all));
}

/** A character or campaign deleted takes its notes with it. */
export function forgetNotes(owner: string): void {
  if (owner in readAll()) saveNotes(owner, []);
}
