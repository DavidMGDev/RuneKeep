/**
 * DM Mode flag (v0.15.0, PRD #1-5) — a persisted device-local boolean. Enabling it recolours the DM
 * surface and re-labels the menu; it changes no stored data and is fully reversible. Kept dead simple:
 * a single JSON file / localStorage key, read once at menu mount.
 */
import { Platform } from 'react-native';
import { webGet, webSet } from './web-store';

const WEB_KEY = 'runekeep.dmMode';
type FS = typeof import('expo-file-system');
// eslint-disable-next-line @typescript-eslint/no-require-imports
const fs = (): FS => require('expo-file-system') as FS;
const file = () => new (fs().File)(fs().Paths.document, 'dm-mode.json');

export async function getDmMode(): Promise<boolean> {
  try {
    if (Platform.OS === 'web') return webGet(WEB_KEY) === '1';
    const f = file();
    return f.exists && JSON.parse(f.textSync())?.on === true;
  } catch {
    return false;
  }
}

export async function setDmMode(on: boolean): Promise<void> {
  if (Platform.OS === 'web') {
    webSet(WEB_KEY, on ? '1' : '0');
    return;
  }
  file().write(JSON.stringify({ on }));
}
