import { useEffect, useState } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import Animated, { Easing, useAnimatedStyle, useSharedValue, withSequence, withSpring, withTiming } from 'react-native-reanimated';
import Svg, {  Path, Polygon, Polyline, Rect } from 'react-native-svg';

import { ArtImage } from '@/components/art-image';
import { ChamferBox } from '@/components/chamfer-box';
import { Body, Rune } from '@/constants/theme';
import { useReducedMotion } from '@/hooks/use-reduced-motion';
import { DeckGlyph } from './deck-glyph';
import { type DeckKey } from './create-types';

export function DeckTab({ deck, label, active, done, locked, pulseToken, onPress }: { deck: DeckKey; label: string; active: boolean; done: boolean; locked: boolean; pulseToken: number; onPress: () => void }) {
  const pulse = useSharedValue(1);
  const reduced = useReducedMotion();
  useEffect(() => {
    if (pulseToken > 0 && !reduced) {
      pulse.value = withSequence(withTiming(1.16, { duration: 180, easing: Easing.out(Easing.quad) }), withSpring(1, { damping: 12, stiffness: 180 }));
    }
  }, [pulseToken, pulse, reduced]);
  const anim = useAnimatedStyle(() => ({ transform: [{ scale: pulse.value }] }));
  const color = locked ? Rune.muted : active ? Rune.goldBright : done ? Rune.goldText : Rune.muted;
  return (
    <Pressable
      onPress={onPress}
      disabled={locked}
      style={{ width: 74 }}
      accessibilityRole="tab"
      accessibilityState={{ selected: active, disabled: locked }}
      accessibilityLabel={`${label}${locked ? ', locked' : done ? ', done' : ''}`}>
      <Animated.View style={anim}>
        <ChamferBox
          chamfer={7}
          fill={active ? 'rgba(224,181,99,0.12)' : 'transparent'}
          stroke={active ? Rune.goldBright : done ? 'rgba(218,162,73,0.55)' : 'rgba(147,142,136,0.3)'}
          strokeWidth={active ? 1.6 : 1.1}
          style={{ alignItems: 'center', paddingVertical: 7, gap: 3, opacity: locked ? 0.45 : 1, overflow: 'hidden' }}>
          <View>
            <DeckGlyph deck={deck} color={color} />
            {locked ? (
              <Svg width={10} height={10} viewBox="0 0 10 10" style={{ position: 'absolute', right: -7, top: -3 }}>
                <Rect x={1.5} y={4.5} width={7} height={5} fill={Rune.muted} />
                <Path d="M 3 4.5 V 3 a 2 2 0 0 1 4 0 v 1.5" fill="none" stroke={Rune.muted} strokeWidth={1.4} />
              </Svg>
            ) : done ? (
              <Svg width={11} height={11} viewBox="0 0 11 11" style={{ position: 'absolute', right: -8, top: -4 }}>
                <Polygon points="5.5,0 11,5.5 5.5,11 0,5.5" fill={Rune.gold} />
                <Polyline points="3,5.5 5,7.5 8.2,3.6" fill="none" stroke={Rune.ink} strokeWidth={1.5} />
              </Svg>
            ) : null}
          </View>
          <Text numberOfLines={1} style={{ color, fontSize: 7.5, fontFamily: Body.bold, letterSpacing: 0.3, textTransform: 'uppercase', maxWidth: '100%' }}>
            {label}
          </Text>
        </ChamferBox>
      </Animated.View>
    </Pressable>
  );
}

/** A section seam: plain gold hairlines flanking the label — the app's own divider language.
 *  (The ornamental CardDivider is for CARDS only, per owner.) */
export function SectionDivider({ label }: { label: string }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
      <View style={{ flex: 1, height: 1, backgroundColor: 'rgba(218,162,73,0.5)' }} />
      <Text style={{ color: Rune.goldText, fontSize: 10, fontFamily: Body.bold, letterSpacing: 2.4, textTransform: 'uppercase' }}>{label}</Text>
      <View style={{ flex: 1, height: 1, backgroundColor: 'rgba(218,162,73,0.5)' }} />
    </View>
  );
}

