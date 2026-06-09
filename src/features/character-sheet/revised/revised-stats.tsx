import { useAccentTint } from '@/components/accent';
import { Body, Display, Rune } from '@/constants/theme';
import type { PipState } from '@/lib/pips';
import { resolvePips } from '@/lib/pips';
import { Art } from '../art';
import type { Character } from '../character';
import { ArtBox, PipRow, SheetText } from '../components/primitives';

const INK = '#0d0b07';

const heartArt = (s: PipState) => (s === 'active' ? Art.heart : Art.heartDepleted);
const stressArt = (s: PipState) =>
  s === 'depleted' ? Art.stressDepleted : s === 'locked' ? Art.stressLocked : Art.stress;
const hopeArt = (s: PipState) => (s === 'active' ? Art.hope : Art.hopeDepleted);
const armorArt = (s: PipState) =>
  s === 'depleted' ? Art.armorDepleted : s === 'locked' ? Art.armorLocked : Art.armorIcon;

interface StatProps {
  left: number;
  width: number;
  label: string;
  value: number | string;
  labelSize?: number;
}

function Stat({ left, width, label, value, labelSize = 8 }: StatProps) {
  return (
    <>
      <SheetText left={left} top={241} width={width} height={12} color={Rune.goldText} size={labelSize} family={Body.bold} align="center" uppercase letterSpacing={0.8}>
        {label}
      </SheetText>
      <SheetText left={left} top={252} width={width} height={40} color={Rune.ivory} size={34} family={Display.black} align="center" tabularNums>
        {value}
      </SheetText>
    </>
  );
}

/**
 * Revised stat block — same art + icons, but every interactive pip is enlarged to one uniform,
 * thumb-tappable size and spread across the full width, and the numerals are bigger. Legibility over
 * density (the original stays untouched). 12-pip tracks span the panel width so they don't shrink.
 */
export function RevisedStats({ character }: { character: Character }) {
  const tint = useAccentTint();
  const heartTint = (s: PipState) => (s === 'active' ? tint : undefined);
  const stressTint = (s: PipState) => (s === 'active' ? tint : undefined);

  const hearts = resolvePips({ total: character.hearts.total, active: character.hearts.active, depletedRemainder: true });
  const armor = resolvePips({ total: character.armor.total, active: character.armor.active, locked: character.armor.locked, depletedRemainder: true });
  const hope = resolvePips({ total: character.hope.total, active: character.hope.active, depletedRemainder: true });
  const stress = resolvePips({ total: character.stress.total, active: character.stress.active, locked: character.stress.locked, depletedRemainder: true });

  // Uniform, tappable pip sizes (~1.5x+ the original).
  const PIP = 30;
  const PIP_SM = 24; // 12-across tracks, still much bigger than before

  return (
    <>
      {/* Armor / defenses panel (dark) — bigger numerals + bigger armor pips */}
      <ArtBox left={95.9} top={220} width={300.4} height={104} source={Art.armorPanel} fit="fill" />
      <Stat left={176} width={54} label="Evasion" value={character.evasion} />
      <Stat left={240} width={44} label="Armor" value={character.armorScore} />
      <Stat left={316} width={50} label="Proficiency" value={character.proficiency} labelSize={6.5} />
      <PipRow left={110} top={298} width={278} height={PIP_SM} states={armor} pipWidth={PIP_SM} pipHeight={PIP_SM} artFor={armorArt} />

      {/* Hit points — bigger tracker + bigger hearts */}
      <ArtBox left={20.8} top={344} width={374.5} height={112} source={Art.heartPanel} fit="fill" tint={tint} />
      <SheetText left={36} top={360} width={70} height={12} color={INK} size={9} family={Body.bold} align="left" uppercase letterSpacing={0.8}>
        Hit Points
      </SheetText>
      <SheetText left={30} top={376} width={52} height={44} color={tint ?? Rune.hpRed} size={36} family={Display.black} align="center" tabularNums>
        {character.hitPoints.current}
      </SheetText>
      <SheetText left={84} top={384} width={20} height={34} color={INK} size={26} family={Display.bold} align="center">
        /
      </SheetText>
      <SheetText left={104} top={380} width={44} height={38} color={INK} size={30} family={Display.bold} align="center" tabularNums>
        {character.hitPoints.max}
      </SheetText>
      <PipRow left={170} top={386} width={210} height={PIP} states={hearts} pipWidth={PIP} pipHeight={PIP} artFor={heartArt} tintFor={heartTint} />

      {/* Stress — full-width row of big pips */}
      <SheetText left={28} top={470} width={120} height={14} color={INK} size={11} family={Body.bold} align="left" uppercase letterSpacing={1.2}>
        Stress
      </SheetText>
      <PipRow left={26} top={486} width={360} height={PIP_SM} states={stress} pipWidth={PIP_SM} pipHeight={PIP_SM} artFor={stressArt} tintFor={stressTint} />

      {/* Hope — big diamonds */}
      <SheetText left={28} top={528} width={120} height={14} color={INK} size={11} family={Body.bold} align="left" uppercase letterSpacing={1.2}>
        Hope
      </SheetText>
      <PipRow left={120} top={524} width={266} height={PIP} states={hope} pipWidth={PIP} pipHeight={PIP} artFor={hopeArt} />
    </>
  );
}
