/**
 * UI-sound mute preference (v0.19.1 item 6) — a persisted device-local boolean that silences every UI
 * sound until turned back on. Mirrors dm-mode.ts: one tiny JSON file, or one browser-store key. The main menu and
 * the DM encounter options both toggle it; the character sheet deliberately gets no control. Applied to the
 * live SFX engine at startup so a muted app stays silent across restarts.
 */
import { Platform } from 'react-native';

import { setSfxMuted } from './sfx';
import { webGet, webSet } from './web-store';

const WEB_KEY = 'runekeep.uiMuted';
type FS = typeof import('expo-file-system');
// eslint-disable-next-line @typescript-eslint/no-require-imports
const fs = (): FS => require('expo-file-system') as FS;
const file = () => new (fs().File)(fs().Paths.document, 'sfx-prefs.json');

/** Read the persisted mute flag synchronously (cheap enough for a mount read). */
export function isUiMuted(): boolean {
  try {
    if (Platform.OS === 'web') return webGet(WEB_KEY) === '1';
    const f = file();
    return f.exists && JSON.parse(f.textSync())?.muted === true;
  } catch {
    return false;
  }
}

/** Toggle the mute: applies it to the audio engine immediately AND persists it. */
export function setUiMuted(muted: boolean): void {
  setSfxMuted(muted);
  try {
    if (Platform.OS === 'web') { webSet(WEB_KEY, muted ? '1' : '0'); return; }
    file().write(JSON.stringify({ muted }));
  } catch {
    /* best-effort persistence */
  }
}

/** Push the stored mute into the SFX engine at app start. Returns the applied value. */
export function applyStoredMute(): boolean {
  const m = isUiMuted();
  setSfxMuted(m);
  return m;
}
