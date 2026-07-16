import { type FC } from 'react';
import Svg, { Rect, type SvgProps } from 'react-native-svg';

import BardBanner from '../../../../assets/art/classBanners/image-9.svg';
import DruidBanner from '../../../../assets/art/classBanners/image-8.svg';
import GuardianBanner from '../../../../assets/art/classBanners/image-6.svg';
import RangerBanner from '../../../../assets/art/classBanners/image-7.svg';
import RogueBanner from '../../../../assets/art/classBanners/image-3.svg';
import SeraphBanner from '../../../../assets/art/classBanners/image-5.svg';
import SorcererBanner from '../../../../assets/art/classBanners/image-4.svg';
import WarriorBanner from '../../../../assets/art/classBanners/image.svg';
import WizardBanner from '../../../../assets/art/classBanners/image-2.svg';
import { classColor, type ClassName } from '@/constants/identity';
import { CLASS_DATA } from '@/data/class-data';

/**
 * The nine class picks as FORGED (custom, code-rendered) cards. Banner art mapped by reading the
 * two domain glyphs each banner carries (a class banner = its domain pair stacked). Card copy =
 * the rulebook-grounded summaries in class-data.ts (PDF chapter 1 extraction).
 */
export interface ClassCardDef {
  key: ClassName;
  title: string;
  Banner: FC<SvgProps>;
  body: string;
}

// v0.12.2: placeholder banner for a Void class — a solid domain-blend field with a bright hairline.
// Real Void banner art (the JPGs in assets/temp/Banners) is a later Recraft pass (Phase D).
const voidBanner = (key: ClassName): FC<SvgProps> => {
  const c = classColor(key);
  const Banner: FC<SvgProps> = (props) => (
    <Svg viewBox="0 0 62 210" {...props}>
      <Rect x={0} y={0} width={62} height={210} fill={c.deep} />
      <Rect x={3} y={3} width={56} height={204} rx={4} fill="none" stroke={c.bright} strokeWidth={2} />
    </Svg>
  );
  return Banner;
};

const BANNERS: Record<ClassName, FC<SvgProps>> = {
  bard: BardBanner,
  druid: DruidBanner,
  guardian: GuardianBanner,
  ranger: RangerBanner,
  rogue: RogueBanner,
  seraph: SeraphBanner,
  sorcerer: SorcererBanner,
  warrior: WarriorBanner,
  wizard: WizardBanner,
  assassin: voidBanner('assassin'),
  witch: voidBanner('witch'),
  warlock: voidBanner('warlock'),
  bloodhunter: voidBanner('bloodhunter'),
  summoner: voidBanner('summoner'),
  brawler: voidBanner('brawler'),
};

export const classBanner = (key: ClassName): FC<SvgProps> => BANNERS[key];

export const CLASS_CARDS: ClassCardDef[] = (Object.keys(BANNERS) as ClassName[]).map((key) => ({
  key,
  title: key.charAt(0).toUpperCase() + key.slice(1),
  Banner: BANNERS[key],
  body: CLASS_DATA[key].summary,
}));
