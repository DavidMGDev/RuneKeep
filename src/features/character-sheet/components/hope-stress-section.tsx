import { Display, Rune } from '@/constants/theme';
import type { PipState } from '@/lib/pips';
import { resolvePips } from '@/lib/pips';
import { Art } from '../art';
import type { Character } from '../character';
import { ArtBox, PipRow, SheetText } from './primitives';

const INK = '#05070a';

const stressArt = (s: PipState) =>
  s === 'depleted' ? Art.stressDepleted : s === 'locked' ? Art.stressLocked : Art.stress;

const hopeArt = (s: PipState) => (s === 'active' ? Art.hope : Art.hopeDepleted);

export function HopeStressSection({ character }: { character: Character }) {
  const stress = resolvePips({
    total: character.stress.total,
    active: character.stress.active,
    locked: character.stress.locked,
    depletedRemainder: true,
  });
  const hope = resolvePips({
    total: character.hope.total,
    active: character.hope.active,
    depletedRemainder: true,
  });

  return (
    <>
      <ArtBox left={20.8} top={462.8} width={374.5} height={121.5} source={Art.hopeStressPanel} fit="fill" />

      {/* Stress (top row) */}
      <ArtBox left={37.6} top={483.7} width={15.7} height={19.3} source={Art.stressTitleIcon} />
      <SheetText left={61.9} top={486} width={60} height={14} color={INK} size={9} family={Display.bold} align="left" letterSpacing={0.5} uppercase>
        Stress
      </SheetText>
      <PipRow left={125.3} top={484.4} width={249.1} height={18.6} states={stress} pipWidth={15.1} pipHeight={18.6} artFor={stressArt} />

      {/* Hope (bottom row) */}
      <ArtBox left={34.3} top={540.6} width={24.1} height={24.7} source={Art.hopeTitleIcon} />
      <SheetText left={61.9} top={545} width={60} height={14} color={INK} size={9} family={Display.bold} align="left" letterSpacing={0.5} uppercase>
        Hope
      </SheetText>
      <PipRow left={125.3} top={543.5} width={249.1} height={18.7} states={hope} pipWidth={17.9} pipHeight={18.7} artFor={hopeArt} />
    </>
  );
}
