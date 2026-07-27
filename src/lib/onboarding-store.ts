/**
 * Onboarding progress (v0.22.0).
 *
 * The audit's harshest finding was Help & Documentation scoring 0/4: no onboarding, no tutorial, no
 * tooltip, no coach mark, no help screen anywhere — and every explanatory string in the app sitting
 * BEHIND the gesture it would teach. A repo-wide search for onboarding hooks turned up exactly one
 * result: a comment recording that hint tooltips had been removed.
 *
 * This is the persistence for the guided tour. It is deliberately tiny: a "seen" flag and the step
 * the player stopped on, so leaving mid-tour resumes where they left off rather than restarting.
 *
 * Storage mirrors `dm-mode` / `sfx-prefs`: a small JSON file on native, localStorage on web.
 */

import { Platform } from 'react-native';

const WEB_KEY = 'runekeep.onboarding';
const FILE_NAME = 'onboarding.json';

export interface OnboardingState {
  /** Set once the player finishes or explicitly skips. Never nag after this. */
  done: boolean;
  /** Where they stopped, so a resumed tour picks up rather than restarting. */
  step: number;
}

const DEFAULT: OnboardingState = { done: false, step: 0 };

type FS = typeof import('expo-file-system');
// eslint-disable-next-line @typescript-eslint/no-require-imports
const fs = (): FS => require('expo-file-system') as FS;

function file() {
  const { File, Paths } = fs();
  return new File(Paths.document, FILE_NAME);
}

export function loadOnboarding(): OnboardingState {
  try {
    const raw = Platform.OS === 'web' ? (globalThis.localStorage?.getItem(WEB_KEY) ?? null) : file().exists ? file().textSync() : null;
    if (!raw) return DEFAULT;
    const parsed = JSON.parse(raw) as Partial<OnboardingState>;
    return { done: !!parsed.done, step: typeof parsed.step === 'number' ? parsed.step : 0 };
  } catch {
    // A corrupt file must never block the app; the worst case is the tour offers itself again.
    return DEFAULT;
  }
}

export function saveOnboarding(state: OnboardingState): void {
  try {
    const json = JSON.stringify(state);
    if (Platform.OS === 'web') globalThis.localStorage?.setItem(WEB_KEY, json);
    else file().write(json);
  } catch {
    // Losing this write only means the tour may offer itself once more. Not worth crashing over.
  }
}
