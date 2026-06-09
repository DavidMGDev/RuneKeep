import { View } from 'react-native';

import { Display, Rune } from '@/constants/theme';
import { box } from '@/lib/design';
import type { PipState } from '@/lib/pips';
import { resolvePips } from '@/lib/pips';
import { Art } from '../art';
import type { Character } from '../character';
import { ArtBox, PipRow, SheetText } from './primitives';

const INK = '#08090a';

const heartArt = (s: PipState) => (s === 'active' ? Art.heart : Art.heartDepleted);

export function HeartSection({ character }: { character: Character }) {
  const hearts = resolvePips({
    total: character.hearts.total,
    active: character.hearts.active,
    depletedRemainder: true,
  });

  return (
    <>
      <ArtBox left={20.8} top={340.9} width={374.5} height={108.6} source={Art.heartPanel} fit="fill" />

      {/* Heartbreak marker (top-left of the panel) */}
      <View style={[box(26.3, 349.3, 10.9, 10.7), { borderRadius: 6, backgroundColor: '#ffffff' }]} />
      <ArtBox left={27.7} top={350.6} width={8.1} height={8.1} source={Art.heartBreakIcon} />

      {/* Left: Hit Points label + numeric tracker */}
      <ArtBox left={51.6} top={364.4} width={7.8} height={8.3} source={Art.heart} />
      <SheetText left={63.6} top={363} width={55} height={12} color={INK} size={7.5} family={Display.semibold} align="left" uppercase letterSpacing={0.3}>
        Hit Points
      </SheetText>
      <SheetText left={48} top={381} width={30} height={38} color={Rune.hpRed} size={30} family={Display.black} align="center">
        {character.hitPoints.current}
      </SheetText>
      <ArtBox left={81.2} top={387.3} width={13.9} height={32.3} source={Art.hpSlash} />
      <SheetText left={100} top={390} width={30} height={30} color={INK} size={23} family={Display.bold} align="center">
        {character.hitPoints.max}
      </SheetText>

      {/* Right: hearts row + captions */}
      <SheetText left={176.3} top={362} width={50} height={12} color={INK} size={7} family={Display.semibold} align="left" uppercase letterSpacing={0.3}>
        Current HP
      </SheetText>
      <SheetText left={255} top={362} width={112} height={12} color={Rune.muted} size={7} family={Display.regular} align="right">
        Golden Hearts Worth {character.heartsWorth}
      </SheetText>
      <PipRow left={176.4} top={386.6} width={190.9} height={22.7} states={hearts} pipWidth={21.3} pipHeight={22.7} artFor={heartArt} />
    </>
  );
}
