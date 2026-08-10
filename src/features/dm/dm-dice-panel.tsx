/**
 * The DM's dice tray (v0.40.0, owner) — the character sheet's tray, in the dark.
 *
 * "The DM UI must work exactly the same in its dicerolling mechanics, just its panels are in dark
 * mode instead of light mode." So this is not a second implementation of anything: it is the same
 * `DiceTrayPanels` with its own three boxes and the DM palette, which is exactly what that component
 * was parameterised for. Everything the mechanics do — the carousel, the pair binding, the grid, the
 * pitch ladder, the result animations, the roll gate — is the same code, and it cannot drift.
 *
 * The one difference is the trait row: a DM is not playing a character, so there is nothing to add a
 * modifier from. The duality pair is still in the carousel, because it is the one roll a DM might
 * want, which is the owner's own note.
 *
 * The panel sizes itself to the screen rather than to a design space: DM Mode is plain flex (see
 * `AppScreen`), so the tray's boxes are laid out from the measured column instead of from 412x892.
 */
import { useMemo, useState } from 'react';
import { Pressable, Text, View } from 'react-native';

import { ChamferBox } from '@/components/chamfer-box';
import { Body, Display, DmRune, DmType } from '@/constants/theme';
import { DmDiceIcon } from './dm-icons';
import { DiceTrayPanels, type TrayLayout } from '@/features/character-sheet/sheet/dice-tray';
import { DimScreen } from '@/lib/screen-dim';
import { playSfx } from '@/lib/sfx';
import { useAndroidBack } from './use-android-back';

/** The tray's own proportions, from the measured panel. Same reading order as the sheet's. */
function layoutFor(w: number, h: number): TrayLayout {
  const pad = 14;
  const inner = w - pad * 2;
  const carH = 82;
  const rowH = 40;
  const gap = 12;
  const poolH = Math.max(140, h - pad * 2 - carH - rowH - gap * 2);
  return {
    width: w,
    height: h,
    carousel: { left: pad, top: pad, w: inner, h: carH },
    pool: { left: pad, top: pad + carH + gap, w: inner, h: poolH },
    row: { left: pad, top: pad + carH + gap + poolH + gap, w: inner, h: rowH },
  };
}

export function DmDicePanel({ onClose }: { onClose: () => void }) {
  const [size, setSize] = useState<{ w: number; h: number } | null>(null);
  useAndroidBack(() => { onClose(); return true; });
  const layout = useMemo(() => (size ? layoutFor(size.w, size.h) : null), [size]);

  return (
    <View style={{ position: 'absolute', left: 0, top: 0, right: 0, bottom: 0, zIndex: 500, alignItems: 'center', justifyContent: 'center' }}>
      {/* The scrim closes it, and the panel below swallows its own taps so a near-miss inside does not. */}
      <Pressable style={{ position: 'absolute', left: 0, top: 0, right: 0, bottom: 0, backgroundColor: 'rgba(6,8,13,0.88)' }} onPress={onClose} accessibilityRole="button" accessibilityLabel="Close the dice tray" />
      <DimScreen opacity={0.88} />
      <Pressable onPress={() => {}} style={{ width: '92%', maxWidth: 420, height: '78%', maxHeight: 620 }}>
        <ChamferBox chamfer={14} fill={DmRune.ink} stroke={DmRune.line} strokeWidth={1.6} style={{ flex: 1, paddingTop: 12 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, marginBottom: 6 }}>
            <Text style={{ flex: 1, color: DmRune.ivory, fontSize: DmType.title, fontFamily: Display.black, letterSpacing: 1.2, textTransform: 'uppercase' }}>Dice</Text>
            <Pressable onPress={() => { playSfx('panelClose'); onClose(); }} hitSlop={12} accessibilityRole="button" accessibilityLabel="Close">
              <Text style={{ color: DmRune.muted, fontSize: 20, fontFamily: Body.bold }}>✕</Text>
            </Pressable>
          </View>
          <View style={{ flex: 1 }} onLayout={(e) => setSize({ w: e.nativeEvent.layout.width, h: e.nativeEvent.layout.height })}>
            {layout ? <DiceTrayPanels layout={layout} dm hint="Tap a die above to pick it up." /> : null}
          </View>
        </ChamferBox>
      </Pressable>
    </View>
  );
}

/** The control-row button, between Finish Encounter and the card archive (owner, v0.40.0). */
export function DmDiceButton({ size = 16, onPress, height }: { size?: number; onPress: () => void; height: number }) {
  return (
    <Pressable onPress={() => { playSfx('panelOpen'); onPress(); }} hitSlop={8} accessibilityRole="button" accessibilityLabel="Open the dice tray">
      <ChamferBox chamfer={5} fill="transparent" stroke={DmRune.line} strokeWidth={1.1} style={{ width: height, height, alignItems: 'center', justifyContent: 'center' }}>
        <DmDiceIcon size={size} />
      </ChamferBox>
    </Pressable>
  );
}
