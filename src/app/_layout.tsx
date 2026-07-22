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
import { ToastHost } from '@/components/toast';

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
        <Stack
          screenOptions={{
            headerShown: false,
            contentStyle: { backgroundColor: Rune.ink },
            animation: 'fade',
          }}
        />
        <ToastHost />
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
