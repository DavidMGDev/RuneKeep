import { Body, Display, Rune } from '@/constants/theme';
import type { PipState } from '@/lib/pips';
import { resolvePips } from '@/lib/pips';
import { Art } from '../art';
import type { Character } from '../character';
import { ArtBox, PipRow, SheetText } from './primitives';

const armorArt = (s: PipState) =>
  s === 'depleted' ? Art.armorDepleted : s === 'locked' ? Art.armorLocked : Art.armorIcon;

interface StatProps {
  left: number;
  width: number;
  label: string;
  value: number | string;
  labelSize?: number;
}

/** A gold label over a pale numeral — the Evasion / Armor / Proficiency columns (dark panel). */
function Stat({ left, width, label, value, labelSize = 7.5 }: StatProps) {
  return (
    <>
      <SheetText left={left} top={245} width={width} height={11} color={Rune.goldText} size={labelSize} family={Body.bold} align="center" uppercase letterSpacing={0.8}>
        {label}
      </SheetText>
      <SheetText left={left} top={256} width={width} height={32} color={Rune.ivory} size={27} family={Display.black} align="center" tabularNums>
        {value}
      </SheetText>
    </>
  );
}

export function ArmorSection({ character }: { character: Character }) {
  const armor = resolvePips({
    total: character.armor.total,
    active: character.armor.active,
    locked: character.armor.locked,
    depletedRemainder: true,
  });

  return (
    <>
      <ArtBox left={95.9} top={222} width={300.4} height={100.9} source={Art.armorPanel} fit="fill" />

      <Stat left={176} width={52} label="Evasion" value={character.evasion} />
      <Stat left={240} width={42} label="Armor" value={character.armorScore} />
      <Stat left={318} width={46} label="Proficiency" value={character.proficiency} labelSize={6} />

      <PipRow left={165.5} top={300.7} width={216.5} height={15.3} states={armor} pipWidth={12.5} pipHeight={15.3} artFor={armorArt} />
    </>
  );
}
