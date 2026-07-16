import { type FC } from 'react';
import Svg, { Image as SvgImage, type SvgProps } from 'react-native-svg';

import BardBanner from '../../../../assets/art/classBanners/image-9.svg';
import DruidBanner from '../../../../assets/art/classBanners/image-8.svg';
import GuardianBanner from '../../../../assets/art/classBanners/image-6.svg';
import RangerBanner from '../../../../assets/art/classBanners/image-7.svg';
import RogueBanner from '../../../../assets/art/classBanners/image-3.svg';
import SeraphBanner from '../../../../assets/art/classBanners/image-5.svg';
import SorcererBanner from '../../../../assets/art/classBanners/image-4.svg';
import WarriorBanner from '../../../../assets/art/classBanners/image.svg';
import WizardBanner from '../../../../assets/art/classBanners/image-2.svg';
import AssassinBanner from '../../../../assets/art/classBanners/void/assassin.webp';
import BloodHunterBanner from '../../../../assets/art/classBanners/void/bloodhunter.webp';
import BrawlerBanner from '../../../../assets/art/classBanners/void/brawler.webp';
import SummonerBanner from '../../../../assets/art/classBanners/void/summoner.webp';
import WarlockBanner from '../../../../assets/art/classBanners/void/warlock.webp';
import WitchBanner from '../../../../assets/art/classBanners/void/witch.webp';
import { type ClassName } from '@/constants/identity';
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

// v0.12.2: the owner's Void class banner art (assets/art/classBanners/void/*.webp), wrapped in an <Svg>
// so it satisfies the FC<SvgProps> Banner contract and fills the 62px banner column exactly like the base
// SVG banners — top-aligned, width-filling (the outer caller passes width/height/preserveAspectRatio).
const VOID_BANNER_ART: Partial<Record<ClassName, number>> = {
  assassin: AssassinBanner,
  witch: WitchBanner,
  warlock: WarlockBanner,
  bloodhunter: BloodHunterBanner,
  summoner: SummonerBanner,
  brawler: BrawlerBanner,
};

const voidBanner = (key: ClassName): FC<SvgProps> => {
  const src = VOID_BANNER_ART[key]!;
  const Banner: FC<SvgProps> = (props) => (
    <Svg viewBox="0 0 62 97" {...props}>
      <SvgImage href={src} x={0} y={0} width={62} height={97} preserveAspectRatio="xMidYMin slice" />
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
