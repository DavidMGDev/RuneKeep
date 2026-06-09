import { View } from 'react-native';

import { ArtImage } from '@/components/art-image';
import { PressableArt } from '@/components/pressable-art';
import { Body, Display, Rune } from '@/constants/theme';
import { box } from '@/lib/design';
import { Art } from '../art';
import { type Character, formatModifier, TRAIT_ORDER } from '../character';
import { SheetText } from './primitives';

// Geometry from the mockup: six evenly-spaced banners along the bottom row.
const FIRST_X = 26.1;
const STEP = 61.4;
const GROUP_TOP = 598;
const GROUP_W = 56.4;
const GROUP_H = 119;

interface TraitBannerProps {
  x: number;
  label: string;
  icon: number;
  value: number;
  onPress?: () => void;
}

function TraitBanner({ x, label, icon, value, onPress }: TraitBannerProps) {
  return (
    <PressableArt style={box(x, GROUP_TOP, GROUP_W, GROUP_H)} pressedScale={1.1} onPress={onPress}>
      {/* Hex shield background — a banner outline, so it fills its box */}
      <View style={box(0, 9.6, GROUP_W, 109.4)}>
        <ArtImage source={Art.traitBanner} fit="fill" />
      </View>
      {/* Trait glyph, poking above the banner top */}
      <View style={box((GROUP_W - 49) / 2, 0, 49, 52)}>
        <ArtImage source={icon} fit="contain" />
      </View>
      <SheetText
        left={4}
        top={60}
        width={GROUP_W - 8}
        height={11}
        color={Rune.goldText}
        size={7.5}
        family={Body.bold}
        letterSpacing={0.6}
        uppercase>
        {label}
      </SheetText>
      <SheetText
        left={0}
        top={70}
        width={GROUP_W}
        height={21}
        color={Rune.ivory}
        size={18}
        family={Display.black}
        tabularNums>
        {formatModifier(value)}
      </SheetText>
    </PressableArt>
  );
}

export function TraitBanners({ character }: { character: Character }) {
  return (
    <>
      {TRAIT_ORDER.map((trait, i) => (
        <TraitBanner
          key={trait.key}
          x={FIRST_X + STEP * i}
          label={trait.label}
          icon={trait.icon}
          value={character.traits[trait.key]}
        />
      ))}
    </>
  );
}
