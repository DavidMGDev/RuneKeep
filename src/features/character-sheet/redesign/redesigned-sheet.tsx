import { useCallback, useState } from 'react';
import { Platform, Pressable, StyleSheet, View } from 'react-native';
import Animated, { runOnJS, useAnimatedStyle, useDerivedValue, useSharedValue } from 'react-native-reanimated';
import { SafeAreaView } from 'react-native-safe-area-context';

import { AccentProvider, useAccentTint } from '@/components/accent';
import { ArtImage } from '@/components/art-image';
import { DesignStage } from '@/components/design-stage';
import { PressableArt } from '@/components/pressable-art';
import { Body, Display, Rune } from '@/constants/theme';
import { box, SHEET_DESIGN_HEIGHT, SHEET_DESIGN_WIDTH } from '@/lib/design';
import { tapHaptic } from '@/lib/haptics';
import { type PipState, resolveHearts, resolvePips } from '@/lib/pips';
import { Art } from '../art';
import { CarouselProvider, useCarousel } from '../carousel-context';
import { type Character, SAMPLE_CHARACTER } from '../character';
import { ArtBox, PipRow, SheetText } from '../components/primitives';
import { CardCarousel } from '../components/card-carousel';
import { GearDecoration } from '../components/gear-decoration';
import { SheetFrame } from '../components/sheet-frame';
import { TraitBanners } from '../components/trait-banners';
import { ChamferFrame, GoldRule, GoldRuleV } from './chamfer';
import { FrameSvg, ProvidedFrame } from './frame-svgs';

// All sheet colors come from the Rune palette (no raw hex, per AGENTS / H3).
const SHEET = Rune.sheet;
const INK = Rune.inkText;
const RED = Rune.red;
const GOLDD = Rune.goldEdge;
const IVORY = Rune.sheet;
const BRONZE = Rune.bronze; // deep gold labels on parchment (AA at small sizes, L3)

// A golden heart reuses the heart shape, recolored gold (clearly distinct from red at small size, AC1A.5).
const heartArt = (s: PipState) => (s === 'empty' ? Art.heartDepleted : Art.heart);
const stressArt = (s: PipState) => (s === 'depleted' ? Art.stressDepleted : s === 'locked' ? Art.stressLocked : Art.stress);
const armorArt = (s: PipState) => (s === 'depleted' ? Art.armorDepleted : s === 'locked' ? Art.armorLocked : Art.armorIcon);
// R3: push locked pips clearly grey so they read apart from the red 'depleted' art at the smallest size.
const lockedGray = (s: PipState) => (s === 'locked' ? '#6E6A64' : undefined);

function PipGrid({ left, top, perRow, gap, rowGap = 8, states, pip, tintFor, artFor, onPressPip, trackLabel }: { left: number; top: number; perRow: number; gap: number; rowGap?: number; states: PipState[]; pip: number; artFor: (s: PipState) => number; tintFor?: (s: PipState) => string | undefined; onPressPip?: (index: number) => void; trackLabel?: string }) {
  const rows: PipState[][] = [];
  for (let i = 0; i < states.length; i += perRow) rows.push(states.slice(i, i + perRow));
  const rowW = perRow * pip + (perRow - 1) * gap;
  return (
    <>
      {rows.map((row, r) => (
        <PipRow key={r} left={left} top={top + r * (pip + rowGap)} width={rowW} height={pip} states={row} pipWidth={pip} pipHeight={pip} artFor={artFor} tintFor={tintFor} onPressPip={onPressPip ? (i) => onPressPip(r * perRow + i) : undefined} trackLabel={trackLabel} />
      ))}
    </>
  );
}

/** Hope: large diamonds joined by a THIN gold line that stops at the last filled one. */
function HopeLine({ left, top, width, count, active, pip, onPressPip }: { left: number; top: number; width: number; count: number; active: number; pip: number; onPressPip?: (index: number) => void }) {
  const states = resolvePips({ total: count, active, depletedRemainder: true });
  const step = (width - pip) / (count - 1);
  const lastFilled = Math.max(0, Math.min(count, active) - 1);
  const lineW = lastFilled * step;
  return (
    <>
      {lineW > 0 ? <GoldRule left={left + pip / 2} top={top + pip / 2 - 0.5} width={lineW} color="rgba(200,146,58,0.55)" thickness={1} /> : null}
      {states.map((s, i) => (
        <ArtBox key={i} left={left + i * step} top={top} width={pip} height={pip} source={s === 'active' ? Art.hope : Art.hopeDepleted} pressable pressedScale={1.2} onPress={onPressPip ? () => onPressPip(i) : undefined} accessibilityLabel={`Hope, ${s === 'active' ? 'filled' : 'empty'}`} accessibilityHint={onPressPip ? 'Double tap to set this level' : undefined} />
      ))}
    </>
  );
}

