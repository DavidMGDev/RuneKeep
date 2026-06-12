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

/**
 * The nine class picks as FORGED (custom, code-rendered) cards. Banner art mapped by reading the
 * two domain glyphs each banner carries (a class banner = its domain pair stacked). Flavor lines
 * are RuneKeep's own copy, card-voiced — title-and-body like a printed card, not UI strings.
 */
export interface ClassCardDef {
  key: ClassName;
  title: string;
  Banner: FC<SvgProps>;
  body: string;
}

export const CLASS_CARDS: ClassCardDef[] = [
  { key: 'bard', title: 'Bard', Banner: BardBanner, body: 'Voice and verse as weaponry. Bards walk into rooms the way storms walk into harbors, and leave them rearranged.' },
  { key: 'druid', title: 'Druid', Banner: DruidBanner, body: 'The wild does not obey them; it recognizes them. Druids trade skin for storm, fang, and root when the land calls.' },
  { key: 'guardian', title: 'Guardian', Banner: GuardianBanner, body: 'A wall that chose its bricks. Guardians plant themselves between harm and the people who matter, and do not move.' },
  { key: 'ranger', title: 'Ranger', Banner: RangerBanner, body: 'Every trail tells. Rangers read the wilds like scripture and answer threats with arrow, blade, and beast.' },
  { key: 'rogue', title: 'Rogue', Banner: RogueBanner, body: 'Where light forgets to look, rogues are already there. Quick hands, quicker exits, debts settled in shadow.' },
  { key: 'seraph', title: 'Seraph', Banner: SeraphBanner, body: 'Faith with a sharpened edge. Seraphs carry their god into battle and bring its judgment down in gold and fire.' },
  { key: 'sorcerer', title: 'Sorcerer', Banner: SorcererBanner, body: 'Magic is not studied here; it is survived. Sorcerers channel the raw current that runs beneath the realms.' },
  { key: 'warrior', title: 'Warrior', Banner: WarriorBanner, body: 'Mastery measured in scars. Warriors end fights the way punctuation ends sentences: cleanly, and on their terms.' },
  { key: 'wizard', title: 'Wizard', Banner: WizardBanner, body: 'Knowledge hoarded, then unleashed. Wizards bend equations of power written long before the first kingdom.' },
];
