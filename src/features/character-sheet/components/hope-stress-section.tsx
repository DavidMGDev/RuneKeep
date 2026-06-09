import { Body, Rune } from '@/constants/theme';
import type { PipState } from '@/lib/pips';
import { resolvePips } from '@/lib/pips';
import { Art } from '../art';
import type { Character } from '../character';
import { ArtBox, PipRow, SheetText } from './primitives';

const INK = Rune.inkText;

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
      <SheetText left={60} top={485} width={58} height={15} color={INK} size={10} family={Body.bold} align="left" letterSpacing={1.2} uppercase>
        Stress
      </SheetText>
      <PipRow left={125.3} top={484.4} width={249.1} height={18.6} states={stress} pipWidth={15.1} pipHeight={18.6} artFor={stressArt} />

      {/* Hope (bottom row) */}
      <ArtBox left={34.3} top={540.6} width={24.1} height={24.7} source={Art.hopeTitleIcon} />
      <SheetText left={60} top={544} width={58} height={16} color={INK} size={10} family={Body.bold} align="left" letterSpacing={1.2} uppercase>
        Hope
      </SheetText>
      <PipRow left={125.3} top={543.5} width={249.1} height={18.7} states={hope} pipWidth={17.9} pipHeight={18.7} artFor={hopeArt} />
    </>
  );
}
