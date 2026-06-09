import { View } from 'react-native';
import Animated, { useAnimatedStyle } from 'react-native-reanimated';
import { SafeAreaView } from 'react-native-safe-area-context';

import { AccentProvider, useAccent, useAccentTint } from '@/components/accent';
import { ArtImage } from '@/components/art-image';
import { DesignStage } from '@/components/design-stage';
import { PressableArt } from '@/components/pressable-art';
import { Body, Display, Rune } from '@/constants/theme';
import { box, SHEET_DESIGN_HEIGHT, SHEET_DESIGN_WIDTH } from '@/lib/design';
import { type PipState, resolvePips } from '@/lib/pips';
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

const heartArt = (s: PipState) => (s === 'active' ? Art.heart : Art.heartDepleted);
const stressArt = (s: PipState) => (s === 'depleted' ? Art.stressDepleted : s === 'locked' ? Art.stressLocked : Art.stress);
const armorArt = (s: PipState) => (s === 'depleted' ? Art.armorDepleted : s === 'locked' ? Art.armorLocked : Art.armorIcon);

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

/** A small octagon badge (image-6) with an icon + label. */
function OctaBadge({ left, top, size, icon, label }: { left: number; top: number; size: number; icon: number; label: string }) {
  return (
    <>
      <ProvidedFrame Svg={FrameSvg.Octagon} left={left} top={top} w={size} h={size * 1.04} />
      <View style={box(left + size * 0.24, top + size * 0.2, size * 0.52, size * 0.52)} pointerEvents="none">
        <ArtImage source={icon} fit="contain" />
      </View>
      <SheetText left={left - 6} top={top + size * 0.82} width={size + 12} height={11} color={GOLD} size={6.5} family={Body.bold} align="center" uppercase letterSpacing={0.2} numberOfLines={1}>
        {label}
      </SheetText>
    </>
  );
}

function RedesignedBody({ character }: { character: Character }) {
  const { toggleCategory } = useCarousel();
  useAccent();
  const tint = useAccentTint();
  const heartTint = (s: PipState) => (s === 'active' ? tint : undefined);

  const hearts = resolvePips({ total: character.hearts.total, active: character.hearts.active, depletedRemainder: true });
  const stress = resolvePips({ total: character.stress.total, active: character.stress.active, locked: character.stress.locked, depletedRemainder: true });
  const armor = resolvePips({ total: character.armor.total, active: character.armor.active, locked: character.armor.locked, depletedRemainder: true });

  return (
    <>
      <View style={[box(0, 0, 412, 892), { backgroundColor: SHEET, borderRadius: 26 }]} />

      {/* ---------- header: portrait (restored, interlocking) + bio + level banner ---------- */}
      <View style={box(16, 12, 138, 270)}>
        <ArtImage source={Art.portraitPlaceholder} fit="contain" style={{ position: 'absolute', left: 38, top: 48, width: 62, height: 100 } as never} />
        <ArtImage source={Art.portraitFrame} fit="fill" />
      </View>
      {/* rhombus toggle aligned to the frame's bottom diamond */}
      <PressableArt style={box(63, 244, 44, 46)} pressedScale={1.16} onPress={toggleCategory}>
        <ArtImage source={Art.portraitIcon} fit="contain" />
      </PressableArt>

      <SheetText left={162} top={14} width={178} height={50} color={INK} size={24} family={Display.black} align="left" vAlign="top" lineHeight={24} numberOfLines={2} uppercase letterSpacing={-0.6}>{character.name}</SheetText>
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

      {/* origin badges (octagon) above the defenses */}
      <OctaBadge left={166} top={120} size={56} icon={Art.subclassIcon} label="Subclass" />
      <OctaBadge left={228} top={120} size={56} icon={Art.ancestryIcon} label="Ancestry" />
      <OctaBadge left={290} top={120} size={56} icon={Art.communityIcon} label="Community" />

      {/* ---------- Evasion + Armor (dark panel, interlocks with the portrait) ---------- */}
      <View style={box(92, 198, 304, 96)}>
        <ArtImage source={Art.armorPanel} fit="fill" />
      </View>
      <SheetText left={160} top={210} width={72} height={11} color={Rune.goldText} size={8} family={Body.bold} align="center" uppercase letterSpacing={0.8}>Evasion</SheetText>
      <SheetText left={160} top={222} width={72} height={40} color={IVORY} size={32} family={Display.black} align="center" tabularNums>{character.evasion}</SheetText>
      <GoldRuleV left={240} top={210} height={70} />
      <SheetText left={250} top={206} width={140} height={11} color={Rune.goldText} size={8} family={Body.bold} align="left" uppercase letterSpacing={0.8}>Armor</SheetText>
      <PipGrid left={250} top={222} perRow={6} gap={5} rowGap={5} states={armor} pip={20} artFor={armorArt} />

      {/* ---------- HP — hearts fit inside the frame, spaced ---------- */}
      <ProvidedFrame Svg={FrameSvg.HpBar} left={18} top={306} w={376} h={84} />
      <SheetText left={40} top={318} width={120} height={13} color={INK} size={10} family={Body.bold} align="left" uppercase letterSpacing={1}>Hit Points</SheetText>
      <SheetText left={38} top={338} width={50} height={42} color={tint ?? RED} size={32} family={Display.black} align="left" tabularNums>{character.hitPoints.current}</SheetText>
      <SheetText left={86} top={346} width={54} height={28} color={INK} size={20} family={Display.bold} align="left">/ {character.hitPoints.max}</SheetText>
      <PipRow left={156} top={336} width={222} height={38} states={hearts} pipWidth={38} pipHeight={38} artFor={heartArt} tintFor={heartTint} />

      {/* ---------- Stress — inset frame, big icons, two rows, closer ---------- */}
      <ChamferFrame left={22} top={400} width={368} height={122} chamfer={12} stroke={GOLDD} strokeWidth={1.4} />
      <SheetText left={42} top={410} width={120} height={13} color={INK} size={10} family={Body.bold} align="left" uppercase letterSpacing={1.5}>Stress</SheetText>
      <PipGrid left={44} top={430} perRow={6} gap={8} rowGap={6} states={stress} pip={42} artFor={stressArt} tintFor={heartTint} />

      {/* ---------- Hope — aligned with Stress, thin connecting line ---------- */}
      <ChamferFrame left={22} top={532} width={368} height={84} chamfer={12} stroke={GOLDD} strokeWidth={1.4} />
      <SheetText left={42} top={542} width={120} height={13} color={INK} size={10} family={Body.bold} align="left" uppercase letterSpacing={1.5}>Hope</SheetText>
      <HopeLine left={44} top={562} width={324} count={character.hope.total} active={character.hope.active} pip={44} />
    </>
  );
}

function ExpandVeil() {
  const { expandProgress } = useCarousel();
  const style = useAnimatedStyle(() => ({ opacity: expandProgress.value * 0.62 }));
  return <Animated.View style={[box(0, 0, 412, 892), { backgroundColor: '#090B10', borderRadius: 26 }, style]} pointerEvents="none" />;
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