/** A small octagon badge (image-6): tappable → opens the associated card (D4). */
function OctaBadge({ left, top, size, icon, label, onPress }: { left: number; top: number; size: number; icon: number; label: string; onPress?: () => void }) {
  return (
    <>
      {/* Square box + `meet` so the octagon keeps its aspect (C6); label sits fully BELOW it (C1). */}
      <PressableArt style={box(left, top, size, size)} pressedScale={1.12} onPress={onPress} accessibilityLabel={`${label}, open card`}>
        <ProvidedFrame Svg={FrameSvg.Octagon} left={0} top={0} w={size} h={size} stretch={false} />
        <View style={box(size * 0.26, size * 0.24, size * 0.48, size * 0.48)} pointerEvents="none">
          <ArtImage source={icon} fit="contain" />
        </View>
      </PressableArt>
      <SheetText left={left - 6} top={top + size + 4} width={size + 12} height={11} color={BRONZE} size={7.5} family={Body.bold} align="center" uppercase letterSpacing={0.2} numberOfLines={1}>
        {label}
      </SheetText>
    </>
  );
}

type TrackKey = 'stress' | 'armor' | 'hope';

function RedesignedBody({ character, onHp, onTrack }: { character: Character; onHp: (n: number) => void; onTrack: (key: TrackKey, active: number) => void }) {
  const { toggleCategory, openRandomAbility, category } = useCarousel();
  const tint = useAccentTint();

  // Tap-to-spend/restore: tap a pip to fill up to it, or tap the current frontier to spend one (A1).
  const onHeart = (i: number) => {
    const target = i + 1;
    onHp(target === character.hp ? i : target);
    tapHaptic();
  };
  const onTrackPip = (key: TrackKey) => (i: number) => {
    const target = i + 1;
    onTrack(key, target === character[key].active ? i : target);
    tapHaptic();
  };
  // Golden hearts render gold; red (active) hearts take the accent tint (red by default).
  const heartTint = (s: PipState) => (s === 'golden' ? Rune.goldBright : s === 'active' ? tint : undefined);
  const activeTint = (s: PipState) => (s === 'active' ? tint : undefined);

  const hp = resolveHearts(character.hp, character.heartSlots); // hearts + readout derived from HP (§1A)
  const stress = resolvePips({ total: character.stress.total, active: character.stress.active, locked: character.stress.locked, depletedRemainder: true });
  const armor = resolvePips({ total: character.armor.total, active: character.armor.active, locked: character.armor.locked, depletedRemainder: true });

  return (
    <>
      {/* Parchment ground — CHAMFERED (45° cut) corners, not rounded, matching the gold frame and
          the project signature; this also kills the ivory corner seam (C7). */}
      <ChamferFrame left={0} top={0} width={412} height={892} chamfer={18} fill={SHEET} stroke="transparent" strokeWidth={0} />

      {/* Defense panel ART (image-11: pointy left ribbon, no baked dividers — #30 H). Drawn BEFORE
          the portrait so its tail tucks UNDER the portrait diamond instead of occluding it; the
          panel's texts/pips live in the defenses section below. */}
      <ProvidedFrame Svg={FrameSvg.ArmorBg} left={100} top={200} w={296} h={90} />

      {/* ---------- header: portrait (restored, interlocking) + bio ---------- */}
      {/* Portrait is a tappable affordance — a photo picker fills it later (D2). */}
      <PressableArt style={box(16, 12, 138, 270)} pressedScale={1.03} onPress={() => {}} accessibilityLabel="Character portrait. Add a photo">
        <ArtImage source={Art.portraitPlaceholder} fit="contain" style={{ position: 'absolute', left: 38, top: 48, width: 62, height: 100 } as never} />
        <ArtImage source={Art.portraitFrame} fit="fill" />
      </PressableArt>
      {!character.portraitUri ? (
        <SheetText left={16} top={150} width={138} height={12} color={BRONZE} size={9} family={Body.bold} align="center" uppercase letterSpacing={0.6} numberOfLines={1}>
          + Tap to add
        </SheetText>
      ) : null}
      {/* Deck toggle (swaps Abilities ↔ Inventory) sits INSIDE the frame's bottom diamond — owner
          fine-tuned 2px up + 2px left from the measured spot (#30 K). No caption — the icon itself
          is the affordance. */}
      <PressableArt style={box(53, 216, 44, 44)} pressedScale={1.16} onPress={toggleCategory} accessibilityLabel={`Card deck: ${category}. Double tap to switch`}>
        <ArtImage source={Art.portraitIcon} fit="contain" />
      </PressableArt>

      {/* Name sits ABOVE the frame layer so the top-center finial never paints over the letters (C2). */}
      <View style={{ zIndex: 2100 }}>
        <SheetText left={162} top={16} width={178} height={50} color={INK} size={24} family={Display.black} align="left" vAlign="top" lineHeight={24} numberOfLines={2} uppercase letterSpacing={-0.6}>{character.name}</SheetText>
      </View>
      {/* Bio is just the domains line now — ancestry/class/subclass text removed per owner (#30 E).
          Domains wear the health red (owner call; overrides the earlier red-is-HP-only rule). */}
      <SheetText left={162} top={98} width={178} height={13} color={RED} size={9.5} family={Body.bold} align="left" uppercase letterSpacing={0.3} numberOfLines={1}>{character.domains[0]} × {character.domains[1]}</SheetText>

      {/* Level/proficiency banner REMOVED (#30 F) — the right side stays empty for a future element. */}

      {/* origin badges (octagon) above the defenses — ~30% smaller, left-aligned (#30 G); tappable,
          open a card (D4) */}
      <OctaBadge left={166} top={120} size={39} icon={Art.subclassIcon} label="Subclass" onPress={openRandomAbility} />
      <OctaBadge left={218} top={120} size={39} icon={Art.ancestryIcon} label="Ancestry" onPress={openRandomAbility} />
      <OctaBadge left={270} top={120} size={39} icon={Art.communityIcon} label="Community" onPress={openRandomAbility} />

      {/* ---------- Evasion + Armor — image-11 ribbon panel (#30 H) ----------
          Art is drawn earlier (under the portrait diamond); content sits clear of the left tail.
          No armor-score number — shields only, per owner. */}
      <SheetText left={162} top={212} width={84} height={12} color={Rune.goldText} size={9} family={Body.bold} align="center" uppercase letterSpacing={0.8}>Evasion</SheetText>
      <SheetText left={162} top={226} width={84} height={36} color={IVORY} size={28} family={Display.black} align="center" tabularNums>{character.evasion}</SheetText>
      {/* the ONE separator — between Evasion and Armor, clear of the shields */}
      <GoldRuleV left={252} top={214} height={62} />
      <SheetText left={262} top={212} width={100} height={12} color={Rune.goldText} size={9} family={Body.bold} align="left" uppercase letterSpacing={0.8}>Armor</SheetText>
      <PipGrid left={262} top={230} perRow={6} gap={4} rowGap={5} states={armor} pip={17} artFor={armorArt} tintFor={lockedGray} onPressPip={onTrackPip('armor')} trackLabel="Armor" />

      {/* ---------- HP — hearts fit inside the frame, spaced ---------- */}
      <ProvidedFrame Svg={FrameSvg.HpBar} left={18} top={306} w={376} h={84} />
      <SheetText left={40} top={318} width={120} height={13} color={INK} size={10} family={Body.bold} align="left" uppercase letterSpacing={1.2}>Hit Points</SheetText>
      <SheetText left={38} top={338} width={50} height={42} color={tint ?? RED} size={32} family={Display.black} align="left" tabularNums>{hp.current}</SheetText>
      <SheetText left={86} top={346} width={54} height={28} color={INK} size={20} family={Display.bold} align="left">/ {hp.max}</SheetText>
      {/* Row widened + pip trimmed so 6 hearts sit with positive gaps instead of fused edge-to-edge (C3).
          States (golden / red / empty) and the readout above are both derived from HP (D1/§1A). */}
      <PipRow left={150} top={338} width={235} height={35} states={hp.states} pipWidth={35} pipHeight={35} artFor={heartArt} tintFor={heartTint} onPressPip={onHeart} trackLabel="Hit point" />

      {/* ---------- Stress — inset frame, big icons, two rows ----------
          Frame grown up + pips trimmed so the second row no longer kisses the bottom edge (#6). */}
      <ChamferFrame left={22} top={396} width={368} height={128} chamfer={12} stroke={GOLDD} strokeWidth={1.4} />
      <SheetText left={42} top={406} width={120} height={13} color={INK} size={10} family={Body.bold} align="left" uppercase letterSpacing={1.2}>Stress</SheetText>
      <PipGrid left={44} top={430} perRow={6} gap={8} rowGap={8} states={stress} pip={40} artFor={stressArt} tintFor={(s) => lockedGray(s) ?? activeTint(s)} onPressPip={onTrackPip('stress')} trackLabel="Stress" />

      {/* ---------- Hope — aligned with Stress, thin connecting line ---------- */}
      <ChamferFrame left={22} top={532} width={368} height={84} chamfer={12} stroke={GOLDD} strokeWidth={1.4} />
      <SheetText left={42} top={542} width={120} height={13} color={INK} size={10} family={Body.bold} align="left" uppercase letterSpacing={1.2}>Hope</SheetText>
      <HopeLine left={44} top={562} width={324} count={character.hope.total} active={character.hope.active} pip={44} onPressPip={onTrackPip('hope')} />
    </>
  );
}

