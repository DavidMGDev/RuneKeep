import { type ImageContentFit } from 'expo-image';
import { useCallback, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
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
import { ClassBanner, SheetFrame } from '../components/sheet-frame';
import { TraitBanners } from '../components/trait-banners';
import { ChamferFrame, GoldRule, GoldRuleV } from './chamfer';
import { FrameSvg, ProvidedFrame } from './frame-svgs';
import { InfoOverlay } from './info-overlay';

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

function PipGrid({ left, top, perRow, gap, rowGap = 8, states, pip, pipH, rowWidth, pipFit, tintFor, artFor, onPressPip, trackLabel }: { left: number; top: number; perRow: number; gap: number; rowGap?: number; states: PipState[]; pip: number; /** Pip height when the slot is not square (defaults to `pip`). */ pipH?: number; /** Explicit row width — pips spread evenly across it (space-between). */ rowWidth?: number; pipFit?: ImageContentFit; artFor: (s: PipState) => number; tintFor?: (s: PipState) => string | undefined; onPressPip?: (index: number) => void; trackLabel?: string }) {
  const rows: PipState[][] = [];
  for (let i = 0; i < states.length; i += perRow) rows.push(states.slice(i, i + perRow));
  const h = pipH ?? pip;
  const rowW = rowWidth ?? perRow * pip + (perRow - 1) * gap;
  return (
    <>
      {rows.map((row, r) => (
        <PipRow key={r} left={left} top={top + r * (h + rowGap)} width={rowW} height={h} states={row} pipWidth={pip} pipHeight={h} pipFit={pipFit} artFor={artFor} tintFor={tintFor} onPressPip={onPressPip ? (i) => onPressPip(r * perRow + i) : undefined} trackLabel={trackLabel} />
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

/** Width of a domain chip for its label — sized for the WIDER native glyph run plus real padding,
 *  so the chips no longer hug the text edge-to-edge on the phone (#43 D). */
function chipWidth(label: string): number {
  return Math.round(label.length * 7.6) + 18;
}

/** A domain name in its own small chamfered red chip (#37) — the project's flat, 45°-cut signature. */
function DomainChip({ left, top, label }: { left: number; top: number; label: string }) {
  const w = chipWidth(label);
  return (
    <>
      <ChamferFrame left={left} top={top} width={w} height={20} chamfer={5} fill={RED} stroke="transparent" strokeWidth={0} />
      <SheetText left={left} top={top} width={w} height={20} color={IVORY} size={10} family={Body.bold} align="center" uppercase letterSpacing={0.6} numberOfLines={1}>
        {label}
      </SheetText>
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
      {/* Wider box + no tracking: labels render at FIXED size on both platforms (#43 B), so
          COMMUNITY must fit at its set size or it ellipsizes. Size rides the 81px badge pitch. */}
      <SheetText left={left - 12} top={top + size + 4} width={size + 24} height={13} color={BRONZE} size={9.5} family={Body.bold} align="center" uppercase numberOfLines={1}>
        {label}
      </SheetText>
    </>
  );
}

type TrackKey = 'stress' | 'armor' | 'hope';

function RedesignedBody({ character, onHp, onTrack, onInfo }: { character: Character; onHp: (n: number) => void; onTrack: (key: TrackKey, active: number) => void; onInfo: () => void }) {
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

      {/* ---------- header: portrait + deck toggle, ONE locked group (#43 G) ----------
          Sized to the midpoint of the last two iterations (163x295 grew over the defense panel;
          138x270 was too small). The toggle's position scales WITH the frame so the pair never
          drifts apart. No press bounce on either, per owner — plain Pressables. The toggle sits
          ON TOP (bigger symbol + generous hitSlop); the portrait keeps its full-frame hitbox
          underneath. */}
      <View style={box(16, 12, 150, 282)}>
        <Pressable style={StyleSheet.absoluteFill} onPress={() => {}} accessibilityRole="button" accessibilityLabel="Character portrait. Add a photo">
          <ArtImage source={Art.portraitPlaceholder} fit="contain" style={{ position: 'absolute', left: 41, top: 48, width: 67, height: 100 } as never} />
          <ArtImage source={Art.portraitFrame} fit="fill" />
          {!character.portraitUri ? (
            <SheetText left={0} top={155} width={150} height={15} color={BRONZE} size={12} family={Body.bold} align="center" uppercase letterSpacing={0.6} numberOfLines={1}>
              + Tap to add
            </SheetText>
          ) : null}
        </Pressable>
        {/* Deck toggle inside the frame's bottom diamond — its centroid for THIS frame size. */}
        <Pressable style={box(39, 211, 52, 52)} hitSlop={10} onPress={toggleCategory} accessibilityRole="button" accessibilityLabel={`Card deck: ${category}. Double tap to switch`}>
          <ArtImage source={Art.portraitIcon} fit="contain" />
        </Pressable>
      </View>

      {/* ---------- top-right bio column: name → domain chips → lvl/prof → badges (#37) ---------- */}
      {/* Name stretches to the panel's right edge; sits ABOVE the frame layer (C2). */}
      <View style={{ zIndex: 2100 }}>
        <SheetText left={190} top={14} width={206} height={54} color={INK} size={26} family={Display.black} align="left" vAlign="top" lineHeight={26} numberOfLines={2} uppercase letterSpacing={-0.6} fit>{character.name}</SheetText>
      </View>
      {/* Domains as two separate chamfered chips (no ×) under the name (#37). */}
      <DomainChip left={190} top={74} label={character.domains[0]} />
      <DomainChip left={190 + chipWidth(character.domains[0]) + 8} top={74} label={character.domains[1]} />
      {/* Level/class + proficiency lines between the chips and the badges. */}
      <SheetText left={190} top={100} width={206} height={17} color={INK} size={14} family={Body.bold} align="left" uppercase letterSpacing={0.5} numberOfLines={1}>Lvl {character.level} {character.className}</SheetText>
      <SheetText left={190} top={119} width={206} height={15} color={BRONZE} size={12} family={Body.bold} align="left" uppercase letterSpacing={0.4} numberOfLines={1}>Proficiency → {character.proficiency}</SheetText>

      {/* origin badges (octagon) — bigger, spread to span exactly to the defense panel's right
          edge (396), and dropped closer to the panel with clear air under the proficiency line
          (#43 E, F); tappable (D4) */}
      <OctaBadge left={190} top={140} size={44} icon={Art.subclassIcon} label="Subclass" onPress={openRandomAbility} />
      <OctaBadge left={271} top={140} size={44} icon={Art.ancestryIcon} label="Ancestry" onPress={openRandomAbility} />
      <OctaBadge left={352} top={140} size={44} icon={Art.communityIcon} label="Community" onPress={openRandomAbility} />

      {/* ---------- Evasion + Armor — image-11 ribbon panel (#30 H) ----------
          Art is drawn earlier (under the portrait diamond); content sits clear of the left tail.
          No armor-score number — shields only, per owner. */}
      {/* Evasion fills its zone — bigger label + numeral (#37); armor side untouched. */}
      <SheetText left={162} top={206} width={84} height={16} color={Rune.goldText} size={12} family={Body.bold} align="center" uppercase letterSpacing={0.8}>Evasion</SheetText>
      <SheetText left={162} top={221} width={84} height={48} color={IVORY} size={38} family={Display.black} align="center" tabularNums>{character.evasion}</SheetText>
      {/* the ONE separator — between Evasion and Armor, clear of the shields */}
      <GoldRuleV left={252} top={214} height={62} />
      <SheetText left={262} top={211} width={100} height={15} color={Rune.goldText} size={12} family={Body.bold} align="left" uppercase letterSpacing={0.8}>Armor</SheetText>
      <PipGrid left={262} top={230} perRow={6} gap={4} rowGap={5} states={armor} pip={17} artFor={armorArt} tintFor={lockedGray} onPressPip={onTrackPip('armor')} trackLabel="Armor" />

      {/* ---------- HP — hearts fit inside the frame, spaced ----------
          Panel raised 5px: the gap to the portrait/armor band above shrinks ~30% (#37). */}
      <ProvidedFrame Svg={FrameSvg.HpBar} left={18} top={301} w={376} h={84} />
      {/* Info button centered on the frame's red corner, left of the label (#37) — opens the HP
          explainer overlay (its own overlay, NOT the carousel's random-card path). */}
      <PressableArt style={box(29, 306, 17, 17)} pressedScale={1.2} onPress={onInfo} accessibilityLabel="Hit points info" accessibilityHint="Shows an explainer">
        <View style={{ flex: 1, borderRadius: 9, borderWidth: 1.4, borderColor: IVORY, alignItems: 'center', justifyContent: 'center' }}>
          <Text style={{ color: IVORY, fontSize: 10, fontFamily: Display.bold, lineHeight: 12 }}>i</Text>
        </View>
      </PressableArt>
      <SheetText left={54} top={318} width={140} height={16} color={INK} size={13} family={Body.bold} align="left" uppercase letterSpacing={1.2}>Hit Points</SheetText>
      {/* One tight baseline-aligned cluster — red current (20% smaller per owner), smaller ink
          "/ max" nudged forward; the current numeral steps down a size at double digits (#30 I/#37). */}
      <View style={[box(38, 329, 100, 44), { flexDirection: 'row', alignItems: 'baseline', overflow: 'hidden' }]} pointerEvents="none">
        <Text numberOfLines={1} style={{ fontSize: hp.current >= 10 ? 28 : 32, color: tint ?? RED, fontFamily: Display.black, fontVariant: ['tabular-nums'] }}>{hp.current}</Text>
        <Text numberOfLines={1} style={{ marginLeft: 5, fontSize: 24, color: INK, fontFamily: Display.bold, fontVariant: ['tabular-nums'] }}>/ {hp.max}</Text>
      </View>
      {/* Hearts sit 10px further left (#30 I); states + readout both derive from HP (D1/§1A). */}
      <PipRow left={140} top={333} width={235} height={35} states={hp.states} pipWidth={35} pipHeight={35} artFor={heartArt} tintFor={heartTint} onPressPip={onHeart} trackLabel="Hit point" />

      {/* ---------- Stress — inset frame, two rows spread across the panel ----------
          Pips trimmed to 44 wide with hope-equal 12px gaps (was a 48px stretch with ~7px gaps —
          owner: less stretch, more spacing, #37). */}
      <ChamferFrame left={22} top={396} width={368} height={128} chamfer={12} stroke={GOLDD} strokeWidth={1.4} />
      <SheetText left={42} top={406} width={120} height={16} color={INK} size={13} family={Body.bold} align="left" uppercase letterSpacing={1.2}>Stress</SheetText>
      <PipGrid left={44} top={426} perRow={6} gap={12} rowGap={8} rowWidth={324} pip={44} pipH={34} pipFit="fill" states={stress} artFor={stressArt} tintFor={(s) => lockedGray(s) ?? activeTint(s)} onPressPip={onTrackPip('stress')} trackLabel="Stress" />

      {/* ---------- Hope — aligned with Stress, thin connecting line ---------- */}
      <ChamferFrame left={22} top={532} width={368} height={84} chamfer={12} stroke={GOLDD} strokeWidth={1.4} />
      <SheetText left={42} top={542} width={120} height={16} color={INK} size={13} family={Body.bold} align="left" uppercase letterSpacing={1.2}>Hope</SheetText>
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
  const [infoOpen, setInfoOpen] = useState(false); // HP explainer overlay (#37)
  const onInfo = useCallback(() => setInfoOpen(true), []);
  const onInfoClose = useCallback(() => setInfoOpen(false), []);
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
                The safe-area inset pushes everything (border included) below the status bar; the
                strip above reads as the root's ink navy. Web's inset is 0, so the layouts are the
                SAME design, mobile-first (#43 A — replaces the old web-only 26px shift). */}
            <DesignStage
              designWidth={SHEET_DESIGN_WIDTH}
              designHeight={SHEET_DESIGN_HEIGHT}
              clip={false}>
              <RedesignedBody character={character} onHp={onHp} onTrack={onTrack} onInfo={onInfo} />
              <TraitBanners character={character} modifierSize={26} groupTop={636} />
              <ExpandVeil />
              <GearDecoration />
              <CardCarousel />
              <InfoOverlay open={infoOpen} onClose={onInfoClose} />
            </DesignStage>
            {/* Gold border is a full-bleed overlay ON TOP of the scaled content (stretched to the
                screen edges). The card hand is clipped to the design box, so it stays behind it. */}
            <SheetFrame />
          </SafeAreaView>
          {/* Outside the safe area: the banner is the ONE element that invades the status-bar
              strip, hanging from the physical top edge of the screen (#43 A). */}
          <ClassBanner />
        </View>
      </CarouselProvider>
    </AccentProvider>
  );
}
