/**
 * Character folders (v0.15.0, PRD #6-8) — group roster characters under named, coloured folders. A
 * single device-local index (folder list + character→folder assignments). Reducers are pure; load/save
 * persist the one singleton (mirrors character-store's FS shim). Present in BOTH player and DM mode.
 */
import { Platform } from 'react-native';

import { randomColor } from './party';
import { webGet, webSet } from './web-store';

export interface Folder {
  id: string;
  name: string;
  color: string;
}
export interface FolderIndex {
  folders: Folder[];
  /** character id → folder id. A character with no entry is ungrouped. */
  assignments: Record<string, string>;
  /** v0.23.0: which groups the player has collapsed. Collapsing is a preference about how they want
   *  to see their roster, so it has to survive leaving the screen like every other preference. */
  collapsed?: string[];
}

export const EMPTY_INDEX: FolderIndex = { folders: [], assignments: {}, collapsed: [] };

/** Remember a group's collapsed state. `key` is a folder id, or `__ungrouped`. */
export function setCollapsed(idx: FolderIndex, key: string, collapsed: boolean): FolderIndex {
  const cur = new Set(idx.collapsed ?? []);
  if (collapsed) cur.add(key);
  else cur.delete(key);
  return { ...idx, collapsed: [...cur] };
}

const rid = (): string => `fd-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;

// --- pure reducers ---------------------------------------------------------------------------------

export function addFolder(idx: FolderIndex, name: string): FolderIndex {
  const folder: Folder = { id: rid(), name: name.trim() || 'New Folder', color: randomColor() };
  return { ...idx, folders: [...idx.folders, folder] };
}

export function renameFolder(idx: FolderIndex, id: string, name: string): FolderIndex {
  return { ...idx, folders: idx.folders.map((f) => (f.id === id ? { ...f, name: name.trim() || f.name } : f)) };
}

/** Re-roll a folder's colour (PRD #8 — random only, never hand-picked). */
export function recolorFolder(idx: FolderIndex, id: string): FolderIndex {
  return { ...idx, folders: idx.folders.map((f) => (f.id === id ? { ...f, color: randomColor() } : f)) };
}

export function assign(idx: FolderIndex, charId: string, folderId: string | null): FolderIndex {
  const assignments = { ...idx.assignments };
  if (folderId) assignments[charId] = folderId;
  else delete assignments[charId];
  return { ...idx, assignments };
}

/** The group holding every character with no folder. Collapsible like a folder, but it has no name. */
export const UNGROUPED_KEY = '__ungrouped';

/** Remove a folder; its members fall back to ungrouped. */
export function removeFolder(idx: FolderIndex, id: string): FolderIndex {
  const hadMembers = Object.values(idx.assignments).some((fid) => fid === id);
  const assignments = Object.fromEntries(Object.entries(idx.assignments).filter(([, fid]) => fid !== id));
  // v0.27.2: SPREAD. Rebuilding the index from its two named fields quietly dropped `collapsed`, so
  // deleting any one folder re-opened every other group the player had tidied away.
  //
  // v0.27.3: and never tip characters into a group that is shut. Deleting a folder moves its members
  // to Ungrouped, so if Ungrouped happened to be collapsed they arrived already hidden, which reads
  // as the whole roster vanishing.
  const collapsed = (idx.collapsed ?? []).filter((k) => k !== id && !(hadMembers && k === UNGROUPED_KEY));
  return { ...idx, folders: idx.folders.filter((f) => f.id !== id), assignments, collapsed };
}

/** Character ids assigned to a folder. */
export function membersOf(idx: FolderIndex, folderId: string): string[] {
  return Object.entries(idx.assignments).filter(([, fid]) => fid === folderId).map(([cid]) => cid);
}

// --- persistence (device-local singleton) ----------------------------------------------------------

const WEB_KEY = 'runekeep.folders';
type FS = typeof import('expo-file-system');
// eslint-disable-next-line @typescript-eslint/no-require-imports
const fs = (): FS => require('expo-file-system') as FS;
const file = () => new (fs().File)(fs().Paths.document, 'folders.json');

export async function loadFolders(): Promise<FolderIndex> {
  try {
    if (Platform.OS === 'web') return JSON.parse(webGet(WEB_KEY) ?? 'null') ?? EMPTY_INDEX;
    const f = file();
    return f.exists ? (JSON.parse(f.textSync()) as FolderIndex) : EMPTY_INDEX;
  } catch {
    return EMPTY_INDEX;
  }
}

export async function saveFolders(idx: FolderIndex): Promise<void> {
  if (Platform.OS === 'web') {
    webSet(WEB_KEY, JSON.stringify(idx));
    return;
  }
  file().write(JSON.stringify(idx, null, 2));
}
