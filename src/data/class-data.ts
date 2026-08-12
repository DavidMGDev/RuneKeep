import { type ClassName } from '@/constants/identity';
import { type TraitKey } from '@/features/character-sheet/character';

/**
 * Class data extracted from the Daggerheart Core Rulebook, Chapter 1 (PDF pages 28–52) via
 * scripts text extraction — NOT image-guessed. Stats cross-checked against the SRD:
 * bard 10/5, druid 10/6, guardian 9/7, ranger 12/6, rogue 12/6, seraph 9/7, sorcerer 10/6,
 * warrior 11/6, wizard 11/5. Feature/hope texts are the book's wording (lightly reflowed);
 * summaries are RuneKeep copy grounded in each class intro.
 */

export interface ClassFeature {
  name: string;
  text: string;
}

export interface ClassData {
  startingEvasion: number;
  startingHp: number;
  classItems: string;
  hopeFeature: ClassFeature;
  features: ClassFeature[];
  /** Card-voiced summary for the class pick card (from the book intro). */
  summary: string;
}

export const CLASS_DATA: Record<ClassName, ClassData> = {
  bard: {
    startingEvasion: 10,
    startingHp: 5,
    classItems: 'A romance novel or a letter never opened',
    hopeFeature: {
      name: 'Make a Scene',
      text: 'Spend 3 Hope to temporarily Distract a target within Close range, giving them a −2 penalty to their Difficulty.',
    },
    features: [
      {
        name: 'Rally',
        text: 'Once per session, describe how you rally the party and give yourself and each of your allies a Rally Die. At level 1, your Rally Die is a d6. A PC can spend their Rally Die to roll it, adding the result to their action roll, reaction roll, damage roll, or to clear a number of Stress equal to the result. At the end of each session, clear all unspent Rally Dice. At level 5, your Rally Die increases to a d8.',
      },
    ],
    summary: 'The most charismatic people in all the realms, masters of captivation who thrive in any social situation. A bard can bring a party together, or, in ill temper, tear one apart just as easily.',
  },
  druid: {
    startingEvasion: 10,
    startingHp: 6,
    classItems: 'A small bag of rocks and bones or a strange pendant found in the dirt',
    hopeFeature: {
      name: 'Evolution',
      text: 'Spend 3 Hope to transform into a Beastform without marking a Stress. When you do, choose one trait to raise by +1 until you drop out of that Beastform.',
    },
    features: [
      {
        name: 'Beastform',
        text: 'Mark a Stress to magically transform into a creature of your tier or lower from the Beastform list. You can drop out of this form at any time. While transformed, you can’t use weapons or cast spells from domain cards, but you can still use other features or abilities you have access to. Spells you cast before you transform stay active and last for their normal duration, and you can talk and communicate as normal. Additionally, you gain the Beastform’s features, add their Evasion bonus to your Evasion, and use the trait specified in their statistics for your attack. While you’re in a Beastform, your armor becomes part of your body and you mark Armor Slots as usual; when you drop out of a Beastform, those marked Armor Slots remain marked. If you mark your last Hit Point, you automatically drop out of this form.',
      },
      {
        name: 'Wildtouch',
        text: 'You can perform harmless, subtle effects that involve nature, such as causing a flower to rapidly grow, summoning a slight gust of wind, or starting a campfire, at will.',
      },
    ],
    summary: 'A calling, not an occupation: protectors who learn from the magic of the wilderness itself. Gentle cultivators at rest, and terrifying to behold when they channel the untamed forces of nature.',
  },
  guardian: {
    startingEvasion: 9,
    startingHp: 7,
    classItems: 'A totem from your mentor or a secret key',
    hopeFeature: {
      name: 'Frontline Tank',
      text: 'Spend 3 Hope to clear 2 Armor Slots.',
    },
    features: [
      {
        name: 'Unstoppable',
        text: 'Once per long rest, you can become Unstoppable. You gain an Unstoppable Die. At level 1, your Unstoppable Die is a d4. Place it on your character sheet, starting with the 1 value facing up. After you make a damage roll that deals 1 or more Hit Points to a target, increase the Unstoppable Die value by one. When the die’s value would exceed its maximum value or when the scene ends, remove the die and drop out of Unstoppable. At level 5, your Unstoppable Die increases to a d6. While Unstoppable: you reduce the severity of physical damage by one threshold; you add the current value of the Unstoppable Die to your damage roll; and you can’t be Restrained or Vulnerable.',
      },
    ],
    summary: 'Fortitude with a moral compass. Guardians fight with remarkable ferocity against overwhelming odds, defending the few they truly care for above all else, and answering every injury in kind.',
  },
  ranger: {
    startingEvasion: 12,
    startingHp: 6,
    classItems: 'A trophy from your first kill or a seemingly broken compass',
    hopeFeature: {
      name: 'Hold Them Off',
      text: 'Spend 3 Hope when you succeed on an attack with a weapon to use that same roll against two additional adversaries within range of the attack.',
    },
    features: [
      {
        name: 'Ranger’s Focus',
        text: 'Spend a Hope and make an attack against a target. On a success, deal your attack’s normal damage and temporarily make the attack’s target your Focus. Until this feature ends or you make a different creature your Focus, you gain the following benefits against your Focus: you know precisely what direction they are in; when you deal damage to them, they must mark a Stress; and when you fail an attack against them, you can end your Ranger’s Focus feature to reroll your Duality Dice.',
      },
    ],
    summary: 'Sly tacticians of the wilds, hunting with cunning and patience rather than armies. Expert trackers, as likely to ensnare their quarry in a trap as to assail it head-on, often beside a bonded companion.',
  },
  rogue: {
    startingEvasion: 12,
    startingHp: 6,
    classItems: 'A set of forgery tools or a grappling hook',
    hopeFeature: {
      name: 'Rogue’s Dodge',
      text: 'Spend 3 Hope to gain a +2 bonus to your Evasion until the next time an attack succeeds against you. Otherwise, this bonus lasts until your next rest.',
    },
    features: [
      {
        name: 'Cloaked',
        text: 'Any time you would be Hidden, you are instead Cloaked. In addition to the benefits of the Hidden condition, while Cloaked you remain unseen if you are stationary when an adversary moves to where they would normally see you. After you make an attack or end a move within line of sight of an adversary, you are no longer Cloaked.',
      },
      {
        name: 'Sneak Attack',
        text: 'When you succeed on an attack while Cloaked or while an ally is within Melee range of your target, add a number of d6s equal to your tier to your damage roll. Level 1 → Tier 1; levels 2–4 → Tier 2; levels 5–7 → Tier 3; levels 8–10 → Tier 4.',
      },
    ],
    summary: 'Scoundrels in attitude and practice, moving through the world anonymously. Sharp wits and sharper blades: social manipulation, broken locks, shadows bent into useful and deadly tools.',
  },
  seraph: {
    startingEvasion: 9,
    startingHp: 7,
    classItems: 'A bundle of offerings or a sigil of your god',
    hopeFeature: {
      name: 'Life Support',
      text: 'Spend 3 Hope to clear a Hit Point on an ally within Close range.',
    },
    features: [
      {
        name: 'Prayer Dice',
        text: 'At the beginning of each session, roll a number of d4s equal to your subclass’s Spellcast trait and place them on your character sheet. These are your Prayer Dice. You can spend any number of Prayer Dice to aid yourself or an ally within Far range. You can use a spent die’s value to reduce incoming damage, add to a roll’s result after the roll is made, or gain Hope equal to the result. At the end of each session, clear all unspent Prayer Dice.',
      },
    ],
    summary: 'Divine fighters and healers imbued with sacred purpose, appointed by the realms’ many gods. Better to stand beside a seraph than against one, they are terrifying foes to those who defy their purpose.',
  },
  sorcerer: {
    startingEvasion: 10,
    startingHp: 6,
    classItems: 'A whispering orb or a family heirloom',
    hopeFeature: {
      name: 'Volatile Magic',
      text: 'Spend 3 Hope to reroll any number of your damage dice on an attack that deals magic damage.',
    },
    features: [
      {
        name: 'Arcane Sense',
        text: 'You can sense the presence of magical people and objects within Close range.',
      },
      {
        name: 'Minor Illusion',
        text: 'Make a Spellcast Roll (10). On a success, you create a minor visual illusion no larger than yourself within Close range. This illusion is convincing to anyone at Close range or farther.',
      },
      {
        name: 'Channel Raw Power',
        text: 'Once per long rest, you can place a domain card from your loadout into your vault and choose to either: gain Hope equal to the level of the card, or enhance a spell that deals damage, gaining a bonus to your damage roll equal to twice the level of the card.',
      },
    ],
    summary: 'Innate magic, inherited and honed. Becoming formidable is not acquiring power but learning to control the power already in your blood, undisciplined, that same gift is a dangerous force indeed.',
  },
  warrior: {
    startingEvasion: 11,
    startingHp: 6,
    classItems: 'The drawing of a lover or a sharpening stone',
    hopeFeature: {
      name: 'No Mercy',
      text: 'Spend 3 Hope to gain a +1 bonus to your attack rolls until your next rest.',
    },
    features: [
      {
        name: 'Attack of Opportunity',
        text: 'If an adversary within Melee range attempts to leave that range, make a reaction roll using a trait of your choice against their Difficulty. Choose one effect on a success, or two if you critically succeed: they can’t move from where they are; you deal damage to them equal to your primary weapon’s damage; or you move with them.',
      },
      {
        name: 'Combat Training',
        text: 'You ignore burden when equipping weapons. When you deal physical damage, you gain a bonus to your damage roll equal to your level.',
      },
    ],
    summary: 'A lifetime devoted to the mastery of weapons and violence, agile in body and mind, the most sought-after fighters across the realms. To come between a warrior and their blade is a grievous mistake.',
  },
  wizard: {
    startingEvasion: 11,
    startingHp: 5,
    classItems: 'A book you’re trying to translate or a tiny, harmless elemental pet',
    hopeFeature: {
      name: 'Not This Time',
      text: 'Spend 3 Hope to force an adversary within Far range to reroll an attack or damage roll.',
    },
    features: [
      {
        name: 'Prestidigitation',
        text: 'You can perform harmless, subtle magical effects at will. For example, you can change an object’s color, create a smell, light a candle, cause a tiny object to float, illuminate a room, or repair a small object.',
      },
      {
        name: 'Strange Patterns',
        text: 'Choose a number between 1 and 12. When you roll that number on a Duality Die, gain a Hope or clear a Stress. You can change this number when you take a long rest.',
      },
    ],
    summary: 'Immense magical power acquired over years of learning, books, stones, potions, herbs. Advisors, healers, war-council minds; and no ranks quarrel harder over powerful secrets than their own.',
  },
  assassin: {
    startingEvasion: 12,
    startingHp: 5,
    classItems: 'A list of names with several marked off or a rusted blade inscribed with an insignia',
    hopeFeature: {
      name: 'Deadly Determination',
      text: 'Spend 3 Hope to clear 2 Stress.',
    },
    features: [
      {
        name: 'Marked for Death',
        text: 'On a successful weapon attack, you can mark a Stress to make the target Marked for Death. Attacks you make against a target that’s Marked for Death gain a bonus to damage equal to +1d4 per tier. You can only have one adversary Marked for Death at a time, and can’t transfer or remove the condition except by defeating the target. The GM can spend a number of Fear equal to your tier to remove the Marked for Death condition. Otherwise, it ends automatically when you take a rest.',
      },
      {
        name: 'Get In & Get Out',
        text: 'Spend a Hope to ask the GM for either a quick or inconspicuous way into or out of a building or structure you can see. The next roll you make that capitalizes on this information has advantage.',
      },
    ],
    summary: 'Unmatched stealth and lethal precision, striking from the dark before a target ever senses the threat. An assassin marks their quarry, waits for the opening, and ends the fight in a single breath.',
  },
  witch: {
    startingEvasion: 10,
    startingHp: 6,
    classItems: 'A small, harmless pet or a scrying stone',
    hopeFeature: {
      name: 'Witch’s Charm',
      text: 'When you or an ally within Far range rolls a failure on an action roll, you can spend 3 Hope to change it into a success with Fear instead.',
    },
    features: [
      {
        name: 'Hex',
        text: 'Mark a Stress to temporarily Hex a target within Far range. While Hexed, the target gains a penalty to their damage rolls and Difficulty equal to your tier. The maximum number of creatures you can Hex at one time is equal to your Spellcast trait.',
      },
      {
        name: 'Commune',
        text: 'Once per long rest, during a moment of calm, you can commune with an ancestor, deity, nature spirit, or otherworldly being. Ask them a question, then roll a number of d6s equal to your Spellcast trait. Choose one value from the rolled results and reference the chart below for the effect: 1-3: You taste a flavor, smell a scent, or feel a sensation relevant to the answer. 4-5: You hear sounds or see a vision relevant to the answer. 6: You psychically experience a scene relevant to the answer as if you were there.',
      },
    ],
    summary: 'Weavers of earth, sky, and spirit, crafting protective charms for those they love and grim hexes for those they don’t. Cross a witch and their curse rides you until the scene runs cold.',
  },
  warlock: {
    startingEvasion: 11,
    startingHp: 5,
    classItems: 'A carving that symbolizes your patron or a ring you can’t remove',
    hopeFeature: {
      name: 'Patron’s Boon',
      text: 'When you fail a roll, you can spend 3 Hope to reroll with advantage.',
    },
    features: [
      {
        name: 'Warlock Patron',
        text: 'You have committed yourself to a patron supernatural entity, such as a god, fae, or demon, in exchange for power. Write their name on your character sheet, then work with your GM to determine their sphere of influence (such as Nature, Chaos, Wisdom, Mischief, Love, War, Justice, or Death). Before making an action roll that relates to one of your patron’s spheres of influence, you can spend a Favor to call on their aid, rolling your Patron Die and adding its result to the total. Your Patron Die starts at a d6 and increases to a d8 at level 5.',
      },
      {
        name: 'Favor',
        text: 'Start with 3 Favor. During a rest, spend one of your downtime moves to show tribute to your patron. Describe how and gain Favor equal to your Spellcast trait. Additionally, when you succeed on an action roll with Hope, you can choose to gain a Favor instead of a Hope.',
      },
    ],
    summary: 'A life pledged to a patron, god, demon, or fae, in exchange for borrowed power. The warlock trades tithes and favor for might, and every gift carries the weight of the bargain that bought it.',
  },
  bloodhunter: {
    startingEvasion: 11,
    startingHp: 6,
    classItems: 'A steel needle or a vial holding a foe’s blood',
    hopeFeature: {
      name: 'Blood Maledict',
      text: 'Spend 3 Hope when an adversary succeeds on an attack roll within Close range to make them reroll with disadvantage.',
    },
    features: [
      {
        name: 'Crimson Rite',
        text: 'Mark a Hit Point to enchant one of your active weapons with bloodthirsty power until the end of your next rest or you use this feature again. When you succeed on an attack with the enchanted weapon, it deals an extra 1d4 magic damage. This extra damage increases to 2d4 at level 2, 3d4 at level 5, and 4d4 at level 8.',
      },
      {
        name: 'Grim Psychometry',
        text: 'Make a Spellcast Roll (12) to inspect a location within Very Close range. On a success, you have a vision of the last creature that committed violence there. Until you take a long rest or use this feature again, you have advantage on action rolls to track them or recall information about them.',
      },
    ],
    summary: 'Hunters who turn their own blood into a weapon, wielding forbidden hemocraft in a relentless pursuit of evil. A blood hunter pays for every rite in Hit Points, spilling their life to see monsters dead.',
  },
  summoner: {
    startingEvasion: 10,
    startingHp: 6,
    classItems: 'A harmless spirit trapped inside a glass bottle or a pair of mysterious coins',
    hopeFeature: {
      name: 'Aid of the Spirits',
      text: 'Spend 3 Hope to conjure otherworldly aid. Distribute 2 Hope among one or more other PCs within Far range, and you clear a Stress.',
    },
    features: [
      {
        name: 'Summon Entity',
        text: 'You can summon otherworldly Entities: Fate Spirits and other Entities from your subclass. Each Entity is associated with a summoning circle below. Mark a Stress to summon a number of your Entities equal to your tier, and add them to the appropriate circles. You can hold a total number of Entities equal to your level. Summoned Entities stay within Very Close range, can perform harmless tasks within that range, and cannot be targeted. If a task requires an action roll, make a Spellcast Roll to command the Entity.',
      },
      {
        name: 'First Circle. Fate Spirit',
        text: 'After an adversary within Very Close range makes a successful attack roll, you can command a Fate Spirit to force the adversary to reroll the attack. The spirit then disappears.',
      },
    ],
    summary: 'Occult adepts who call forth otherworldly Entities to act on their behalf, fate spirits, angels, the risen dead. A summoner rarely fights alone; the air around them is crowded with called things.',
  },
  brawler: {
    startingEvasion: 10,
    startingHp: 6,
    classItems: 'Hand wraps from a mentor or a book about your secret hobby',
    hopeFeature: {
      name: 'Square Up',
      text: 'Spend 3 Hope to intimidate a target within Close range, making them temporarily Vulnerable.',
    },
    features: [
      {
        name: 'I Am the Weapon',
        text: 'Your barehanded attacks are as strong as any blade. You have a primary weapon called Brawler’s Strike equipped while you have no other Active Weapons. It uses a trait of your choice, has Melee range, and deals d8+d6 physical damage using your Proficiency (both the d8 and the d6 scale off your Proficiency). While this weapon is active, you gain a +1 bonus to your Evasion.',
      },
      {
        name: 'Combo Strike',
        text: 'After rolling damage on a successful attack with a Melee weapon, you can mark a Stress to start a combo strike. When you do, roll your Combo Die and note the result, then continue rolling your Combo Die until the result of your latest roll is lower than the roll that preceded it. You deal extra damage equal to the total of all rolled Combo Die results on this attack. The results can’t be modified by any means. Your Combo Die starts as a d4. Once per tier, you can increase your Combo Die by one step as a level advancement option.',
      },
    ],
    summary: 'Fighters who need no blade, a brawler’s fists are weapon enough, chaining blow into blow until the threat stops moving. Take away their armaments and they only grow more dangerous.',
  },
};

