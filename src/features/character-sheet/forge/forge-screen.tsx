import { Image } from 'expo-image';
import { View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { AccentProvider, useAccent, useAccentTint } from '@/components/accent';
import { AccentPicker } from '@/components/accent-picker';
import { ArtImage } from '@/components/art-image';
import { DesignStage } from '@/components/design-stage';
import { VariantSwitcher } from '@/components/variant-switcher';
import { Body, Display, Rune } from '@/constants/theme';
import { box, SHEET_DESIGN_HEIGHT, SHEET_DESIGN_WIDTH } from '@/lib/design';
import { type PipState, resolvePips } from '@/lib/pips';
import { Art } from '../art';
import { CarouselProvider } from '../carousel-context';
import { type Character, formatModifier, SAMPLE_CHARACTER, TRAIT_ORDER } from '../character';
import { CardCarousel } from '../components/card-carousel';
import { GearDecoration } from '../components/gear-decoration';
import { PipRow, SheetText } from '../components/primitives';
import { SheetFrame } from '../components/sheet-frame';
import { ForgeArt } from './forge-art';

const GOLD = Rune.goldText;
const GOLDB = Rune.goldBright;
const IVORY = Rune.ivory;
const FORGE_BG = '#0c0f16';
const DIVIDER = 'rgba(200,146,58,0.28)';

function Motif({ left, top, w, h, src, opacity = 1 }: { left: number; top: number; w: number; h: number; src: number; opacity?: number }) {
  return (
    <View style={[box(left, top, w, h), { opacity }]} pointerEvents="none">
      <Image source={src} style={{ width: '100%', height: '100%' }} contentFit="contain" cachePolicy="memory-disk" />
    </View>
  );
}

function Divider({ top }: { top: number }) {
  return <View style={[box(26, top, 360, 1), { backgroundColor: DIVIDER }]} pointerEvents="none" />;
}

/** A defense value seated in an ornate gear-dial. */
function Dial({ left, size, label, value }: { left: number; size: number; label: string; value: number | string }) {
  return (
    <>
      <SheetText left={left - 4} top={0} width={size + 8} height={12} color={GOLD} size={8} family={Body.bold} align="center" uppercase letterSpacing={1}>
        {label}
      </SheetText>
      <Motif left={left} top={14} w={size} h={size} src={ForgeArt.dial} />
      <SheetText left={left} top={14 + size / 2 - size * 0.28} width={size} height={size * 0.56} color={IVORY} size={size * 0.42} family={Display.black} align="center" tabularNums>
        {value}
      </SheetText>
    </>
  );
}

function ForgeBody({ character }: { character: Character }) {
  const accent = useAccent();
  const tint = useAccentTint();
  const heartTint = (s: PipState) => (s === 'active' ? tint : undefined);
  const stressTint = (s: PipState) => (s === 'active' ? tint : undefined);

  const hearts = resolvePips({ total: character.hearts.total, active: character.hearts.active, depletedRemainder: true });
  const stress = resolvePips({ total: character.stress.total, active: character.stress.active, locked: character.stress.locked, depletedRemainder: true });
  const hope = resolvePips({ total: character.hope.total, active: character.hope.active, depletedRemainder: true });
  const armor = resolvePips({ total: character.armor.total, active: character.armor.active, locked: character.armor.locked, depletedRemainder: true });

  const heartArt = (s: PipState) => (s === 'active' ? Art.heart : Art.heartDepleted);
  const stressArt = (s: PipState) => (s === 'depleted' ? Art.stressDepleted : s === 'locked' ? Art.stressLocked : Art.stress);
  const hopeArt = (s: PipState) => (s === 'active' ? Art.hope : Art.hopeDepleted);
  const armorArt = (s: PipState) => (s === 'depleted' ? Art.armorDepleted : s === 'locked' ? Art.armorLocked : Art.armorIcon);

  return (
    <>
      {/* dark forge surface + a faint cog watermark behind everything */}
      <View style={[box(0, 0, 412, 892), { backgroundColor: FORGE_BG, borderRadius: 28 }]} />
      <Motif left={61} top={150} w={290} h={290} src={ForgeArt.watermark} opacity={0.05} />

      {/* Header: portrait in a cog, name/class/level */}
      <View style={box(40, 56, 84, 96)}>
        <ArtImage source={Art.portraitPlaceholder} fit="contain" />
      </View>
      <Motif left={14} top={30} w={134} h={143} src={ForgeArt.cog} />
      <SheetText left={160} top={40} width={236} height={32} color={GOLDB} size={22} family={Display.black} align="left" uppercase letterSpacing={-0.4} numberOfLines={1}>
        {character.name}
      </SheetText>
      <SheetText left={160} top={78} width={236} height={12} color={accent} size={10} family={Body.bold} align="left" uppercase letterSpacing={0.4}>
        {character.ancestry} · {character.className}
      </SheetText>
      <SheetText left={160} top={94} width={236} height={11} color={Rune.muted} size={9} family={Body.medium} align="left" numberOfLines={1}>
        {character.subclass}
      </SheetText>
      <SheetText left={160} top={116} width={120} height={18} color={GOLD} size={12} family={Body.bold} align="left" uppercase letterSpacing={2}>
        Level {character.level}
      </SheetText>

      {/* Defense dials */}
      <View style={{ position: 'absolute', left: 0, top: 188, width: 412, height: 130 }}>
        <Dial left={34} size={96} label="Evasion" value={character.evasion} />
        <Dial left={148} size={116} label="Armor" value={character.armorScore} />
        <Dial left={282} size={96} label="Proficiency" value={character.proficiency} />
      </View>

      <Divider top={338} />

      {/* Resource tracks */}
      <SheetText left={26} top={348} width={130} height={13} color={GOLD} size={10} family={Body.bold} align="left" uppercase letterSpacing={1.5}>
        Hit Points
      </SheetText>
      <SheetText left={26} top={362} width={44} height={30} color={accent} size={26} family={Display.black} align="left" tabularNums>
        {character.hitPoints.current}
      </SheetText>
      <SheetText left={72} top={366} width={64} height={24} color={Rune.muted} size={16} family={Display.bold} align="left">
        / {character.hitPoints.max}
      </SheetText>
      <PipRow left={148} top={362} width={240} height={28} states={hearts} pipWidth={28} pipHeight={28} artFor={heartArt} tintFor={heartTint} />

      <Divider top={404} />
      <SheetText left={26} top={414} width={130} height={13} color={GOLD} size={10} family={Body.bold} align="left" uppercase letterSpacing={1.5}>
        Stress
      </SheetText>
      <PipRow left={26} top={430} width={360} height={26} states={stress} pipWidth={26} pipHeight={26} artFor={stressArt} tintFor={stressTint} />

      <Divider top={470} />
      <SheetText left={26} top={480} width={130} height={13} color={GOLD} size={10} family={Body.bold} align="left" uppercase letterSpacing={1.5}>
        Hope
      </SheetText>
      <PipRow left={148} top={476} width={240} height={28} states={hope} pipWidth={28} pipHeight={28} artFor={hopeArt} />

      <Divider top={518} />
      <SheetText left={26} top={528} width={130} height={13} color={GOLD} size={10} family={Body.bold} align="left" uppercase letterSpacing={1.5}>
        Armor
      </SheetText>
      <PipRow left={26} top={544} width={360} height={24} states={armor} pipWidth={24} pipHeight={24} artFor={armorArt} />

      <Divider top={584} />

      {/* Traits row */}
      {TRAIT_ORDER.map((trait, i) => {
        const x = 16 + i * 64;
        return (
          <View key={trait.key} style={box(x, 594, 64, 96)} pointerEvents="none">
            <View style={box(12, 0, 40, 40)}>
              <ArtImage source={trait.icon} fit="contain" />
            </View>
            <SheetText left={0} top={42} width={64} height={10} color={GOLD} size={6.5} family={Body.bold} align="center" uppercase letterSpacing={0.3} numberOfLines={1}>
              {trait.label}
            </SheetText>
            <SheetText left={0} top={54} width={64} height={26} color={IVORY} size={22} family={Display.black} align="center" tabularNums>
              {formatModifier(character.traits[trait.key])}
            </SheetText>
          </View>
        );
      })}
    </>
  );
}

/**
 * "Forge" — a from-scratch layout in the arcane-clockwork aesthetic of the gear art: dark surface,
 * gold filigree, a cog-framed portrait, ornate stat dials, and resource tracks. Same stat icons,
 * enlarged. Reuses the carousel, bottom gear, accent, and variant switcher. Original/revised untouched.
 */
export function ForgeScreen({ character = SAMPLE_CHARACTER }: { character?: Character }) {
  return (
    <AccentProvider>
      <CarouselProvider>
        <View style={{ flex: 1, backgroundColor: Rune.ink }}>
          <SafeAreaView style={{ flex: 1 }} edges={['top', 'bottom']}>
            <DesignStage designWidth={SHEET_DESIGN_WIDTH} designHeight={SHEET_DESIGN_HEIGHT}>
              <ForgeBody character={character} />
              <GearDecoration />
              <SheetFrame />
              <CardCarousel />
            </DesignStage>
          </SafeAreaView>
          <AccentPicker />
          <VariantSwitcher />
        </View>
      </CarouselProvider>
    </AccentProvider>
  );
}
