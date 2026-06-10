import { useState } from 'react';
import { Pressable, View } from 'react-native';
import Animated, { runOnJS, useAnimatedStyle, useDerivedValue, useSharedValue } from 'react-native-reanimated';
import { SafeAreaView } from 'react-native-safe-area-context';

import { AccentProvider, useAccent, useAccentTint } from '@/components/accent';
import { ArtImage } from '@/components/art-image';
import { DesignStage } from '@/components/design-stage';
import { PressableArt } from '@/components/pressable-art';
import { Body, Display, Rune } from '@/constants/theme';
import { box, SHEET_DESIGN_HEIGHT, SHEET_DESIGN_WIDTH } from '@/lib/design';
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

const SHEET = '#FAF8F2';
const INK = '#14110C';
const RED = '#C81B18';
const GOLD = '#C8923A';
const GOLDD = '#DAA249';
const MUTED = '#8A857E';
const IVORY = '#FAF8F2';

// A golden heart reuses the heart shape, recolored gold (clearly distinct from red at small size, AC1A.5).
const heartArt = (s: PipState) => (s === 'empty' ? Art.heartDepleted : Art.heart);
const stressArt = (s: PipState) => (s === 'depleted' ? Art.stressDepleted : s === 'locked' ? Art.stressLocked : Art.stress);
const armorArt = (s: PipState) => (s === 'depleted' ? Art.armorDepleted : s === 'locked' ? Art.armorLocked : Art.armorIcon);
// R3: push locked pips clearly grey so they read apart from the red 'depleted' art at the smallest size.
const lockedGray = (s: PipState) => (s === 'locked' ? '#6E6A64' : undefined);

function PipGrid({ left, top, perRow, gap, rowGap = 8, states, pip, tintFor, artFor }: { left: number; top: number; perRow: number; gap: number; rowGap?: number; states: PipState[]; pip: number; artFor: (s: PipState) => number; tintFor?: (s: PipState) => string | undefined }) {
  const rows: PipState[][] = [];
  for (let i = 0; i < states.length; i += perRow) rows.push(states.slice(i, i + perRow));
  const rowW = perRow * pip + (perRow - 1) * gap;
  return (
    <>
      {rows.map((row, r) => (
        <PipRow key={r} left={left} top={top + r * (pip + rowGap)} width={rowW} height={pip} states={row} pipWidth={pip} pipHeight={pip} artFor={artFor} tintFor={tintFor} />
      ))}
    </>
  );
}

/** Hope: large diamonds joined by a THIN gold line that stops at the last filled one. */
function HopeLine({ left, top, width, count, active, pip }: { left: number; top: number; width: number; count: number; active: number; pip: number }) {
  const states = resolvePips({ total: count, active, depletedRemainder: true });
  const step = (width - pip) / (count - 1);
  const lastFilled = Math.max(0, Math.min(count, active) - 1);
  const lineW = lastFilled * step;
  return (
    <>
      {lineW > 0 ? <GoldRule left={left + pip / 2} top={top + pip / 2 - 0.5} width={lineW} color="rgba(200,146,58,0.55)" thickness={1} /> : null}
      {states.map((s, i) => (
        <ArtBox key={i} left={left + i * step} top={top} width={pip} height={pip} source={s === 'active' ? Art.hope : Art.hopeDepleted} pressable pressedScale={1.2} />
      ))}
    </>
  );
}

/** A small octagon badge (image-6): tappable → opens the associated card (D4). */
function OctaBadge({ left, top, size, icon, label, onPress }: { left: number; top: number; size: number; icon: number; label: string; onPress?: () => void }) {
  return (
    <>
      {/* Square box + `meet` so the octagon keeps its aspect (C6); label sits fully BELOW it (C1). */}
      <PressableArt style={box(left, top, size, size)} pressedScale={1.12} onPress={onPress}>
        <ProvidedFrame Svg={FrameSvg.Octagon} left={0} top={0} w={size} h={size} stretch={false} />
        <View style={box(size * 0.26, size * 0.24, size * 0.48, size * 0.48)} pointerEvents="none">
          <ArtImage source={icon} fit="contain" />
        </View>
      </PressableArt>
      <SheetText left={left - 6} top={top + size + 4} width={size + 12} height={11} color={GOLD} size={7.5} family={Body.bold} align="center" uppercase letterSpacing={0.2} numberOfLines={1}>
        {label}
      </SheetText>
    </>
  );
}