/**
 * v0.21.0 (item 5): the Spellcast trait each SUBCLASS casts with, keyed by the catalog subclass SLUG.
 * Both subclasses of a spellcasting class share that class's trait; martial subclasses (Guardian, Warrior,
 * Brawler, and non-casting others) are simply absent → treated as "no Spellcast trait".
 *
 * This drives (a) the `spellcast` modifier variable — Mage Robes' "Enchanted" adds your Spellcast trait to
 * your damage thresholds no matter the subclass — and (b) the creation-screen hint that warns when your +2
 * trait isn't your Spellcast trait. Base-game values are the SRD's; the Hope-and-Fear rows are transcribed
 * from HOPEANDFEAR_Classes.pdf.
 */
export const SUBCLASS_SPELLCAST: Record<string, TraitKey> = {
  // Bard → Presence
  troubadour: 'presence', wordsmith: 'presence',
  // Druid → Instinct
  'warden-of-renewal': 'instinct', 'warden-of-the-elements': 'instinct',
  // Ranger → Agility
  beastbound: 'agility', wayfinder: 'agility',
  // Rogue → Finesse
  nightwalker: 'finesse', syndicate: 'finesse',
  // Seraph → Strength
  'divine-wielder': 'strength', 'winged-sentinel': 'strength',
  // Sorcerer → Instinct
  'elemental-origin': 'instinct', 'primal-origin': 'instinct',
  // Wizard → Knowledge
  'school-of-knowledge': 'knowledge', 'school-of-war': 'knowledge',
  // — Hope and Fear (transcribed from HOPEANDFEAR_Classes.pdf) —
  // Assassin: each subclass casts with a different trait
  'executioners-guild': 'agility', 'poisoners-guild': 'knowledge',
  // Witch: Hedge → Knowledge, Moon → Instinct
  hedge: 'knowledge', moon: 'instinct',
  // Warlock → Presence (both pacts)
  'pact-of-the-endless': 'presence', 'pact-of-the-wrathful': 'presence',
  // Summoner → Knowledge (not in the Classes PDF preview; best-known values)
  necromancy: 'knowledge', theurgy: 'knowledge',
  // Blood Hunter → Knowledge (not in the Classes PDF preview; best-known values)
  'order-of-the-lycan': 'knowledge', 'order-of-the-mutant': 'knowledge', 'order-of-the-specter': 'knowledge',
  // Brawler (juggernaut / martial-artist) — martial, no Spellcast trait.
};

