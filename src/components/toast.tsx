/**
 * Toast (v0.16.0) — a tiny app-wide transient message. A module-level emitter + one `ToastHost` mounted
 * in the root layout. Call `showToast(msg)` from anywhere (DM enable-confirm, locked vitals, bulk-op
 * errors). No provider/context to thread; deliberately minimal.
 */
import { useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Animated, { FadeInDown, FadeOut } from 'react-native-reanimated';

import { ChamferBox } from '@/components/chamfer-box';
import { Body, DmRune, Rune } from '@/constants/theme';

export type ToastTone = 'info' | 'error' | 'success';
interface ToastMsg { id: number; text: string; tone: ToastTone }

let seq = 1;
const listeners = new Set<(m: ToastMsg) => void>();

export function showToast(text: string, tone: ToastTone = 'info') {
  const msg = { id: seq++, text, tone };
  for (const l of listeners) l(msg);
}

const TONE_COLOR: Record<ToastTone, string> = { info: DmRune.accent, error: Rune.red, success: '#7BC98A' };

export function ToastHost() {
  const [items, setItems] = useState<ToastMsg[]>([]);
  useEffect(() => {
    const on = (m: ToastMsg) => {
      setItems((cur) => [...cur, m]);
      setTimeout(() => setItems((cur) => cur.filter((x) => x.id !== m.id)), 2600);
    };
    listeners.add(on);
    return () => { listeners.delete(on); };
  }, []);

  if (items.length === 0) return null;
  return (
    <View pointerEvents="none" style={[StyleSheet.absoluteFill, { alignItems: 'center', justifyContent: 'flex-end', paddingBottom: 96, zIndex: 9999 }]}>
      <View style={{ gap: 8, alignItems: 'center' }}>
        {items.map((m) => (
          <Animated.View key={m.id} entering={FadeInDown.springify().damping(18)} exiting={FadeOut}>
            <ChamferBox chamfer={9} fill="rgba(12,15,20,0.97)" stroke={TONE_COLOR[m.tone]} strokeWidth={1.4} style={{ paddingHorizontal: 18, paddingVertical: 11, maxWidth: 340 }}>
              <Text style={{ color: Rune.ivory, fontSize: 13, fontFamily: Body.semibold, letterSpacing: 0.3, textAlign: 'center' }}>{m.text}</Text>
            </ChamferBox>
          </Animated.View>
        ))}
      </View>
    </View>
  );
}
