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
import { StatusBar } from 'expo-status-bar';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { Rune } from '@/constants/theme';
import { PhoneFrame } from '@/components/phone-frame';
import { ToastHost } from '@/components/toast';
import { IncomingFileGate } from '@/features/share/incoming-file';

/**
 * Root layout. Establishes the three providers every screen relies on:
 * - GestureHandlerRootView: required or all gesture-handler gestures silently no-op.
 * - SafeAreaProvider: gives screens the device insets (notch / home indicator).
 * - Stack: headerless native stack; each screen paints its own chrome.
 *
 * Also loads the Archivo superfamily before first paint so text never flashes a fallback.
 */
export default function RootLayout() {
  const [fontsLoaded, fontError] = useFonts({
    Archivo_400Regular,
    Archivo_400Regular_Italic,
    Archivo_500Medium,
    Archivo_600SemiBold,
    Archivo_700Bold,
    Archivo_800ExtraBold,
    Archivo_900Black,
  });

  if (!fontsLoaded && !fontError) return null;

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
