/**
 * Shared adversary presentation (v0.17.0, items 8/10/12): a portrait thumbnail with a Base-Game default
 * emblem, a full SRD stat-block detail block (tier · role, difficulty/thresholds/HP/stress, attack, motives,
 * experience, features), and a fullscreen image viewer. Reused by the CombatantPanel and the library.
 */
import { useEffect } from 'react';
import { Text, View } from 'react-native';
import { Image } from 'expo-image'; // item 2: robust with base64 data-URIs (imported/custom portraits)
import Animated, { Easing, FadeIn, FadeOut, useAnimatedStyle, useSharedValue, withTiming, runOnJS } from 'react-native-reanimated';
import Svg, { Circle, Path, Polygon } from 'react-native-svg';

import { ChamferBox } from '@/components/chamfer-box';
import { DmType, Body, Display, DmRune } from '@/constants/theme';
import { type AdversaryFeature } from '@/data/adversaries';
import { type Combatant } from '@/lib/session';
import { useLayout } from '@/hooks/use-layout';
import { useScreenDim } from '@/lib/screen-dim';
import { useAndroidBack } from './use-android-back';
import { DmPress } from './dm-ui';

/** A stylised tome/rune emblem marking a Base Game adversary that carries no custom image (item 12). */
export function BaseGameEmblem({ size = 22, color = DmRune.accentDim }: { size?: number; color?: string }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Polygon points="12,2 21,12 12,22 3,12" fill="none" stroke={color} strokeWidth={1.5} strokeLinejoin="round" />
      <Path d="M12 7 L12 17 M8.5 9.5 L15.5 9.5 M8.5 14.5 L15.5 14.5" stroke={color} strokeWidth={1.3} strokeLinecap="round" />
      <Circle cx={12} cy={12} r={1.4} fill={color} />
    </Svg>
  );
}

/** A square portrait chip. Base-game default = the tome emblem; custom = the image. Tap → fullscreen. */
export function AdversaryPortrait({ uri, size = 42, tint, onPress }: { uri?: string; size?: number; tint: string; onPress?: () => void }) {
  const inner = uri ? (
    <Image source={uri} style={{ width: size, height: size }} contentFit="cover" />
  ) : (
    <BaseGameEmblem size={size * 0.5} />
  );
  const box = (
    <ChamferBox chamfer={6} fill={DmRune.ink} stroke={tint} strokeWidth={1.3} style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }}>
      {inner}
    </ChamferBox>
  );
  if (!onPress) return box;
  return (
    <DmPress onPress={onPress} accessibilityRole="imagebutton" accessibilityLabel={uri ? 'View image' : 'Base Game adversary'} hitSlop={4}>
      {box}
    </DmPress>
  );
}

const RANGE_ABBR = (r?: string) => r ?? '';

function FeatureRow({ f }: { f: AdversaryFeature }) {
  const kindColor = f.kind === 'Action' ? DmRune.accent : f.kind === 'Reaction' ? DmRune.ally : DmRune.accentDim;
  return (
    <View style={{ gap: 2 }}>
      <Text style={{ color: DmRune.ivory, fontSize: DmType.body, fontFamily: Body.bold, letterSpacing: 0.3 }}>
        {f.name} <Text style={{ color: kindColor, fontSize: DmType.micro, fontFamily: Body.bold, letterSpacing: 0.6, textTransform: 'uppercase' }}>· {f.kind}</Text>
      </Text>
      <Text style={{ color: DmRune.text, fontSize: DmType.body, fontFamily: Body.regular, lineHeight: 16.5 }}>{f.text}</Text>
    </View>
  );
}

function StatCell({ label, value }: { label: string; value: string }) {
  return (
    <View style={{ gap: 1 }}>
      <Text style={{ color: DmRune.muted, fontSize: DmType.micro, fontFamily: Body.bold, letterSpacing: 0.8, textTransform: 'uppercase' }}>{label}</Text>
      <Text style={{ color: DmRune.ivory, fontSize: DmType.title, fontFamily: Display.black }}>{value}</Text>
    </View>
  );
}

