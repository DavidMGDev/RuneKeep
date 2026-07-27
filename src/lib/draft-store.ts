/**
 * Creation-draft persistence (v0.22.0).
 *
 * The character creator used to hold its ten-step draft in component state alone, so the back
 * chevron, the hardware back button, a phone call or a low-memory kill all destroyed it silently —
 * the single highest-severity finding in the v0.21.0 UX audit. The draft is now written to disk
 * after every change and offered back on the next visit.
 *
 * This is deliberately NOT a character file: a draft is partial by definition and must never be
 * parsed by `parseCharacterFile`, which validates required fields. It lives in its own slot, holds
 * exactly one draft (you can only be creating one hero at a time), and is cleared the moment the
 * character is forged or the player says to discard it.
 *
 * Storage mirrors `character-store`: a native file under documents, a localStorage shim on web.
 */

import { Platform } from 'react-native';

const WEB_KEY = 'runekeep.draft';
const FILE_NAME = 'creation-draft.json';

/** Bump when the draft shape changes incompatibly; an older draft is dropped rather than migrated. */
export const DRAFT_VERSION = 1;

export interface StoredDraft<T = unknown> {
  version: number;
  /** ISO timestamp of the last edit — shown as "picked up where you left off". */
  savedAt: string;
  /** Which step the player was on, so resuming lands them back there. */
  deck?: string;
  /** The expansion picks this draft was started with; resuming must not silently widen them. */
  picked?: string[];
  draft: T;
}

// expo-file-system's File/Directory API is native-only — a top-level import breaks the web bundle.
type FS = typeof import('expo-file-system');
const fs = (): FS => require('expo-file-system') as FS;

function draftFile() {
  const { File, Paths } = fs();
  return new File(Paths.document, FILE_NAME);
}

/**
 * Whether a stored draft is worth offering back. A draft whose every field is still untouched is
 * noise — resuming it would show the player an empty creator and ask them to make a decision about
 * nothing. `hasContent` is supplied by the caller because only it knows what "empty" means.
 */
export function isResumable(stored: StoredDraft | null, hasContent: (draft: unknown) => boolean): boolean {
  if (!stored || stored.version !== DRAFT_VERSION) return false;
  return hasContent(stored.draft);
}

export function loadDraft<T>(): StoredDraft<T> | null {
  try {
    const raw = Platform.OS === 'web' ? (globalThis.localStorage?.getItem(WEB_KEY) ?? null) : draftFile().exists ? draftFile().textSync() : null;
    if (!raw) return null;
    const parsed = JSON.parse(raw) as StoredDraft<T>;
    // A draft from an older shape is dropped, never migrated: it is cheap to re-make and expensive
    // to get subtly wrong.
    if (parsed?.version !== DRAFT_VERSION) return null;
    return parsed;
  } catch {
    // A corrupt draft must never block the creator — the player just starts fresh.
    return null;
  }
}

export function saveDraft<T>(draft: T, meta: { deck?: string; picked?: string[] } = {}): void {
  const payload: StoredDraft<T> = { version: DRAFT_VERSION, savedAt: new Date().toISOString(), ...meta, draft };
  try {
    const json = JSON.stringify(payload);
    if (Platform.OS === 'web') globalThis.localStorage?.setItem(WEB_KEY, json);
    else draftFile().write(json);
  } catch {
    // Losing a draft write is survivable; crashing the creator mid-edit is not.
  }
}

export function clearDraft(): void {
  try {
    if (Platform.OS === 'web') globalThis.localStorage?.removeItem(WEB_KEY);
    else if (draftFile().exists) draftFile().delete();
  } catch {
    // Same reasoning as saveDraft.
  }
}