function ExpandVeil() {
  const { expandProgress, collapse } = useCarousel();
  const [blocking, setBlocking] = useState(false);
  const wasBlocking = useSharedValue(false);
  useDerivedValue(() => {
    const b = expandProgress.value > 0.25;
    if (b !== wasBlocking.value) {
      wasBlocking.value = b;
      runOnJS(setBlocking)(b);
    }
  });
  const style = useAnimatedStyle(() => ({ opacity: expandProgress.value * 0.62 }));
  // When expanded the veil swallows taps on the dimmed sheet (AC2.8) and a tap dismisses the hand;
  // when compact it is inert so the controls underneath stay live. The box is oversized far past the
  // stage (which no longer clips) so the dim reaches the physical screen edges — status-bar area and
  // letterbox margins included — with square corners (#30 B).
  return (
    <Pressable style={box(-120, -160, 652, 1212)} pointerEvents={blocking ? 'auto' : 'none'} onPress={collapse}>
      <Animated.View style={[box(0, 0, 652, 1212), { backgroundColor: '#06080d' }, style]} pointerEvents="none" />
    </Pressable>
  );
}

/**
 * The single redesigned sheet (style from the AELIANA mockup): chamfered/flat, red + gold; restored
 * interlocking portrait + dark defense panel; gold level/proficiency banner; octagon origin badges;
 * big resource icons; armor shown as its 12 icons. Accent locked to red (picker UI removed).
 */
