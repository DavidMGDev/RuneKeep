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
import { ChamferFrame, GoldRule } from './chamfer';
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

/** Two rows of pips (for the 12-count Stress / Armor tracks) so the icons stay large. */
function PipGrid({ left, top, perRow, gap, states, pip, tintFor, artFor }: { left: number; top: number; perRow: number; gap: number; states: PipState[]; pip: number; artFor: (s: PipState) => number; tintFor?: (s: PipState) => string | undefined }) {
  const rows: PipState[][] = [];
  for (let i = 0; i < states.length; i += perRow) rows.push(states.slice(i, i + perRow));
  const rowW = perRow * pip + (perRow - 1) * gap;
  return (
    <>
      {rows.map((row, r) => (
        <PipRow
          key={r}
          left={left}
          top={top + r * (pip + 8)}
          width={rowW}
          height={pip}
          states={row}
          pipWidth={pip}
          pipHeight={pip}
          artFor={artFor}
          tintFor={tintFor}
        />
      ))}
    </>
  );
}

/** Hope: a single elegant line of large diamonds connected by a gold rule. */
function HopeLine({ left, top, width, count, active, pip }: { left: number; top: number; width: number; count: number; active: number; pip: number }) {
  const states = resolvePips({ total: count, active, depletedRemainder: true });
  const step = (width - pip) / (count - 1);
  return (
    <>
      <GoldRule left={left + pip / 2} top={top + pip / 2} width={width - pip} color="rgba(200,146,58,0.7)" />
      {states.map((s, i) => (
        <ArtBox key={i} left={left + i * step} top={top} width={pip} height={pip} source={s === 'active' ? Art.hope : Art.hopeDepleted} pressable pressedScale={1.2} />
      ))}
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
      {/* ---------- sheet surface ---------- */}
      <View style={[box(0, 0, 412, 892), { backgroundColor: SHEET, borderRadius: 26 }]} />

      {/* ---------- header / bio (top ~24%) ---------- */}
      <View style={box(14, 12, 116, 184)}>
        <ArtImage source={Art.portraitPlaceholder} fit="contain" style={{ position: 'absolute', left: 28, top: 30, width: 60, height: 96 } as never} />
        <ArtImage source={Art.portraitFrame} fit="fill" />
      </View>
      <PressableArt style={box(52, 150, 40, 42)} pressedScale={1.16} onPress={toggleCategory}>
        <ArtImage source={Art.portraitIcon} fit="contain" />
      </PressableArt>

      {/* level red tab */}
      <ChamferFrame left={352} top={12} width={48} height={56} chamfer={9} stroke={GOLDD} strokeWidth={1.4} fill={RED} />
      <SheetText left={352} top={17} width={48} height={10} color="#FFE9C9" size={7.5} family={Body.bold} align="center" uppercase letterSpacing={0.5}>Lvl</SheetText>
      <SheetText left={352} top={26} width={48} height={40} color={IVORY} size={30} family={Display.black} align="center" tabularNums>{character.level}</SheetText>

      <SheetText left={142} top={14} width={206} height={52} color={INK} size={25} family={Display.black} align="left" vAlign="top" lineHeight={25} numberOfLines={2} uppercase letterSpacing={-0.6}>{character.name}</SheetText>
      <SheetText left={142} top={70} width={206} height={14} color={RED} size={11} family={Body.bold} align="left" uppercase letterSpacing={0.4} numberOfLines={1}>{character.ancestry} · {character.className}</SheetText>
      <SheetText left={142} top={86} width={206} height={12} color={MUTED} size={9} family={Body.medium} align="left" numberOfLines={1}>{character.subclass}</SheetText>
      <SheetText left={142} top={102} width={206} height={13} color={RED} size={9.5} family={Body.bold} align="left" uppercase letterSpacing={0.3} numberOfLines={1}>{character.domains[0]} × {character.domains[1]}</SheetText>

      {/* defenses in the dark (blue) chamfered panel */}
      <ProvidedFrame Svg={FrameSvg.ArmorBg} left={142} top={122} w={256} h={66} />
      <Defense left={144} width={82} label="Evasion" value={character.evasion} />
      <Defense left={228} width={82} label="Armor" value={character.armorScore} />
      <Defense left={312} width={84} label="Prof" value={character.proficiency} />

      {/* ---------- HP (red-tab bar) ---------- */}
      <ProvidedFrame Svg={FrameSvg.HpBar} left={16} top={206} w={380} h={92} />
      <SheetText left={36} top={218} width={120} height={13} color={INK} size={10} family={Body.bold} align="left" uppercase letterSpacing={1}>Hit Points</SheetText>
      <SheetText left={34} top={238} width={50} height={42} color={tint ?? RED} size={34} family={Display.black} align="left" tabularNums>{character.hitPoints.current}</SheetText>
      <SheetText left={84} top={246} width={56} height={30} color={INK} size={22} family={Display.bold} align="left">/ {character.hitPoints.max}</SheetText>
      <PipRow left={150} top={240} width={232} height={44} states={hearts} pipWidth={44} pipHeight={44} artFor={heartArt} tintFor={heartTint} />

      {/* ---------- Armor (dark panel, 2 rows of big pips) ---------- */}
      <ProvidedFrame Svg={FrameSvg.ArmorBg} left={16} top={308} w={380} h={120} />
      <SheetText left={34} top={318} width={120} height={13} color={Rune.goldText} size={10} family={Body.bold} align="left" uppercase letterSpacing={1.5}>Armor</SheetText>
      <PipGrid left={36} top={340} perRow={6} gap={20} states={armor} pip={40} artFor={armorArt} />

      {/* ---------- Stress (chamfered, 2 rows of big pips) ---------- */}
      <ChamferFrame left={16} top={438} width={380} height={120} chamfer={12} stroke={GOLDD} strokeWidth={1.4} />
      <SheetText left={36} top={448} width={120} height={13} color={INK} size={10} family={Body.bold} align="left" uppercase letterSpacing={1.5}>Stress</SheetText>
      <PipGrid left={36} top={470} perRow={6} gap={20} states={stress} pip={40} artFor={stressArt} tintFor={heartTint} />

      {/* ---------- Hope (elegant connected diamonds, aligned with Stress) ---------- */}
      <ChamferFrame left={16} top={568} width={380} height={86} chamfer={12} stroke={GOLDD} strokeWidth={1.4} />
      <SheetText left={36} top={578} width={120} height={13} color={INK} size={10} family={Body.bold} align="left" uppercase letterSpacing={1.5}>Hope</SheetText>
      <HopeLine left={36} top={600} width={340} count={character.hope.total} active={character.hope.active} pip={42} />
    </>
  );
}

