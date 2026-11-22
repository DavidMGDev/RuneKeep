import { useFonts } from 'expo-font';
import { Stack } from 'expo-router';
import { useEffect, useState } from 'react';
import { AppState, Platform } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { Rune } from '@/constants/theme';
import { flushCharacters } from '@/lib/character-store';
import { PhoneFrame } from '@/components/phone-frame';
import { ToastHost } from '@/components/toast';
import { IncomingFileGate } from '@/features/share/incoming-file';
import { hydrateWebStore } from '@/lib/web-store';

// The fonts are the repo's own files: Cloudflare Pages drops any folder named node_modules, so a font imported from
// the package shipped to dev and 404'd (as the app's page) on the site.
const FONTS = {
  Archivo_400Regular: require('../../assets/fonts/Archivo_400Regular.ttf'),
  Archivo_400Regular_Italic: require('../../assets/fonts/Archivo_400Regular_Italic.ttf'),
  Archivo_500Medium: require('../../assets/fonts/Archivo_500Medium.ttf'),
  Archivo_600SemiBold: require('../../assets/fonts/Archivo_600SemiBold.ttf'),
  Archivo_700Bold: require('../../assets/fonts/Archivo_700Bold.ttf'),
  Archivo_800ExtraBold: require('../../assets/fonts/Archivo_800ExtraBold.ttf'),
  Archivo_900Black: require('../../assets/fonts/Archivo_900Black.ttf'),
};

/**
 * Root layout. Establishes the three providers every screen relies on:
 * - GestureHandlerRootView: required or all gesture-handler gestures silently no-op.
 * - SafeAreaProvider: gives screens the device insets (notch / home indicator).
 * - Stack: headerless native stack; each screen paints its own chrome.
 *
 * Also loads the Archivo superfamily before first paint so text never flashes a fallback.
 */
export default function RootLayout() {
  // v0.24.2 (web only): the browser stores read synchronously during render, so IndexedDB has to be
  // in memory before anything mounts. Native resolves this on the first tick and never waits.
  const [stored, setStored] = useState(Platform.OS !== 'web');
  useEffect(() => {
    void hydrateWebStore().then(() => setStored(true));
  }, []);

  // Character writes are queued and coalesced (character-store), because each one serializes and
  // writes the whole file synchronously on the JS thread. Going to the background is where a process
  // gets killed, so that is where the queue has to reach the disk.
  useEffect(() => {
    const sub = AppState.addEventListener('change', (state) => {
      if (state !== 'active') flushCharacters();
    });
    return () => sub.remove();
  }, []);

  const [fontsLoaded, fontError] = useFonts(FONTS);

  if ((!fontsLoaded && !fontError) || !stored) return null;

  return (
    <GestureHandlerRootView style={{ flex: 1, backgroundColor: Rune.ink }}>
      <SafeAreaProvider>
        {/* Shown over the app's ink navy (the root background) so it reads as part of the border
            band; the sheet itself is pushed below it (#43 A). `hidden` is set EXPLICITLY: the bar
            was hidden by an earlier build, and Expo Go keeps the native flag across reloads unless
            a component actively claims it (#48 A). */}
        <StatusBar style="light" hidden={false} translucent />
        {/* v0.24.0: on a tablet everything below renders into a phone-shaped, magnified viewport, so
            the app looks the same at any size and the border sits on a real edge. A no-op on phones. */}
        <PhoneFrame>
          <Stack
            screenOptions={{
              headerShown: false,
              contentStyle: { backgroundColor: Rune.ink },
              animation: 'fade',
            }}
          />
          {/* v0.22.0: a .rkp opened from WhatsApp or a file manager lands here. It never imports on
              arrival — it asks, and defers entirely while a sheet or the creator is open. */}
          <IncomingFileGate />
          <ToastHost />
        </PhoneFrame>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