export function RedesignedSheet({ character: initial = SAMPLE_CHARACTER }: { character?: Character }) {
  // The sheet now OWNS character state so the resource tracks can actually be spent/restored (A1).
  const [character, setCharacter] = useState(initial);
  const onHp = useCallback(
    (n: number) => setCharacter((c) => ({ ...c, hp: Math.max(0, Math.min(c.heartSlots * 2, n)) })),
    [],
  );
  const onTrack = useCallback(
    (key: TrackKey, n: number) =>
      setCharacter((c) => {
        const t = c[key];
        const unlocked = t.total - (t.locked ?? 0);
        return { ...c, [key]: { ...t, active: Math.max(0, Math.min(unlocked, n)) } };
      }),
    [],
  );
  return (
    <AccentProvider>
      <CarouselProvider>
        <View style={{ flex: 1, backgroundColor: Rune.ink }}>
          <SafeAreaView style={{ flex: 1 }} edges={['top', 'bottom']}>
            {/* Parchment matte: any letterbox margin reads as sheet, never ink, so the full-bleed gold
                frame frames parchment instead of a dark gap (#1). */}
            <View style={[StyleSheet.absoluteFill, { backgroundColor: Rune.sheet }]} />
            {/* clip off: the expand/focus dims overdraw past the stage to reach the screen edges.
                Web has no status bar, so the design shifts down ~26px there — on device that strip
                is the (hidden) status-bar zone the border band already owns (#30 C). */}
            <DesignStage
              designWidth={SHEET_DESIGN_WIDTH}
              designHeight={SHEET_DESIGN_HEIGHT}
              clip={false}
              style={Platform.OS === 'web' ? { marginTop: 26 } : null}>
              <RedesignedBody character={character} onHp={onHp} onTrack={onTrack} />
              <TraitBanners character={character} modifierSize={22} groupTop={636} />
              <ExpandVeil />
              <GearDecoration />
              <CardCarousel />
            </DesignStage>
            {/* Gold border is a full-bleed overlay ON TOP of the scaled content (stretched to the
                screen edges). The card hand is clipped to the design box, so it stays behind it. */}
            <SheetFrame />
          </SafeAreaView>
        </View>
      </CarouselProvider>
    </AccentProvider>
  );
}
