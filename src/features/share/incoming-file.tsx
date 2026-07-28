import * as Linking from 'expo-linking';
import { type Href, usePathname, useRouter } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Platform } from 'react-native';

import { PopupDialog } from '@/components/popup-dialog';
import { showToast } from '@/components/toast';
import { listCharacters, saveCharacter } from '@/lib/character-store';
import { isFilePayload, subscribeIncomingUrl, takeIncomingUrl } from '@/lib/incoming-url';
import { saveExpansion } from '@/lib/library-store';
import { parseRkp } from '@/lib/rkp';
import { type AppLocation, type RouteOutcome, routeIncoming } from '@/lib/rkp-route';

/**
 * Read whatever the OS handed us.
 *
 * `content://` works here even though the URI is a provider row id with no path: the modern
 * filesystem module routes content URIs straight to `ContentResolver.openInputStream`, and its read
 * permission check passes them unconditionally. (The LEGACY module would not: it only recognises
 * `com.android.externalstorage` and throws "Unsupported scheme" on everything else, which rules out
 * WhatsApp, Gmail and Drive. Worth knowing before anyone reaches for it.)
 */
async function readIncoming(uri: string): Promise<string> {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { File } = require('expo-file-system') as typeof import('expo-file-system');
  return new File(uri).textSync();
}

interface Incoming {
  /** The raw file text, kept so the confirm branch re-parses exactly what was decided on. */
  text: string;
  outcome: RouteOutcome;
}

/**
 * Incoming `.rkp` gate (v0.22.0).
 *
 * With the Android intent filter registered, a `.rkp` tapped in WhatsApp, a file manager, Gmail or a
 * download notification opens RuneKeep. A file can therefore land at ANY moment, including while the
 * player is mid-session on a character sheet — so this never imports on arrival. It parks the
 * payload, asks, and defers entirely when acting now could disturb work in progress.
 *
 * The decision is pure and lives in `lib/rkp-route`; this component only performs what it returns.
 */
export function IncomingFileGate() {
  const linked = Linking.useURL();
  const pathname = usePathname();
  const router = useRouter();
  const [incoming, setIncoming] = useState<Incoming | null>(null);
  /** A deferred file, waiting for the user to reach somewhere safe. */
  const [parked, setParked] = useState<string | null>(null);
  /** `useURL` re-emits the initial url on remount; handle each one once. */
  const seen = useRef<Set<string>>(new Set());

  /**
   * Two sources, because a share can arrive either way and neither covers both cases:
   *  - `+native-intent` catches it before React mounts, which is every cold launch from a share.
   *  - `Linking.useURL` catches it while the app is already running.
   * `seen` makes the overlap harmless.
   */
  const [captured, setCaptured] = useState<string | null>(() => takeIncomingUrl());
  useEffect(() => subscribeIncomingUrl(setCaptured), []);

  /** Where the user is, from the route. Deferral exists to protect these two. */
  const location: AppLocation = pathname?.startsWith('/sheet') ? 'sheet' : pathname?.startsWith('/create') ? 'creating' : 'idle';

  const decide = useCallback(async (text: string, at: AppLocation) => {
    const ids = (await listCharacters()).map((c) => c.id);
    const outcome = routeIncoming({ text, location: at, existingCharacterIds: ids });
    setParked(outcome.action === 'defer' ? text : null);
    setIncoming({ text, outcome });
  }, []);

  useEffect(() => {
    if (Platform.OS === 'web') return;
    // The app's own `runekeep://` deep links are routes, not this component's business.
    const url = [captured, linked].find((u) => isFilePayload(u) && !seen.current.has(u!));
    if (!url) return;
    seen.current.add(url);
    void (async () => {
      try {
        await decide(await readIncoming(url), location);
      } catch {
        setIncoming({
          text: '',
          outcome: { action: 'reject', message: "That file couldn't be read from where it was shared. Save it to your device first, then use Import in the Card Library." },
        });
      }
    })();
  }, [captured, linked, location, decide]);

  /** A parked file becomes actionable the moment the user reaches somewhere safe. */
  useEffect(() => {
    if (!parked || location !== 'idle' || incoming) return;
    void decide(parked, 'idle');
  }, [parked, location, incoming, decide]);

  if (!incoming) return null;
  const { text, outcome } = incoming;
  const close = () => setIncoming(null);

  switch (outcome.action) {
    case 'reject':
      return <PopupDialog title="Couldn't open that file" body={outcome.message} confirmLabel="OK" cancelLabel="Close" onConfirm={close} onCancel={close} />;

    case 'explain-card':
      return <PopupDialog title="That's a single card" body={outcome.message} confirmLabel="Got it" cancelLabel="Close" onConfirm={close} onCancel={close} />;

    case 'defer':
      return (
        <PopupDialog
          title="Import when you're free"
          body={outcome.reason}
          confirmLabel="Keep it for later"
          cancelLabel="Discard file"
          onConfirm={close}
          onCancel={() => { setParked(null); close(); }}
        />
      );

    case 'confirm-character':
      return (
        <PopupDialog
          title={outcome.replaces ? 'Replace this character?' : 'Import this character?'}
          body={
            outcome.replaces
              ? `${outcome.name} is already on your roster. Importing this file replaces that copy, and anything you have done to it since is lost.`
              : `${outcome.name} will be added to your roster.`
          }
          confirmLabel={outcome.replaces ? 'Replace' : 'Import'}
          destructive={!!outcome.replaces}
          onConfirm={() => {
            void (async () => {
              try {
                const parsed = parseRkp(text);
                if (parsed.kind === 'character') {
                  await saveCharacter(parsed.payload);
                  showToast(`${outcome.name} added to your roster`, 'success');
                  router.push('/characters' as Href);
                }
              } catch {
                showToast('That file could not be imported.', 'error');
              }
              close();
            })();
          }}
          onCancel={close}
        />
      );

    default:
      return (
        <PopupDialog
          title="Install this expansion?"
          body={`${outcome.name} will be added to your Card Library. You choose which characters can draw from it when you create them.`}
          confirmLabel="Install"
          onConfirm={() => {
            void (async () => {
              try {
                const parsed = parseRkp(text);
                if (parsed.kind === 'expansion') {
                  await saveExpansion(parsed.payload);
                  showToast(`${outcome.name} installed`, 'success');
                }
              } catch {
                showToast('That expansion could not be installed.', 'error');
              }
              close();
            })();
          }}
          onCancel={close}
        />
      );
  }
}