function Defense({ left, width, label, value }: { left: number; width: number; label: string; value: number }) {
  return (
    <>
      <SheetText left={left} top={130} width={width} height={11} color={Rune.goldText} size={7.5} family={Body.bold} align="center" uppercase letterSpacing={0.6}>{label}</SheetText>
      <SheetText left={left} top={143} width={width} height={34} color={IVORY} size={26} family={Display.black} align="center" tabularNums>{value}</SheetText>
    </>
  );
}

/** When the deck expands, dim the whole sheet (content + frame) so the cards become the focus.
 *  Rendered ABOVE the sheet but BELOW the gear + cards, so those stay bright. */
function ExpandVeil() {
  const { expandProgress } = useCarousel();
  const style = useAnimatedStyle(() => ({ opacity: expandProgress.value * 0.62 }));
  return <Animated.View style={[box(0, 0, 412, 892), { backgroundColor: '#090B10', borderRadius: 26 }, style]} pointerEvents="none" />;
}

/**
 * The single redesigned sheet (style-derived from the AELIANA mockup): chamfered/flat, red + gold,
 * big resource icons, traits kept, compact bio, dark blue defense panel, cards at the bottom.
 * The accent stays red (the picker UI is removed; the logic remains).
 */
export function RedesignedSheet({ character = SAMPLE_CHARACTER }: { character?: Character }) {
  return (
    <AccentProvider>
      <CarouselProvider>
        <View style={{ flex: 1, backgroundColor: Rune.ink }}>
          <SafeAreaView style={{ flex: 1 }} edges={['top', 'bottom']}>
            <DesignStage designWidth={SHEET_DESIGN_WIDTH} designHeight={SHEET_DESIGN_HEIGHT}>
              <RedesignedBody character={character} />
              <TraitBanners character={character} modifierSize={22} groupTop={664} />
              <SheetFrame />
              {/* veil dims everything above; gear + cards below stay bright */}
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