/** The full SRD stat block for a combatant that carries the rich fields (base game or configured custom). */
export function StatBlockDetail({ c }: { c: Combatant }) {
  const hasHeader = !!(c.tier || c.role);
  const thr = c.thresholds && (c.thresholds.major || c.thresholds.severe) ? `${c.thresholds.major}/${c.thresholds.severe}` : 'None';
  return (
    <View style={{ gap: 10 }}>
      {hasHeader ? (
        <Text style={{ color: DmRune.accent, fontSize: DmType.body, fontFamily: Body.bold, letterSpacing: 1, textTransform: 'uppercase' }}>
          Tier {c.tier ?? '?'} {c.role ?? ''}{c.hordeNote ? ` (${c.hordeNote})` : ''}
        </Text>
      ) : null}
      {c.description ? <Text style={{ color: DmRune.text, fontSize: DmType.body, fontFamily: Body.regular, fontStyle: 'italic', lineHeight: 17 }}>{c.description}</Text> : null}
      {c.motives ? <Text style={{ color: DmRune.muted, fontSize: DmType.body, fontFamily: Body.regular, lineHeight: 16 }}><Text style={{ fontFamily: Body.bold }}>Motives & Tactics: </Text>{c.motives}</Text> : null}

      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 16, paddingVertical: 4 }}>
        {c.difficulty != null ? <StatCell label="Diff" value={String(c.difficulty)} /> : null}
        <StatCell label="Thresh" value={thr} />
        <StatCell label="HP" value={String(c.maxHp ?? 0)} />
        <StatCell label="Stress" value={String(c.maxStress ?? 0)} />
        {c.atkMod ? <StatCell label="ATK" value={c.atkMod} /> : null}
      </View>

      {c.attack && (c.attack.name || c.attack.damage) ? (
        <Text style={{ color: DmRune.text, fontSize: DmType.body, fontFamily: Body.regular }}>
          <Text style={{ fontFamily: Body.bold, color: DmRune.ivory }}>{c.attack.name || 'Attack'}</Text>
          {c.attack.range ? ` · ${RANGE_ABBR(c.attack.range)}` : ''}{c.attack.damage ? ` · ${c.attack.damage}` : ''}
        </Text>
      ) : null}
      {c.experience ? <Text style={{ color: DmRune.muted, fontSize: DmType.body, fontFamily: Body.regular }}><Text style={{ fontFamily: Body.bold }}>Experience: </Text>{c.experience}</Text> : null}

      {c.features && c.features.length ? (
        <View style={{ gap: 9, borderTopWidth: 1, borderTopColor: DmRune.line, paddingTop: 9 }}>
          {c.features.map((f, i) => <FeatureRow key={i} f={f} />)}
        </View>
      ) : null}
    </View>
  );
}

/** Whether a combatant has any rich detail worth an expand chevron. */
export const hasStatBlock = (c: Combatant): boolean =>
  !!(c.tier || c.role || c.difficulty != null || c.motives || c.experience || (c.features && c.features.length) || (c.attack && (c.attack.name || c.attack.damage)));

/** Fullscreen image viewer for an adversary portrait (item 8). Tap anywhere to close. */
export function AdversaryImageViewer({ uri, name, onClose }: { uri?: string; name: string; onClose: () => void }) {
  const p = useSharedValue(0);
  useEffect(() => { p.value = withTiming(1, { duration: 150, easing: Easing.out(Easing.cubic) }); }, [p]); // item 4: smooth, non-elastic
  const close = () => { p.value = withTiming(0, { duration: 150 }, (f) => { if (f) runOnJS(onClose)(); }); };
  useAndroidBack(() => { close(); return true; });
  const veil = useAnimatedStyle(() => ({ opacity: p.value * 0.92 }));
  // v0.24.1: declare it so the tablet margins darken with the screen (lib/screen-dim).
  useScreenDim(0.92);
  const body = useAnimatedStyle(() => ({ opacity: p.value, transform: [{ scale: 0.9 + p.value * 0.1 }] }));
  const { width, height } = useLayout();
  const box = Math.min(width - 48, height - 220);
  return (
    <View style={{ position: 'absolute', left: 0, top: 0, right: 0, bottom: 0, zIndex: 400 }}>
      <Animated.View entering={FadeIn.duration(120)} exiting={FadeOut.duration(120)} style={{ flex: 1 }}>
        <DmPress style={{ flex: 1 }} onPress={close} accessibilityRole="button" accessibilityLabel="Close image">
          <Animated.View style={[{ flex: 1, backgroundColor: '#06080d', alignItems: 'center', justifyContent: 'center' }, veil]} />
        </DmPress>
      </Animated.View>
      <Animated.View pointerEvents="none" style={[{ position: 'absolute', top: '50%', left: 0, right: 0, marginTop: -box / 2 - 24, alignItems: 'center' }, body]}>
        <ChamferBox chamfer={16} fill={DmRune.ink} stroke={DmRune.lineStrong} strokeWidth={1.5} style={{ width: box, height: box, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }}>
          {uri ? <Image source={uri} style={{ width: box, height: box }} contentFit="contain" /> : <BaseGameEmblem size={box * 0.4} />}
        </ChamferBox>
        <Text style={{ color: DmRune.ivory, fontSize: DmType.title, fontFamily: Display.black, letterSpacing: 1, textTransform: 'uppercase', marginTop: 14 }}>{name}</Text>
      </Animated.View>
    </View>
  );
}
