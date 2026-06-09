/**
 * Central registry of Daggerheart sheet art. Metro needs literal `require` paths, so all asset
 * wiring lives here; components reference art by logical name. Files live in `assets/art/`.
 */
export const Art = {
  // Frame & class
  longBorder: require('../../../assets/art/longborder-658778e3.png'),
  classBanner: require('../../../assets/art/classban-ecd52cb8.png'),

  // Portrait
  portraitFrame: require('../../../assets/art/imageportrait-01c37b55.png'),
  portraitPlaceholder: require('../../../assets/art/characterplaceholder-f423be8b.png'),
  portraitIcon: require('../../../assets/art/charportraiticonbbox-fa427673.png'),

  // Bio
  bioDivider: require('../../../assets/art/biodiv-7ea88e9b.png'),
  badgeFrame: require('../../../assets/art/untitled-79054e40.png'),
  communityIcon: require('../../../assets/art/untitled-e095b21d.png'),
  ancestryIcon: require('../../../assets/art/untitled-64af80a0.png'),
  subclassIcon: require('../../../assets/art/untitled-b8358a3f.png'),
  levelBanner: require('../../../assets/art/untitled-3806c8f6.png'),
  levelCrown: require('../../../assets/art/lvlcrown-32ac6693.png'),

  // Armor panel
  armorPanel: require('../../../assets/art/armorpanel-1cd2c3c8.png'),
  armorIcon: require('../../../assets/art/armoricon-505cc4af.png'),
  armorDepleted: require('../../../assets/art/depletedarmor-73342e7c.png'),
  armorLocked: require('../../../assets/art/lockedarmor-337e5d6d.png'),

  // Heart / HP panel
  heartPanel: require('../../../assets/art/heartpanel-f1a8fd4a.png'),
  heart: require('../../../assets/art/hearticon-d642a5ef.png'),
  heartDepleted: require('../../../assets/art/depletedheart-94cb1838.png'),
  hpSlash: require('../../../assets/art/hpslash-28a3c09a.png'),
  heartBreakIcon: require('../../../assets/art/untitled-d3ce8259.png'),

  // Hope / Stress panel
  hopeStressPanel: require('../../../assets/art/hopestresspanel-6f9c68a0.png'),
  hopeTitleIcon: require('../../../assets/art/r-hoicon-5f6bb94d.png'),
  stressTitleIcon: require('../../../assets/art/r-sticon-830cacf4.png'),
  hope: require('../../../assets/art/hopeicon1-56195480.png'),
  hopeDepleted: require('../../../assets/art/depletedhope-14964132.png'),
  stress: require('../../../assets/art/stressicon-abcbc964.png'),
  stressDepleted: require('../../../assets/art/depletedstress-7464fbf0.png'),
  stressLocked: require('../../../assets/art/lockedstress-b16689dc.png'),

  // Trait banners
  traitBanner: require('../../../assets/art/traitbanner-862bd075.png'),
  traitAgility: require('../../../assets/art/untitled-8e4ecad8.png'),
  traitStrength: require('../../../assets/art/untitled-8bace08b.png'),
  traitFinesse: require('../../../assets/art/untitled-fbe32813.png'),
  traitInstinct: require('../../../assets/art/untitled-344ef720.png'),
  traitPresence: require('../../../assets/art/untitled-9992977e.png'),
  traitKnowledge: require('../../../assets/art/untitled-532b2861.png'),
} as const;

export type ArtKey = keyof typeof Art;
