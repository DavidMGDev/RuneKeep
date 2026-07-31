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
 *
 * v0.29.0: rebuilt to be readable. It was two loose columns of text with almost no space between the
 * rows, and since a couple of the descriptions wrapped onto a second line the columns drifted out of
 * step, so working out which key did what meant tracing across the gap with a finger. Now each key is
 * drawn as a key, every row is the same height with a hairline under it, and the descriptions are
 * short enough that none of them wrap.
 */
function Cap({ label }: { label: string }) {
  // Wide enough for "Space" and "Shift", square-ish for a single letter, so a row reads as a line of
  // keys rather than a line of boxes.
  return (
    <ChamferBox
      chamfer={4}
      fill="rgba(218,162,73,0.14)"
      stroke={Rune.goldEdge}
      strokeWidth={1}
      style={{ minWidth: label.length > 1 ? 40 : 22, height: 22, paddingHorizontal: 6, alignItems: 'center', justifyContent: 'center' }}>
      <Text style={{ color: Rune.goldBright, fontSize: 10.5, fontFamily: Display.bold, letterSpacing: 0.3 }}>{label}</Text>
    </ChamferBox>
  );
}

export function KeysDemo() {
  return (
    <View style={{ alignItems: 'center', justifyContent: 'center' }}>
      <ChamferBox
        chamfer={10}
        fill="rgba(14,17,22,0.92)"
        stroke="rgba(218,162,73,0.4)"
        strokeWidth={1.2}
        style={{ paddingHorizontal: 14, paddingVertical: 8, width: 330 }}>
        {KEYBIND_HELP.map((row, i) => (
          <View
            key={row.what}
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              height: 30,
              gap: 5,
              // A hairline between rows, but not under the last: it is the cue that pairs a key with
              // its meaning across the gap, which is the whole problem this card had.
              borderBottomWidth: i === KEYBIND_HELP.length - 1 ? 0 : 1,
              borderBottomColor: 'rgba(218,162,73,0.13)',
            }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, width: 122 }}>
              {row.caps.map((c) => (
                <Cap key={c} label={c} />
              ))}
            </View>
            <Text numberOfLines={1} style={{ flex: 1, color: Rune.ivory, fontSize: 11.5, fontFamily: Body.medium }}>
              {row.what}
            </Text>
          </View>
        ))}
      </ChamferBox>
    </View>
  );
}