function RedesignedBody({ character }: { character: Character }) {
  const { toggleCategory, openRandomAbility, category } = useCarousel();
  useAccent();
  const tint = useAccentTint();
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

      {/* ---------- header: portrait (restored, interlocking) + bio + level banner ---------- */}
      {/* Portrait is a tappable affordance — a photo picker fills it later (D2). */}
      <PressableArt style={box(16, 12, 138, 270)} pressedScale={1.03} onPress={() => {}}>
        <ArtImage source={Art.portraitPlaceholder} fit="contain" style={{ position: 'absolute', left: 38, top: 48, width: 62, height: 100 } as never} />
        <ArtImage source={Art.portraitFrame} fit="fill" />
      </PressableArt>
      {!character.portraitUri ? (
        <SheetText left={16} top={150} width={138} height={11} color={GOLD} size={8} family={Body.bold} align="center" uppercase letterSpacing={0.6} numberOfLines={1}>
          + Tap to add
        </SheetText>
      ) : null}
      {/* rhombus toggle aligned to the frame's bottom diamond — swaps Abilities ↔ Inventory deck */}
      <PressableArt style={box(63, 244, 44, 46)} pressedScale={1.16} onPress={toggleCategory}>
        <ArtImage source={Art.portraitIcon} fit="contain" />
      </PressableArt>
      <SheetText left={40} top={291} width={90} height={10} color={GOLD} size={7.5} family={Body.bold} align="center" uppercase letterSpacing={0.8} numberOfLines={1}>
        {category === 'abilities' ? 'Abilities' : 'Inventory'}
      </SheetText>

      {/* Name sits ABOVE the frame layer so the top-center finial never paints over the letters (C2). */}
      <View style={{ zIndex: 2100 }}>
        <SheetText left={162} top={16} width={178} height={50} color={INK} size={24} family={Display.black} align="left" vAlign="top" lineHeight={24} numberOfLines={2} uppercase letterSpacing={-0.6}>{character.name}</SheetText>
      </View>
      <SheetText left={162} top={66} width={178} height={14} color={RED} size={11} family={Body.bold} align="left" uppercase letterSpacing={0.4} numberOfLines={1}>{character.ancestry} · {character.className}</SheetText>
      <SheetText left={162} top={82} width={178} height={12} color={MUTED} size={9} family={Body.medium} align="left" numberOfLines={1}>{character.subclass}</SheetText>
      <SheetText left={162} top={98} width={178} height={13} color={RED} size={9.5} family={Body.bold} align="left" uppercase letterSpacing={0.3} numberOfLines={1}>{character.domains[0]} × {character.domains[1]}</SheetText>

      {/* level + proficiency, in a gold thin frame (crown over LVL) — no red fill */}
      <ProvidedFrame Svg={FrameSvg.ChamferPanel} left={348} top={10} w={52} h={148} />
      <View style={box(366, 16, 16, 16)} pointerEvents="none"><ArtImage source={Art.levelCrown} fit="contain" /></View>
      <SheetText left={348} top={34} width={52} height={9} color={GOLD} size={7} family={Body.bold} align="center" uppercase letterSpacing={1}>Lvl</SheetText>
      <SheetText left={348} top={42} width={52} height={32} color={INK} size={26} family={Display.black} align="center" tabularNums>{character.level}</SheetText>
      <GoldRule left={356} top={84} width={36} color="rgba(200,146,58,0.5)" />
      <SheetText left={348} top={92} width={52} height={9} color={GOLD} size={6.5} family={Body.bold} align="center" uppercase letterSpacing={0.6}>Prof</SheetText>
      <SheetText left={348} top={100} width={52} height={30} color={INK} size={24} family={Display.black} align="center" tabularNums>{character.proficiency}</SheetText>

      {/* origin badges (octagon) above the defenses — tappable, open a card (D4) */}
      <OctaBadge left={166} top={120} size={56} icon={Art.subclassIcon} label="Subclass" onPress={openRandomAbility} />
      <OctaBadge left={228} top={120} size={56} icon={Art.ancestryIcon} label="Ancestry" onPress={openRandomAbility} />
      <OctaBadge left={290} top={120} size={56} icon={Art.communityIcon} label="Community" onPress={openRandomAbility} />

      {/* ---------- Evasion + Armor (dark panel, interlocks with the portrait) ---------- */}
      <View style={box(92, 198, 304, 96)}>
        <ArtImage source={Art.armorPanel} fit="fill" />
      </View>
      <SheetText left={160} top={210} width={72} height={11} color={Rune.goldText} size={8} family={Body.bold} align="center" uppercase letterSpacing={0.8}>Evasion</SheetText>
      <SheetText left={160} top={222} width={72} height={40} color={IVORY} size={32} family={Display.black} align="center" tabularNums>{character.evasion}</SheetText>
      <GoldRuleV left={240} top={210} height={70} />
      <SheetText left={254} top={206} width={90} height={11} color={Rune.goldText} size={8} family={Body.bold} align="left" uppercase letterSpacing={0.8}>Armor</SheetText>
      {/* R2: surface the armor score (damage reduction) — previously stored but never rendered. */}
      <SheetText left={350} top={203} width={42} height={16} color={IVORY} size={13} family={Display.bold} align="right" tabularNums>{character.armorScore}</SheetText>
      {/* Inset off the panel edge + ornaments so the shields don't collide with the printed brackets (C4). */}
      <PipGrid left={254} top={224} perRow={6} gap={4} rowGap={5} states={armor} pip={18} artFor={armorArt} tintFor={lockedGray} />

      {/* ---------- HP — hearts fit inside the frame, spaced ---------- */}
      <ProvidedFrame Svg={FrameSvg.HpBar} left={18} top={306} w={376} h={84} />
      <SheetText left={40} top={318} width={120} height={13} color={INK} size={10} family={Body.bold} align="left" uppercase letterSpacing={1}>Hit Points</SheetText>
      <SheetText left={38} top={338} width={50} height={42} color={tint ?? RED} size={32} family={Display.black} align="left" tabularNums>{hp.current}</SheetText>
      <SheetText left={86} top={346} width={54} height={28} color={INK} size={20} family={Display.bold} align="left">/ {hp.max}</SheetText>
      {/* Row widened + pip trimmed so 6 hearts sit with positive gaps instead of fused edge-to-edge (C3).
          States (golden / red / empty) and the readout above are both derived from HP (D1/§1A). */}
      <PipRow left={150} top={338} width={235} height={35} states={hp.states} pipWidth={35} pipHeight={35} artFor={heartArt} tintFor={heartTint} />

      {/* ---------- Stress — inset frame, big icons, two rows, closer ---------- */}
      <ChamferFrame left={22} top={400} width={368} height={122} chamfer={12} stroke={GOLDD} strokeWidth={1.4} />
      <SheetText left={42} top={410} width={120} height={13} color={INK} size={10} family={Body.bold} align="left" uppercase letterSpacing={1.5}>Stress</SheetText>
      <PipGrid left={44} top={430} perRow={6} gap={8} rowGap={6} states={stress} pip={42} artFor={stressArt} tintFor={(s) => lockedGray(s) ?? activeTint(s)} />

      {/* ---------- Hope — aligned with Stress, thin connecting line ---------- */}
      <ChamferFrame left={22} top={532} width={368} height={84} chamfer={12} stroke={GOLDD} strokeWidth={1.4} />
      <SheetText left={42} top={542} width={120} height={13} color={INK} size={10} family={Body.bold} align="left" uppercase letterSpacing={1.5}>Hope</SheetText>
      <HopeLine left={44} top={562} width={324} count={character.hope.total} active={character.hope.active} pip={44} />
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
  // when compact it is inert so the controls underneath stay live.
  return (
    <Pressable style={box(0, 0, 412, 892)} pointerEvents={blocking ? 'auto' : 'none'} onPress={collapse}>
      <Animated.View style={[box(0, 0, 412, 892), { backgroundColor: '#090B10', borderRadius: 26 }, style]} pointerEvents="none" />
    </Pressable>
  );
}

/**
 * The single redesigned sheet (style from the AELIANA mockup): chamfered/flat, red + gold; restored
 * interlocking portrait + dark defense panel; gold level/proficiency banner; octagon origin badges;
 * big resource icons; armor shown as its 12 icons. Accent locked to red (picker UI removed).
 */
export function RedesignedSheet({ character = SAMPLE_CHARACTER }: { character?: Character }) {
  return (
    <AccentProvider>
      <CarouselProvider>
        <View style={{ flex: 1, backgroundColor: Rune.ink }}>
          <SafeAreaView style={{ flex: 1 }} edges={['top', 'bottom']}>
            <DesignStage designWidth={SHEET_DESIGN_WIDTH} designHeight={SHEET_DESIGN_HEIGHT}>
              <RedesignedBody character={character} />
              <TraitBanners character={character} modifierSize={22} groupTop={636} />
              <SheetFrame />
              <ExpandVeil />
              <GearDecoration />
              <CardCarousel />
            </DesignStage>
          </SafeAreaView>
        </View>
      </CarouselProvider>
    </AccentProvider>
  );
}
