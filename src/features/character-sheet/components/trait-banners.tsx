import { View } from 'react-native';

import { ArtImage } from '@/components/art-image';
import { PressableArt } from '@/components/pressable-art';
import { Body, Display, Rune } from '@/constants/theme';
import { box } from '@/lib/design';
import { playSfx } from '@/lib/sfx';
import { Art } from '../art';
import { type Character, formatModifier, TRAIT_ORDER } from '../character';
import { SheetText } from './primitives';

// Geometry from the mockup: six evenly-spaced banners along the bottom row.
const FIRST_X = 26.1;
const STEP = 61.4;
const DEFAULT_GROUP_TOP = 598;
const GROUP_W = 56.4;
// 10px taller than the mockup's 119: the banner ART stretches down (the glyph on top does NOT) so
// the modifier numeral gets real room instead of clipping against the bottom edge (#48 H).
const GROUP_H = 129;

interface TraitBannerProps {
  x: number;
  groupTop: number;
  label: string;
  icon: number;
  value: number;
  modifierSize: number;
  /** v0.39.0: while the dice tray is open a trait throws the duality pair with its modifier. */
  onRoll?: (label: string, value: number) => void;
}

function TraitBanner({ x, groupTop, label, icon, value, modifierSize, onRoll }: TraitBannerProps) {
  return (
    <View style={box(x, groupTop, GROUP_W, GROUP_H)}>
      <PressableArt
        style={{ flex: 1 }}
        pressedScale={1.1}
        onPress={() => { if (onRoll) { onRoll(label, value); return; } playSfx('numpadPress'); }}
        accessibilityLabel={onRoll ? `Throw the duality dice with ${label} ${formatModifier(value)}` : `${label} ${formatModifier(value)}`}>
        {/* Hex shield background — a banner outline, so it fills its box (stretched 10px down,
            independent of the glyph above it, #48 H) */}
        <View style={box(0, 9.6, GROUP_W, 119.4)}>
          <ArtImage source={Art.traitBanner} fit="fill" />
        </View>
        {/* Trait glyph, poking above the banner top */}
        <View style={box((GROUP_W - 49) / 2, 0, 49, 52)}>
          <ArtImage source={icon} fit="contain" />
        </View>
        {/* Abbreviate to 3 letters so the label fits natively at a legible size (no web ellipsis, L2). */}
        <SheetText left={2} top={56} width={GROUP_W - 4} height={15} color={Rune.goldText} size={12} family={Body.bold} letterSpacing={0.6} uppercase>
          {label.slice(0, 3)}
        </SheetText>
        {/* Negatives read in a distinct terracotta so the lone "−1" doesn't blend with the "+" stats (I2).
            Tucked up under the trait label, clear of the banner's bottom gold dots (#95 E). */}
        <SheetText left={-4} top={70} width={GROUP_W + 8} height={32} color={value < 0 ? '#E2705A' : Rune.ivory} size={modifierSize} family={Display.black} tabularNums>
          {formatModifier(value)}
        </SheetText>
      </PressableArt>
    </View>
  );
}

export function TraitBanners({
  character,
  modifierSize = 18,
  groupTop = DEFAULT_GROUP_TOP,
  onRoll,
}: {
  character: Character;
  modifierSize?: number;
  groupTop?: number;
  /** Set only while the dice tray is up: a trait becomes a throw of the pair, plus this modifier. */
  onRoll?: (label: string, value: number) => void;
}) {
  return (
    <>
      {TRAIT_ORDER.map((trait, i) => (
        <TraitBanner
          key={trait.key}
          x={FIRST_X + STEP * i}
          groupTop={groupTop}
          label={trait.label}
          icon={trait.icon}
          value={character.traits[trait.key]}
          modifierSize={modifierSize}
          onRoll={onRoll}
        />
      ))}
    </>
  );
}
