import { View } from 'react-native';

import { useAccent } from '@/components/accent';
import { Body, Display, Rune } from '@/constants/theme';
import { box } from '@/lib/design';
import type { PipState } from '@/lib/pips';
import { resolvePips } from '@/lib/pips';
import { Art } from '../art';
import type { Character } from '../character';
import { ArtBox, PipRow, SheetText } from './primitives';

const INK = Rune.inkText;

const heartArt = (s: PipState) => (s === 'active' ? Art.heart : Art.heartDepleted);

export function HeartSection({ character }: { character: Character }) {
  const accent = useAccent();
  const heartTint = (s: PipState) => (s === 'active' ? accent : undefined);
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
      <SheetText left={62} top={363} width={58} height={11} color={INK} size={8} family={Body.bold} align="left" uppercase letterSpacing={0.8}>
        Hit Points
      </SheetText>
      <SheetText left={40} top={382} width={39} height={37} color={accent} size={26} family={Display.black} align="center" tabularNums>
        {character.hitPoints.current}
      </SheetText>
      <ArtBox left={81.2} top={387.3} width={13.9} height={32.3} source={Art.hpSlash} />
      <SheetText left={97} top={390} width={33} height={29} color={INK} size={23} family={Display.bold} align="center" tabularNums>
        {character.hitPoints.max}
      </SheetText>

      {/* Right: hearts row + captions */}
      <SheetText left={176.3} top={362} width={52} height={11} color={INK} size={7.5} family={Body.bold} align="left" uppercase letterSpacing={0.6}>
        Current HP
      </SheetText>
      <SheetText left={252} top={362} width={115} height={11} color={Rune.muted} size={7.5} family={Body.medium} align="right" uppercase letterSpacing={0.3}>
        Golden Hearts Worth {character.heartsWorth}
      </SheetText>
      <PipRow left={176.4} top={386.6} width={190.9} height={22.7} states={hearts} pipWidth={21.3} pipHeight={22.7} artFor={heartArt} tintFor={heartTint} />
    </>
  );
}