/** A small square-cornered segmented toggle (#121) — the app language is chamfered/flat, no radius. */
export function Segmented<T extends string>({ options, value, onChange }: { options: { key: T; label: string; disabled?: boolean }[]; value: T; onChange: (k: T) => void }) {
  return (
    <View style={{ flexDirection: 'row', borderWidth: 1, borderColor: 'rgba(218,162,73,0.4)' }}>
      {options.map((o, i) => {
        const active = o.key === value;
        return (
          <Pressable
            key={o.key}
            disabled={o.disabled}
            onPress={() => onChange(o.key)}
            accessibilityRole="button"
            accessibilityState={{ selected: active, disabled: o.disabled }}
            style={{ paddingHorizontal: 10, paddingVertical: 6, backgroundColor: active ? 'rgba(224,181,99,0.16)' : 'transparent', borderLeftWidth: i ? 1 : 0, borderLeftColor: 'rgba(218,162,73,0.3)', opacity: o.disabled ? 0.4 : 1 }}>
            <Text style={{ color: active ? Rune.goldBright : Rune.muted, fontSize: 9.5, fontFamily: Body.bold, letterSpacing: 0.5, textTransform: 'uppercase' }}>{o.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

/**
 * One creation step as a ROW, for the desktop step column (v0.45.0). Same states as the phone's tab: active,
 * done (gold diamond), locked (padlock, dimmed, not pressable), and the unlock pulse when a class opens it.
 */
export function DeckStepRow({ deck, label, active, done, locked, pulseToken, onPress }: { deck: DeckKey; label: string; active: boolean; done: boolean; locked: boolean; pulseToken: number; onPress: () => void }) {
  const pulse = useSharedValue(1);
  const reduced = useReducedMotion();
  const [hover, setHover] = useState(false);
  useEffect(() => {
    if (pulseToken > 0 && !reduced) {
      pulse.value = withSequence(withTiming(1.05, { duration: 180, easing: Easing.out(Easing.quad) }), withSpring(1, { damping: 12, stiffness: 180 }));
    }
  }, [pulseToken, pulse, reduced]);
  const anim = useAnimatedStyle(() => ({ transform: [{ scale: pulse.value }] }));
  const color = locked ? Rune.muted : active ? Rune.goldBright : done ? Rune.goldText : hover ? Rune.ivory : Rune.sheet;
  return (
    <Pressable
      onPress={onPress}
      disabled={locked}
      onHoverIn={() => setHover(true)}
      onHoverOut={() => setHover(false)}
      accessibilityRole="tab"
      accessibilityState={{ selected: active, disabled: locked }}
      accessibilityLabel={`${label}${locked ? ', locked' : done ? ', done' : ''}`}>
      <Animated.View style={anim}>
        <ChamferBox
          chamfer={7}
          fill={active ? 'rgba(224,181,99,0.12)' : hover && !locked ? 'rgba(224,181,99,0.05)' : 'transparent'}
          stroke={active ? Rune.goldBright : done ? 'rgba(218,162,73,0.55)' : 'rgba(147,142,136,0.3)'}
          strokeWidth={active ? 1.6 : 1.1}
          style={{ flexDirection: 'row', alignItems: 'center', gap: 12, height: 42, paddingHorizontal: 12, opacity: locked ? 0.45 : 1 }}>
          <DeckGlyph deck={deck} color={color} />
          <Text numberOfLines={1} style={{ flex: 1, color, fontSize: 12, fontFamily: Body.bold, letterSpacing: 1, textTransform: 'uppercase' }}>{label}</Text>
          {locked ? (
            <Svg width={12} height={12} viewBox="0 0 10 10">
              <Rect x={1.5} y={4.5} width={7} height={5} fill={Rune.muted} />
              <Path d="M 3 4.5 V 3 a 2 2 0 0 1 4 0 v 1.5" fill="none" stroke={Rune.muted} strokeWidth={1.4} />
            </Svg>
          ) : done ? (
            <Svg width={13} height={13} viewBox="0 0 11 11">
              <Polygon points="5.5,0 11,5.5 5.5,11 0,5.5" fill={Rune.gold} />
              <Polyline points="3,5.5 5,7.5 8.2,3.6" fill="none" stroke={Rune.ink} strokeWidth={1.5} />
            </Svg>
          ) : null}
        </ChamferBox>
      </Animated.View>
    </Pressable>
  );
}

/** One line of the hero column: what a step holds so far. */
export interface HeroRow { key: DeckKey; label: string; done: boolean; locked: boolean; thumbs: number[]; text: string }

/**
 * "Your hero" (v0.45.0, desktop): every step and what it holds so far, the chosen cards as small thumbs, so a
 * wide screen shows the character coming together beside the deck being chosen from. A row jumps to its step.
 */
export function HeroColumn({ rows, onJump, width }: { rows: HeroRow[]; onJump: (k: DeckKey) => void; width: number }) {
  return (
    <ScrollView style={{ width, flexGrow: 0 }} contentContainerStyle={{ gap: 10, paddingBottom: 24 }} showsVerticalScrollIndicator={false}>
      <SectionDivider label="Your hero" />
      {rows.map((r) => (
        <Pressable key={r.key} onPress={() => onJump(r.key)} disabled={r.locked} accessibilityRole="button" accessibilityLabel={`${r.label}: ${r.text || 'not chosen yet'}`}>
          {({ hovered }: { hovered?: boolean }) => (
            <View style={{ gap: 5, paddingVertical: 4, paddingHorizontal: 6, borderRadius: 6, backgroundColor: hovered && !r.locked ? 'rgba(224,181,99,0.06)' : 'transparent', opacity: r.locked ? 0.45 : 1 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <Text style={{ flex: 1, color: r.done ? Rune.goldText : Rune.muted, fontSize: 10.5, fontFamily: Body.bold, letterSpacing: 1.2, textTransform: 'uppercase' }}>{r.label}</Text>
                {r.done ? <View style={{ width: 7, height: 7, backgroundColor: Rune.gold, transform: [{ rotate: '45deg' }] }} /> : null}
              </View>
              {r.thumbs.length ? (
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
                  {r.thumbs.map((t, i) => (
                    <View key={i} style={{ width: 54, height: 75, borderRadius: 4, overflow: 'hidden', backgroundColor: Rune.ink }}>
                      <ArtImage source={t} fit="cover" />
                    </View>
                  ))}
                </View>
              ) : null}
              {r.text ? <Text numberOfLines={3} style={{ color: Rune.sheet, fontSize: 12, fontFamily: Body.medium, lineHeight: 16 }}>{r.text}</Text> : null}
              {!r.thumbs.length && !r.text ? <Text style={{ color: Rune.muted, fontSize: 12, fontFamily: Body.regular }}>{r.locked ? 'Choose a class first' : 'Not chosen yet'}</Text> : null}
            </View>
          )}
        </Pressable>
      ))}
    </ScrollView>
  );
}
