import {
  Archivo_400Regular,
  Archivo_400Regular_Italic,
  Archivo_500Medium,
  Archivo_600SemiBold,
  Archivo_700Bold,
  Archivo_800ExtraBold,
  Archivo_900Black,
  useFonts,
} from '@expo-google-fonts/archivo';
import { Stack } from 'expo-router';
import { useEffect, useState } from 'react';
import { Platform } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { Rune } from '@/constants/theme';
import { PhoneFrame } from '@/components/phone-frame';
import { ToastHost } from '@/components/toast';
import { IncomingFileGate } from '@/features/share/incoming-file';
import { hydrateWebStore } from '@/lib/web-store';

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

  const [fontsLoaded, fontError] = useFonts({
    Archivo_400Regular,
    Archivo_400Regular_Italic,
    Archivo_500Medium,
    Archivo_600SemiBold,
    Archivo_700Bold,
    Archivo_800ExtraBold,
    Archivo_900Black,
  });

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
