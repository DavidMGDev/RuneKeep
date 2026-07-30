import { useState } from 'react';
import { Text, View } from 'react-native';
import Svg, { Path, Rect } from 'react-native-svg';

import { ChamferBox } from '@/components/chamfer-box';
import { RuneButton } from '@/components/rune-button';
import { Body, Display, Rune } from '@/constants/theme';
import { type InstallMode, promptInstall } from '@/lib/pwa-install';
import { playSfx } from '@/lib/sfx';

import { Stage } from './demos';

const GOLD = Rune.goldBright;
const DIM = 'rgba(218,162,73,0.32)';

/** A phone with browser chrome at both ends, next to the same phone without it. The whole argument. */
function BeforeAfter() {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 18 }}>
      <PhoneSketch chrome />
      <Svg width={22} height={22} viewBox="0 0 24 24">
        <Path d="M4 12 h14 M13 7 l5 5 l-5 5" fill="none" stroke={GOLD} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
      </Svg>
      <PhoneSketch />
    </View>
  );
}

function PhoneSketch({ chrome }: { chrome?: boolean }) {
  const W = 74;
  const H = 132;
  return (
    <View style={{ width: W, height: H }}>
      <ChamferBox chamfer={7} fill="rgba(14,17,22,0.96)" stroke={chrome ? DIM : GOLD} strokeWidth={1.4} style={{ width: W, height: H, overflow: 'hidden' }}>
        {/* the browser's address bar and toolbar, the things an installed app does not have */}
        {chrome ? <View style={{ height: 15, backgroundColor: 'rgba(120,124,132,0.5)' }} /> : null}
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', gap: 5 }}>
          <Svg width={26} height={26} viewBox="0 0 24 24">
            <Rect x={4} y={3} width={16} height={18} rx={1.5} fill="none" stroke={chrome ? DIM : GOLD} strokeWidth={1.6} />
            <Path d="M8 8 h8 M8 12 h8 M8 16 h5" stroke={chrome ? DIM : GOLD} strokeWidth={1.4} strokeLinecap="round" />
          </Svg>
        </View>
        {chrome ? <View style={{ height: 12, backgroundColor: 'rgba(120,124,132,0.5)' }} /> : null}
      </ChamferBox>
    </View>
  );
}

/** iOS share glyph: the box with the arrow rising out of it. */
function ShareGlyph() {
  return (
    <Svg width={17} height={17} viewBox="0 0 24 24">
      <Path d="M12 3 v11 M8.5 6.5 L12 3 l3.5 3.5" fill="none" stroke={GOLD} strokeWidth={1.9} strokeLinecap="round" strokeLinejoin="round" />
      <Path d="M6 11 H5 v9 h14 v-9 h-1" fill="none" stroke={GOLD} strokeWidth={1.9} strokeLinecap="round" strokeLinejoin="round" />
    </Svg>
  );
}

/** The browser's own three-dot menu, so the instruction points at something recognisable. */
function MenuGlyph() {
  return (
    <Svg width={17} height={17} viewBox="0 0 24 24">
      <Path d="M12 5.6 v0.01 M12 12 v0.01 M12 18.4 v0.01" stroke={GOLD} strokeWidth={3.4} strokeLinecap="round" />
    </Svg>
  );
}

function Step({ glyph, text }: { glyph?: React.ReactNode; text: string }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 9 }}>
      {glyph ?? <View style={{ width: 17 }} />}
      <Text style={{ flex: 1, color: Rune.sheet, fontSize: 13, fontFamily: Body.medium, lineHeight: 19 }}>{text}</Text>
    </View>
  );
}

/**
 * The install step (v0.24.4), first page of the welcome tour and shown only in a mobile browser that
 * is not already installed. See `lib/pwa-install` for why each platform needs a different answer.
 *
 * It never blocks: "Not now" is always there, because a player who is only looking should not have to
 * install anything to look.
 */
export function InstallDemo({ mode, onInstalled }: { mode: InstallMode; onInstalled: () => void }) {
  const [asking, setAsking] = useState(false);
  // The stage is a FIXED height so paging never makes the text jump, and three steps of instructions
  // do not fit under the phone sketch. So where there are steps to read, they ARE the demo.
  return (
    <Stage>
      <View style={{ alignItems: 'center', gap: 14 }}>
        {mode === 'prompt' ? (
          <View style={{ width: 260, alignItems: 'center', gap: 14 }}>
            <BeforeAfter />
            <RuneButton
              label={asking ? 'Check your screen' : 'Install RuneKeep'}
              kind="primary"
              height={44}
              disabled={asking}
              onPress={() => {
                playSfx('buttonTap');
                setAsking(true);
                void promptInstall().then((ok) => {
                  setAsking(false);
                  if (ok) onInstalled();
                });
              }}
            />
          </View>
        ) : (
          <ChamferBox chamfer={9} fill="rgba(14,17,22,0.96)" stroke={DIM} strokeWidth={1.2} style={{ width: 292, paddingHorizontal: 13, paddingVertical: 12, gap: 9 }}>
            <Text style={{ color: Rune.bronze, fontSize: 9.5, fontFamily: Display.black, letterSpacing: 1.1, textTransform: 'uppercase' }}>
              {mode === 'ios' ? 'In Safari' : 'In your browser menu'}
            </Text>
            {mode === 'ios' ? (
              <>
                <Step glyph={<ShareGlyph />} text="Tap Share, at the bottom of the screen." />
                <Step text="Choose Add to Home Screen." />
                <Step text="Open RuneKeep from your home screen." />
              </>
            ) : (
              <>
                <Step glyph={<MenuGlyph />} text="Open the menu, usually three dots." />
                <Step text="Choose Install app, or Add to Home screen." />
                <Step text="Open RuneKeep from your home screen." />
              </>
            )}
          </ChamferBox>
        )}
      </View>
    </Stage>
  );
}
