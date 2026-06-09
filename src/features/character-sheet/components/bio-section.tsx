import { View } from 'react-native';

import { ArtImage } from '@/components/art-image';
import { Display, Rune } from '@/constants/theme';
import { box } from '@/lib/design';
import { Art } from '../art';
import type { Character } from '../character';
import { ArtBox, SheetText } from './primitives';

const NAME_INK = '#090d11';

interface BadgeProps {
  x: number;
  label: string;
  value: string;
  icon: number;
}

/** Community / Ancestry / Subclass — a small shield with a label over a red value. */
function OriginBadge({ x, label, value, icon }: BadgeProps) {
  return (
    <View style={box(x, 184.7, 62.3, 30.5)}>
      <View style={box(0, 0, 26.4, 30.5)}>
        <ArtImage source={Art.badgeFrame} fit="contain" />
      </View>
      <View style={box(3.5, 4.3, 19.4, 18.9)}>
        <ArtImage source={icon} fit="contain" />
      </View>
      <SheetText left={29} top={3} width={34} height={9} color={NAME_INK} size={6} family={Display.semibold} align="left" uppercase letterSpacing={0.2} numberOfLines={1}>
        {label}
      </SheetText>
      <SheetText left={29} top={13} width={34} height={11} color={Rune.red} size={7} family={Display.bold} align="left" numberOfLines={1}>
        {value}
      </SheetText>
    </View>
  );
}

/** Vertical banner on the far right: crown, LEVEL, and the level number. */
function LevelBanner({ level }: { level: number }) {
  return (
    <View style={box(331.7, 57.1, 57.5, 113.2)}>
      <View style={box(0, 0, 57.5, 113.2)}>
        <ArtImage source={Art.levelBanner} fit="contain" />
      </View>
      <View style={box(20.6, 17.8, 16.4, 15.7)}>
        <ArtImage source={Art.levelCrown} fit="contain" />
      </View>
      <SheetText left={16} top={39} width={26} height={10} color={NAME_INK} size={6.5} family={Display.bold} align="center" uppercase letterSpacing={0.5}>
        Level
      </SheetText>
      <SheetText left={17} top={55} width={24} height={40} color={Rune.red} size={28} family={Display.black} align="center">
        {level}
      </SheetText>
    </View>
  );
}

export function BioSection({ character }: { character: Character }) {
  return (
    <>
      <SheetText left={172.3} top={56} width={150} height={46} color={NAME_INK} size={19} family={Display.black} align="left" vAlign="top" lineHeight={21} numberOfLines={2}>
        {character.name}
      </SheetText>
      <SheetText left={172.3} top={112} width={150} height={12} color={Rune.red} size={10} family={Display.semibold} align="left" numberOfLines={1}>
        {character.domains[0]} × {character.domains[1]}
      </SheetText>
      <SheetText left={172.3} top={127} width={150} height={10} color={Rune.muted} size={8.5} family={Display.regular} align="left" numberOfLines={1}>
        {character.className} · {character.subclass}
      </SheetText>
      {character.quote ? (
        <SheetText left={172.3} top={146} width={150} height={12} color="#8d8885" size={8.5} family={Display.regular} align="left" numberOfLines={1}>
          “{character.quote}”
        </SheetText>
      ) : null}

      <ArtBox left={172.2} top={163.5} width={147.1} height={8.9} source={Art.bioDivider} />

      <OriginBadge x={169.2} label="Subclass" value={character.subclass} icon={Art.subclassIcon} />
      <OriginBadge x={247.4} label="Ancestry" value={character.ancestry} icon={Art.ancestryIcon} />
      <OriginBadge x={325.8} label="Community" value={character.community} icon={Art.communityIcon} />

      <LevelBanner level={character.level} />
    </>
  );
}
