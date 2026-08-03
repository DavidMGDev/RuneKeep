import { useCallback, useEffect, useRef, useState } from 'react';
import { Linking, Platform, Pressable, Text, View } from 'react-native';

import { ChamferBox } from '@/components/chamfer-box';
import { PopupDialog } from '@/components/popup-dialog';
import { Body, Display, Rune } from '@/constants/theme';
import { playSfx } from '@/lib/sfx';
import { ANDROID_DOWNLOAD_URL, hardReloadWeb, isNewerVersion, latestReleaseTag, webUpdateWaiting } from '@/lib/update-check';

/** This build's version, as declared in app.json. */
export function appVersion(): string | undefined {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const Constants = require('expo-constants').default as { expoConfig?: { version?: string } };
    return Constants?.expoConfig?.version;
  } catch {
    return undefined;
  }
}

/**
 * "There is a newer RuneKeep" (v0.32.0) — a quiet strip on the main menu, and nothing at all when
 * the app is current.
 *
 * The menu is the right place for it: it is the one screen nobody is mid-anything on. It never
 * interrupts, it never downloads on its own, and it checks once per launch rather than on a timer,
 * because a version does not change while you are looking at it.
 *
 * v0.33.0 splits the strip from its confirmation. The dialog dims the screen, and a dialog rendered
 * down here can only dim the column the menu's content sits in, leaving the gold border bright around
 * a grey rectangle. It goes in `AppScreen`'s `overlay` slot instead, which is drawn over everything.
 * The strip owns the state and hands the dialog back through `render`.
 */
export function UpdateBanner({ onDialog }: { onDialog?: (dialog: React.ReactNode) => void }) {
  const [tag, setTag] = useState<string | null>(null); // native: the newer release
  const [webReady, setWebReady] = useState(false); // web: a new build is cached and waiting
  const [asking, setAsking] = useState(false);
  const checked = useRef(false);

  useEffect(() => {
    if (checked.current) return;
    checked.current = true;
    const ac = new AbortController();
    void (async () => {
      if (Platform.OS === 'web') {
        setWebReady(await webUpdateWaiting());
        return;
      }
      const latest = await latestReleaseTag(ac.signal);
      if (latest && isNewerVersion(latest, appVersion())) setTag(latest);
    })();
    return () => ac.abort();
  }, []);

  const open = useCallback(() => {
    playSfx('buttonTap');
    setAsking(true);
  }, []);
  const confirm = useCallback(() => {
    setAsking(false);
    if (Platform.OS === 'web') void hardReloadWeb();
    else void Linking.openURL(ANDROID_DOWNLOAD_URL);
  }, []);

  // The dialog is rendered by whoever owns the screen, so it can cover the border too.
  useEffect(() => {
    onDialog?.(
      asking ? (
        <PopupDialog
          title={Platform.OS === 'web' ? 'Reload RuneKeep?' : 'Download the new version?'}
          body={
            Platform.OS === 'web'
              ? 'A newer build is already downloaded. Reloading clears the old files and starts it. Your characters are stored on this device and are not touched.'
              : 'This opens the download page in your browser. Install it over the top of this one: your characters stay where they are.'
          }
          confirmLabel={Platform.OS === 'web' ? 'Reload' : 'Open the download'}
          onConfirm={confirm}
          onCancel={() => setAsking(false)}
        />
      ) : null,
    );
  }, [asking, confirm, onDialog]);

  const showing = Platform.OS === 'web' ? webReady : !!tag;
  if (!showing) return null;
  const label = Platform.OS === 'web' ? 'A newer version is ready' : `RuneKeep ${tag?.replace(/^v/, '')} is out`;
  return (
    <Pressable onPress={open} accessibilityRole="button" accessibilityLabel={`${label}. Tap to update`}>
      <ChamferBox chamfer={8} fill="rgba(20,24,31,0.9)" stroke={Rune.goldBright} strokeWidth={1.3} style={{ paddingHorizontal: 14, paddingVertical: 8, flexDirection: 'row', alignItems: 'center', gap: 10 }}>
        <View style={{ width: 7, height: 7, borderRadius: 4, backgroundColor: Rune.goldBright }} />
        <Text style={{ color: Rune.goldText, fontSize: 11, fontFamily: Body.bold, letterSpacing: 0.8, textTransform: 'uppercase' }}>{label}</Text>
        <Text style={{ color: Rune.bronze, fontSize: 11, fontFamily: Display.bold }}>{Platform.OS === 'web' ? 'RELOAD' : 'GET IT'}</Text>
      </ChamferBox>
    </Pressable>
  );
}
