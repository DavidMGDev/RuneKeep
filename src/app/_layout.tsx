import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { Rune } from '@/constants/theme';

/**
 * Root layout. Establishes the three providers every screen relies on:
 * - GestureHandlerRootView: required or all gesture-handler gestures silently no-op.
 * - SafeAreaProvider: gives screens the device insets (notch / home indicator).
 * - Stack: headerless native stack; each screen paints its own chrome.
 */
export default function RootLayout() {
  return (
    <GestureHandlerRootView style={{ flex: 1, backgroundColor: Rune.ink }}>
      <SafeAreaProvider>
        <StatusBar style="light" />
        <Stack
          screenOptions={{
            headerShown: false,
            contentStyle: { backgroundColor: Rune.ink },
            animation: 'fade',
          }}
        />
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
