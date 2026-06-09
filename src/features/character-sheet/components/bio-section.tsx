import { View } from 'react-native';

import { useAccent } from '@/components/accent';
import { ArtImage } from '@/components/art-image';
import { Body, Display, Rune } from '@/constants/theme';
import { box } from '@/lib/design';
import { Art } from '../art';
import type { Character } from '../character';
import { ArtBox, SheetText } from './primitives';

const INK = Rune.inkText;

interface BadgeProps {
  x: number;
  label: string;
  value: string;
  icon: number;
}

/** Community / Ancestry / Subclass — a small shield with a label over a red value. */
function OriginBadge({ x, label, value, icon }: BadgeProps) {
  const accent = useAccent();
  return (
    <View style={box(x, 184.7, 62.3, 30.5)}>
      {/* shield outline fills its box; the glyph inside keeps its aspect */}
      <View style={box(0, 0, 26.4, 30.5)}>
        <ArtImage source={Art.badgeFrame} fit="fill" />
      </View>
      <View style={box(3.5, 4.3, 19.4, 18.9)}>
        <ArtImage source={icon} fit="contain" />
      </View>
      <SheetText left={29} top={4} width={34} height={8} color={INK} size={6} family={Body.bold} align="left" uppercase letterSpacing={0.4}>
        {label}
      </SheetText>
      <SheetText left={29} top={13} width={34} height={11} color={accent} size={8} family={Body.bold} align="left">
        {value}
      </SheetText>
    </View>
  );
}

/** Vertical banner on the far right: crown, LEVEL, and the level number. */
function LevelBanner({ level }: { level: number }) {
  const accent = useAccent();
  return (
    <View style={box(331.7, 57.1, 57.5, 113.2)}>
      <View style={box(0, 0, 57.5, 113.2)}>
        <ArtImage source={Art.levelBanner} fit="fill" />
      </View>
      <View style={box(20.6, 17.8, 16.4, 15.7)}>
        <ArtImage source={Art.levelCrown} fit="contain" />
      </View>
      <SheetText left={16} top={39} width={26} height={9} color={INK} size={6.5} family={Body.bold} align="center" uppercase letterSpacing={1}>
        Level
      </SheetText>
      <SheetText left={13} top={54} width={31} height={40} color={accent} size={26} family={Display.black} align="center" tabularNums>
        {level}
      </SheetText>
    </View>
  );
}

export function BioSection({ character }: { character: Character }) {
  const accent = useAccent();
  return (
    <>
      <SheetText left={172.3} top={55} width={152} height={47} color={INK} size={22} family={Display.black} align="left" vAlign="top" lineHeight={21} numberOfLines={2} uppercase letterSpacing={-0.4}>
        {character.name}
      </SheetText>
      <SheetText left={172.3} top={112} width={150} height={11} color={accent} size={10} family={Body.bold} align="left" uppercase letterSpacing={0.3}>
        {character.domains[0]} × {character.domains[1]}
      </SheetText>
      <SheetText left={172.3} top={127} width={150} height={10} color={Rune.muted} size={9} family={Body.medium} align="left">
        {character.className} · {character.subclass}
      </SheetText>
      {character.quote ? (
        <SheetText left={172.3} top={146} width={150} height={11} color="#8d8885" size={8.5} family={Body.italic} italic align="left">
          “{character.quote}”
        </SheetText>
      ) : null}

      <ArtBox left={172.2} top={163.5} width={147.1} height={8.9} source={Art.bioDivider} fit="fill" />

      <OriginBadge x={169.2} label="Subclass" value={character.subclass} icon={Art.subclassIcon} />
      <OriginBadge x={247.4} label="Ancestry" value={character.ancestry} icon={Art.ancestryIcon} />
      <OriginBadge x={325.8} label="Community" value={character.community} icon={Art.communityIcon} />

      <LevelBanner level={character.level} />
    </>
  );
}
