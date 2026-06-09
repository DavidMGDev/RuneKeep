import { View } from 'react-native';
import Animated, { type SharedValue, useAnimatedStyle } from 'react-native-reanimated';

import { ArtImage } from '@/components/art-image';
import { PressableArt } from '@/components/pressable-art';
import { Body, Display, Rune } from '@/constants/theme';
import { box } from '@/lib/design';
import { Art } from '../art';
import { type Character, formatModifier, TRAIT_ORDER } from '../character';
import { useCarousel } from '../carousel-context';
import { SheetText } from './primitives';

// Geometry from the mockup: six evenly-spaced banners along the bottom row.
const FIRST_X = 26.1;
const STEP = 61.4;
const GROUP_TOP = 598;
const GROUP_W = 56.4;
const GROUP_H = 119;

interface TraitBannerProps {
  index: number;
  x: number;
  label: string;
  icon: number;
  value: number;
  modifierSize: number;
  expandProgress: SharedValue<number>;
}

function TraitBanner({ index, x, label, icon, value, modifierSize, expandProgress }: TraitBannerProps) {
  // First 3 banners exit left, last 3 exit right, staggered, as the cards expand.
  const dir = index < 3 ? -1 : 1;
  const order = index < 3 ? 2 - index : index - 3;

  const fly = useAnimatedStyle(() => {
    const p = expandProgress.value;
    const tx = p * dir * (412 * 0.85 + order * 24);
    return { transform: [{ translateX: tx }], opacity: 1 - Math.min(1, p * 1.6) };
  });

  return (
    <Animated.View style={[box(x, GROUP_TOP, GROUP_W, GROUP_H), fly]}>
      <PressableArt style={{ flex: 1 }} pressedScale={1.1}>
        {/* Hex shield background — a banner outline, so it fills its box */}
        <View style={box(0, 9.6, GROUP_W, 109.4)}>
          <ArtImage source={Art.traitBanner} fit="fill" />
        </View>
        {/* Trait glyph, poking above the banner top */}
        <View style={box((GROUP_W - 49) / 2, 0, 49, 52)}>
          <ArtImage source={icon} fit="contain" />
        </View>
        <SheetText left={4} top={60} width={GROUP_W - 8} height={11} color={Rune.goldText} size={7.5} family={Body.bold} letterSpacing={0.6} uppercase>
          {label}
        </SheetText>
        <SheetText left={-4} top={68} width={GROUP_W + 8} height={24} color={Rune.ivory} size={modifierSize} family={Display.black} tabularNums>
          {formatModifier(value)}
        </SheetText>
      </PressableArt>
    </Animated.View>
  );
}

export function TraitBanners({ character, modifierSize = 18 }: { character: Character; modifierSize?: number }) {
  const { expandProgress } = useCarousel();
  return (
    <>
      {TRAIT_ORDER.map((trait, i) => (
        <TraitBanner
          key={trait.key}
          index={i}
          x={FIRST_X + STEP * i}
          label={trait.label}
          icon={trait.icon}
          value={character.traits[trait.key]}
          modifierSize={modifierSize}
          expandProgress={expandProgress}
        />
      ))}
    </>
  );
}
