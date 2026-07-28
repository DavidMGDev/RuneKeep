/**
 * Onboarding progress (v0.23.0).
 *
 * v0.22.0 shipped one long tour that fired on first launch, which was wrong: it explained the
 * character sheet to someone who had never seen a character. Teaching now happens next to the thing
 * being taught, so this tracks THREE independent tours:
 *
 *  - `welcome`   the very first launch. Says what the app is and points at the two ways in.
 *  - `creation`  the first time the character creator opens.
 *  - `sheet`     the first time a character sheet opens.
 *
 * Each records its own done flag and its own resume point, so finishing one never suppresses
 * another and leaving mid-tour picks up where you stopped.
 *
 * The `?` on the main menu RESETS all of them, so they reappear where they belong rather than
 * replaying out of context.
 */

import { Platform } from 'react-native';
import { webGet, webSet } from './web-store';

const WEB_KEY = 'runekeep.onboarding';
const FILE_NAME = 'onboarding.json';

export type TourId = 'welcome' | 'creation' | 'sheet';
export const TOUR_IDS: TourId[] = ['welcome', 'creation', 'sheet'];

export interface TourState {
  done: boolean;
  /** Where the player stopped, so a resumed tour does not restart. */
  step: number;
}

export type OnboardingState = Record<TourId, TourState>;

const FRESH: OnboardingState = {
  welcome: { done: false, step: 0 },
  creation: { done: false, step: 0 },
  sheet: { done: false, step: 0 },
};

const fresh = (): OnboardingState => ({
  welcome: { ...FRESH.welcome },
  creation: { ...FRESH.creation },
  sheet: { ...FRESH.sheet },
});

type FS = typeof import('expo-file-system');
// eslint-disable-next-line @typescript-eslint/no-require-imports
const fs = (): FS => require('expo-file-system') as FS;

function file() {
  const { File, Paths } = fs();
  return new File(Paths.document, FILE_NAME);
}

function read(): OnboardingState {
  try {
    const raw = Platform.OS === 'web' ? (webGet(WEB_KEY) ?? null) : file().exists ? file().textSync() : null;
    if (!raw) return fresh();
    const parsed = JSON.parse(raw) as Partial<Record<TourId, Partial<TourState>>> & { done?: boolean };
    const out = fresh();
    // A v0.22.0 file was a single {done, step}. Anyone who finished that tour has already been
    // taught the sheet, so honour it for `sheet` and leave the newer tours to fire in place.
    if (typeof parsed.done === 'boolean') {
      out.sheet = { done: parsed.done, step: 0 };
      out.welcome = { done: parsed.done, step: 0 };
      return out;
    }
    for (const id of TOUR_IDS) {
      const t = parsed[id];
      if (t) out[id] = { done: !!t.done, step: typeof t.step === 'number' ? t.step : 0 };
    }
    return out;
  } catch {
    // A corrupt file must never block the app; the worst case is a tour offering itself again.
    return fresh();
  }
}

function write(state: OnboardingState): void {
  try {
    const json = JSON.stringify(state);
    if (Platform.OS === 'web') webSet(WEB_KEY, json);
    else file().write(json);
  } catch {
    /* Losing this write only means a tour may offer itself once more. */
  }
}

export function loadOnboarding(): OnboardingState {
  return read();
}

/** Whether a tour should be shown right now. */
export function shouldShow(id: TourId): boolean {
  return !read()[id].done;
}

/** Where to resume a tour. */
export function tourStep(id: TourId): number {
  return read()[id].step;
}

export function saveTourStep(id: TourId, step: number): void {
  const s = read();
  s[id] = { done: s[id].done, step };
  write(s);
}

export function finishTour(id: TourId): void {
  const s = read();
  s[id] = { done: true, step: 0 };
  write(s);
}

/** The menu's `?` : every tour becomes available again, in its own place. */
export function resetTours(): void {
  write(fresh());
}
