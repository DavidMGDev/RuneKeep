import { NavigationContext } from '@react-navigation/native';
import { useCallback, useContext, useRef } from 'react';

/**
 * Whether the screen this component lives on is the one in front, read when called (v0.45.0). A document key
 * handler on a screen that is covered (a tour pushed over the creator, over the sheet) must stand aside, or a
 * key meant for the screen on top reaches the hidden one too. Outside a navigator it is always true.
 */
export function useScreenFocus(): () => boolean {
  const nav = useContext(NavigationContext);
  const ref = useRef(nav);
  ref.current = nav;
  return useCallback(() => ref.current?.isFocused?.() ?? true, []);
}
