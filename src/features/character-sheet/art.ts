/**
 * Central registry of Daggerheart sheet art. Metro needs literal `require` paths, so all asset
 * wiring lives here; components reference art by logical name. Files live in `assets/art/`.
 */
export const Art = {
  // Frame & class
  longBorder: require('../../../assets/art/longborder-658778e3.webp'),
  classBanner: require('../../../assets/art/classban-ecd52cb8.webp'),

  // Portrait
  portraitFrame: require('../../../assets/art/imageportrait-01c37b55.webp'),
  portraitPlaceholder: require('../../../assets/art/characterplaceholder-f423be8b.webp'),
  portraitIcon: require('../../../assets/art/charportraiticonbbox-fa427673.webp'),

  // Bio
  bioDivider: require('../../../assets/art/biodiv-7ea88e9b.webp'),
  badgeFrame: require('../../../assets/art/untitled-79054e40.webp'),
  communityIcon: require('../../../assets/art/untitled-e095b21d.webp'),
  ancestryIcon: require('../../../assets/art/untitled-64af80a0.webp'),
  subclassIcon: require('../../../assets/art/untitled-b8358a3f.webp'),
  levelBanner: require('../../../assets/art/untitled-3806c8f6.webp'),
  levelCrown: require('../../../assets/art/lvlcrown-32ac6693.webp'),

  // Armor panel
  armorPanel: require('../../../assets/art/armorpanel-1cd2c3c8.webp'),
  armorIcon: require('../../../assets/art/armoricon-505cc4af.webp'),
  armorDepleted: require('../../../assets/art/depletedarmor-73342e7c.webp'),
  armorLocked: require('../../../assets/art/lockedarmor-337e5d6d.webp'),

  // Heart / HP panel
  heartPanel: require('../../../assets/art/heartpanel-f1a8fd4a.webp'),
  heart: require('../../../assets/art/hearticon-d642a5ef.webp'),
  heartDepleted: require('../../../assets/art/depletedheart-94cb1838.webp'),
  hpSlash: require('../../../assets/art/hpslash-28a3c09a.webp'),
  heartBreakIcon: require('../../../assets/art/untitled-d3ce8259.webp'),

  // Hope / Stress panel
  hopeStressPanel: require('../../../assets/art/hopestresspanel-6f9c68a0.webp'),
  hopeTitleIcon: require('../../../assets/art/r-hoicon-5f6bb94d.webp'),
  stressTitleIcon: require('../../../assets/art/r-sticon-830cacf4.webp'),
  hope: require('../../../assets/art/hopeicon1-56195480.webp'),
  hopeDepleted: require('../../../assets/art/depletedhope-14964132.webp'),
  stress: require('../../../assets/art/stressicon-abcbc964.webp'),
  stressDepleted: require('../../../assets/art/depletedstress-7464fbf0.webp'),
  stressLocked: require('../../../assets/art/lockedstress-b16689dc.webp'),

  // Trait banners
  traitBanner: require('../../../assets/art/traitbanner-862bd075.webp'),
  traitAgility: require('../../../assets/art/untitled-8e4ecad8.webp'),
  traitStrength: require('../../../assets/art/untitled-8bace08b.webp'),
  traitFinesse: require('../../../assets/art/untitled-fbe32813.webp'),
  traitInstinct: require('../../../assets/art/untitled-344ef720.webp'),
  traitPresence: require('../../../assets/art/untitled-9992977e.webp'),
  traitKnowledge: require('../../../assets/art/untitled-532b2861.webp'),
} as const;

export type ArtKey = keyof typeof Art;
