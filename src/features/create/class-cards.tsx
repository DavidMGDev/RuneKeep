import { type FC } from 'react';
import { type SvgProps } from 'react-native-svg';

import BardBanner from '../../../assets/art/classBanners/image-9.svg';
import DruidBanner from '../../../assets/art/classBanners/image-8.svg';
import GuardianBanner from '../../../assets/art/classBanners/image-6.svg';
import RangerBanner from '../../../assets/art/classBanners/image-7.svg';
import RogueBanner from '../../../assets/art/classBanners/image-3.svg';
import SeraphBanner from '../../../assets/art/classBanners/image-5.svg';
import SorcererBanner from '../../../assets/art/classBanners/image-4.svg';
import WarriorBanner from '../../../assets/art/classBanners/image.svg';
import WizardBanner from '../../../assets/art/classBanners/image-2.svg';
import { type ClassName } from '@/constants/identity';
import { CLASS_DATA } from './class-data';

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
};

export const classBanner = (key: ClassName): FC<SvgProps> => BANNERS[key];

export const CLASS_CARDS: ClassCardDef[] = (Object.keys(BANNERS) as ClassName[]).map((key) => ({
  key,
  title: key.charAt(0).toUpperCase() + key.slice(1),
  Banner: BANNERS[key],
  body: CLASS_DATA[key].summary,
}));
