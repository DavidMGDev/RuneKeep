/**
 * useAndroidBack (v0.18.0 item 3) — run a handler on the Android hardware back button. Return true to
 * consume the event (close a panel/preview) instead of letting it pop the navigation stack. Handlers are
 * called most-recently-registered first, so a stacked modal closes before the screen underneath it.
 */
import { useEffect } from 'react';
import { BackHandler } from 'react-native';

export function useAndroidBack(handler: () => boolean) {
  useEffect(() => {
    const sub = BackHandler.addEventListener('hardwareBackPress', handler);
    return () => sub.remove();
  }, [handler]);
}
