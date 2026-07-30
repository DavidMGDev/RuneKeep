import { Text, View } from 'react-native';

import { ChamferBox } from '@/components/chamfer-box';
import { Body, Display, Rune } from '@/constants/theme';
import { KEYBIND_HELP } from '@/lib/keybinds';

/**
 * The desktop keyboard card (v0.26.0).
 *
 * Shown only where there is a keyboard to use, so a phone never sees it. The bindings come from
 * `lib/keybinds` rather than being retyped here, because a help page that disagrees with the app is
 * worse than no help page.
 */
export function KeysDemo() {
  return (
    <View style={{ height: 210, alignItems: 'center', justifyContent: 'center' }}>
      <ChamferBox
        chamfer={10}
        fill="rgba(14,17,22,0.92)"
        stroke="rgba(218,162,73,0.4)"
        strokeWidth={1.2}
        style={{ paddingHorizontal: 14, paddingVertical: 10, width: 320 }}>
        {KEYBIND_HELP.map((row) => (
          <View key={row.keys} style={{ flexDirection: 'row', alignItems: 'center', marginVertical: 1.5 }}>
            <Text style={{ width: 118, color: Rune.goldBright, fontSize: 10.5, fontFamily: Display.bold, letterSpacing: 0.4 }}>{row.keys}</Text>
            <Text style={{ flex: 1, color: Rune.muted, fontSize: 11, fontFamily: Body.medium }}>{row.what}</Text>
          </View>
        ))}
      </ChamferBox>
    </View>
  );
}
