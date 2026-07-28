/**
 * Toast (v0.16.0) — a tiny app-wide transient message. A module-level emitter + one `ToastHost` mounted
 * in the root layout. Call `showToast(msg)` from anywhere (DM enable-confirm, locked vitals, bulk-op
 * errors). No provider/context to thread; deliberately minimal.
 */
import { useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Animated, { FadeInUp, FadeOut } from 'react-native-reanimated';

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

const TONE_COLOR: Record<ToastTone, string> = { info: Rune.goldEdge, error: '#7A3A32', success: Rune.goldEdge };

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
    // v0.23.0: matched to the sheet's StatToastHost -- pinned just below the top border, compact
    // pill, tone on the stroke. There is now ONE toast look in the app.
    <View pointerEvents="none" style={[StyleSheet.absoluteFill, { alignItems: 'center', justifyContent: 'flex-start', paddingTop: 46, zIndex: 9999 }]}>
      <View style={{ gap: 6, alignItems: 'center' }}>
        {items.map((m) => (
          <Animated.View key={m.id} entering={FadeInUp.springify().damping(18)} exiting={FadeOut}>
            <ChamferBox chamfer={7} fill="rgba(12,15,20,0.96)" stroke={TONE_COLOR[m.tone]} strokeWidth={1.2} style={{ paddingHorizontal: 13, paddingVertical: 6, maxWidth: 320 }}>
              <Text style={{ color: m.tone === 'error' ? '#E2705A' : Rune.goldText, fontSize: 12.5, fontFamily: Body.bold, letterSpacing: 0.3, textAlign: 'center' }}>{m.text}</Text>
            </ChamferBox>
          </Animated.View>
        ))}
      </View>
    </View>
  );
}