/** The Spellcast trait for a subclass slug, or null when the subclass doesn't cast. */
export function spellcastTraitForSubclass(subclassSlug: string | undefined | null): TraitKey | null {
  return (subclassSlug && SUBCLASS_SPELLCAST[subclassSlug]) || null;
}

/** A feature card "page": which sections of a class's rules land on one printed card. */
export interface FeaturePage {
  pageIndex: number;
  pageCount: number;
  sections: ClassFeature[];
}

/**
 * ONE FEATURE PER PAGE, always (v0.42.0, owner).
 *
 * Until now a class's rules were PACKED into cards by a line budget, and a feature longer than the
 * budget was cut into "Beastform", "Beastform (cont.)", "Beastform (cont.)"... The druid ran to eight
 * cards, six of them one ability sliced up. The owner's rule is the opposite one: "entire abilities
 * per page", and at most three or four cards for a whole class.
 *
 * Both fall out of the same change. Every class in the app has at most FOUR features counting its
 * hope feature, so a page per feature lands every one of them at two to four pages with the book's
 * wording untouched. What made packing necessary was the card body being drawn at a fixed size and
 * clipped; the body is typeset to fit now (see `ForgedTextCard`), so a long feature is set smaller
 * rather than continued.
 *
 * The hope feature is last because it is the class's 3-Hope move and reads as the pay-off, which is
 * where the printed cards put it too.
 */
export function featurePages(cls: ClassName): FeaturePage[] {
  const data = CLASS_DATA[cls];
  const units: ClassFeature[] = [
    ...data.features,
    { name: `${data.hopeFeature.name}, Hope Feature`, text: data.hopeFeature.text },
  ];
  return units.map((u, i) => ({ pageIndex: i, pageCount: units.length, sections: [u] }));
}

