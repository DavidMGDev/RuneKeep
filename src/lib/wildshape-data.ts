/**
 * Druid Wild Shape (Beastform) data (#214) — every Beastform across Tiers 1-4, transcribed from the
 * Daggerheart core rulebook (Druid, pp. 31-36; tier/level table p. 110). Each form is a card in the
 * Druid-only Wild Shape carousel category: enabling it layers its stat changes (trait / Evasion /
 * damage-threshold deltas) through the modifier engine and costs the Stress the rules require. The
 * trait/Evasion/threshold numbers are computed; the attack line and features are card-body text.
 *
 * GENERATED from _pdfwork/wildshape.json by gen_wildshape.py — edit the source + regenerate.
 */

import type { CardEffect } from './modifiers';

export interface Wildshape {
  id: string;
  name: string;
  /** Daggerheart tier (1-4); you may take a form of your tier or lower. */
  tier: 1 | 2 | 3 | 4;
  /** Minimum character level the form's tier unlocks at (1 / 2 / 5 / 8). */
  levelReq: number;
  /** A distinct card color per form, for at-a-glance recognition in the carousel. */
  color: string;
  /** Stress marked to assume this form (most cost 1; the Hybrid forms cost 2-3). */
  stress: number;
  /** Attack line (trait | damage | range) — informational card text. */
  attack: string;
  /** Example creatures. */
  examples: string;
  /** Features / advantages text shown on the card body. */
  features: string;
  /** Stat changes applied through the modifier engine while transformed. */
  effects: CardEffect[];
}

export const WILDSHAPES: Wildshape[] = [
  { id: 'ws-agile-scout', name: 'Agile Scout', tier: 1, levelReq: 1, color: '#E8A030', stress: 1, attack: 'Agility · d4 phy · Melee', examples: 'Fox, Mouse, Weasel', features: 'Agile: Your movement is silent; spend a Hope to move up to Far range without rolling. Fragile: drop out of Beastform when you take Major or greater damage. Advantages: deceive, locate, sneak.', effects: [{ target: 'agility', delta: 1 }, { target: 'evasion', delta: 2 }] },
  { id: 'ws-household-friend', name: 'Household Friend', tier: 1, levelReq: 1, color: '#C8A87A', stress: 1, attack: 'Instinct · d6 phy · Melee', examples: 'Cat, Dog, Rabbit', features: 'Companion: When you Help an Ally, roll a d8 as your advantage die. Fragile: drop out on Major+ damage. Advantages: climb, locate, protect.', effects: [{ target: 'instinct', delta: 1 }, { target: 'evasion', delta: 2 }] },
  { id: 'ws-nimble-grazer', name: 'Nimble Grazer', tier: 1, levelReq: 1, color: '#88B86A', stress: 1, attack: 'Agility · d6 phy · Melee', examples: 'Deer, Gazelle, Goat', features: 'Elusive Prey: When an attack would succeed, mark a Stress and roll a d4; add it to your Evasion vs that attack. Fragile: drop out on Major+ damage. Advantages: leap, sneak, sprint.', effects: [{ target: 'agility', delta: 1 }, { target: 'evasion', delta: 3 }] },
  { id: 'ws-pack-predator', name: 'Pack Predator', tier: 1, levelReq: 1, color: '#7A6A5A', stress: 1, attack: 'Strength · d8+2 phy · Melee', examples: 'Coyote, Hyena, Wolf', features: 'Hobbling Strike: on a Melee hit, mark a Stress to make the target temporarily Vulnerable. Pack Hunting: hit the same target as an ally who acted just before you → add a d8 to damage. Advantages: attack, sprint, track.', effects: [{ target: 'strength', delta: 2 }, { target: 'evasion', delta: 1 }] },
  { id: 'ws-aquatic-scout', name: 'Aquatic Scout', tier: 1, levelReq: 1, color: '#4A90D9', stress: 1, attack: 'Agility · d4 phy · Melee', examples: 'Eel, Fish, Octopus', features: 'Aquatic: breathe and move naturally underwater. Fragile: drop out on Major+ damage. Advantages: navigate, sneak, swim.', effects: [{ target: 'agility', delta: 1 }, { target: 'evasion', delta: 2 }] },
  { id: 'ws-stalking-arachnid', name: 'Stalking Arachnid', tier: 1, levelReq: 1, color: '#2D2D2D', stress: 1, attack: 'Finesse · d6+1 phy · Melee', examples: 'Tarantula, Wolf Spider', features: 'Venomous Bite: on a Melee hit, target becomes temporarily Poisoned (1d10 direct phys each time they act). Webslinger: Restrain a target within Close range with a Finesse Roll. Advantages: attack, climb, sneak.', effects: [{ target: 'finesse', delta: 1 }, { target: 'evasion', delta: 2 }] },
  { id: 'ws-armored-sentry', name: 'Armored Sentry', tier: 2, levelReq: 2, color: '#8B7355', stress: 1, attack: 'Strength · d8+2 phy · Melee', examples: 'Armadillo, Pangolin, Turtle', features: 'Armored Shell: resistance to physical damage; mark an Armor Slot to retract (reduce phys damage by your Armor Score, no other actions). Cannonball: mark a Stress to be launched by an ally (d12+2 phys, thrower\'s Proficiency). Advantages: dig, locate, protect.', effects: [{ target: 'strength', delta: 1 }, { target: 'evasion', delta: 1 }] },
  { id: 'ws-powerful-beast', name: 'Powerful Beast', tier: 2, levelReq: 2, color: '#8B5A2B', stress: 1, attack: 'Strength · d10+4 phy · Melee', examples: 'Bear, Bull, Moose', features: 'Rampage: roll a 1 on a damage die → roll a d10 and add it; before an attack, mark a Stress for +1 Proficiency. Thick Hide: +2 to damage thresholds. Advantages: navigate, protect, scare.', effects: [{ target: 'strength', delta: 1 }, { target: 'evasion', delta: 3 }, { target: 'majorThreshold', delta: 2 }, { target: 'severeThreshold', delta: 2 }] },
  { id: 'ws-mighty-strider', name: 'Mighty Strider', tier: 2, levelReq: 2, color: '#C8A430', stress: 1, attack: 'Agility · d8+1 phy · Melee', examples: 'Camel, Horse, Zebra', features: 'Carrier: carry up to two willing allies. Trample: mark a Stress to move Close in a line and hit all in Melee of it (d8+1 phys, temporarily Vulnerable). Advantages: leap, navigate, sprint.', effects: [{ target: 'agility', delta: 1 }, { target: 'evasion', delta: 2 }] },
  { id: 'ws-striking-serpent', name: 'Striking Serpent', tier: 2, levelReq: 2, color: '#5A8A3A', stress: 1, attack: 'Finesse · d8+4 phy · Very Close', examples: 'Cobra, Rattlesnake, Viper', features: 'Venomous Strike: attack any number of targets in Very Close; on a hit they\'re temporarily Poisoned (1d10 direct phys each act). Warning Hiss: mark a Stress to push Melee targets back to Very Close. Advantages: climb, deceive, sprint.', effects: [{ target: 'finesse', delta: 1 }, { target: 'evasion', delta: 2 }] },
  { id: 'ws-pouncing-predator', name: 'Pouncing Predator', tier: 2, levelReq: 2, color: '#C88020', stress: 1, attack: 'Instinct · d8+6 phy · Melee', examples: 'Cheetah, Lion, Panther', features: 'Fleet: spend a Hope to move up to Far without rolling. Takedown: mark a Stress to close to Melee and attack; on a hit +2 Proficiency and the target marks a Stress. Advantages: attack, climb, sneak.', effects: [{ target: 'instinct', delta: 1 }, { target: 'evasion', delta: 3 }] },
  { id: 'ws-winged-beast', name: 'Winged Beast', tier: 2, levelReq: 2, color: '#5A7A9A', stress: 1, attack: 'Finesse · d4+2 phy · Melee', examples: 'Hawk, Owl, Raven', features: 'Bird\'s-Eye View: fly at will; once per rest while airborne ask the GM a question about the scene below (first action on it gains advantage). Hollow Bones: −2 to damage thresholds. Advantages: deceive, locate, scare.', effects: [{ target: 'finesse', delta: 1 }, { target: 'evasion', delta: 3 }, { target: 'majorThreshold', delta: -2 }, { target: 'severeThreshold', delta: -2 }] },
  { id: 'ws-great-predator', name: 'Great Predator', tier: 3, levelReq: 5, color: '#6A3A2A', stress: 1, attack: 'Strength · d12+8 phy · Melee', examples: 'Dire Wolf, Velociraptor, Sabertooth', features: 'Carrier: carry up to two willing allies. Vicious Maul: on a hit spend a Hope to make the target temporarily Vulnerable and gain +1 Proficiency. Advantages: attack, sneak, sprint.', effects: [{ target: 'strength', delta: 2 }, { target: 'evasion', delta: 2 }] },
  { id: 'ws-mighty-lizard', name: 'Mighty Lizard', tier: 3, levelReq: 5, color: '#4A6A3A', stress: 1, attack: 'Instinct · d10+7 phy · Melee', examples: 'Alligator, Crocodile, Gila Monster', features: 'Physical Defense: +3 to damage thresholds. Snapping Strike: on a Melee hit spend a Hope to clamp the target (temporarily Restrained and Vulnerable). Advantages: attack, sneak, track.', effects: [{ target: 'instinct', delta: 2 }, { target: 'evasion', delta: 1 }, { target: 'majorThreshold', delta: 3 }, { target: 'severeThreshold', delta: 3 }] },
  { id: 'ws-great-winged-beast', name: 'Great Winged Beast', tier: 3, levelReq: 5, color: '#8A9A3A', stress: 1, attack: 'Finesse · d8+6 phy · Melee', examples: 'Giant Eagle, Falcon', features: 'Bird\'s-Eye View: fly at will; once per rest while airborne ask the GM a question (first action on it gains advantage). Carrier: carry up to two willing allies. Advantages: deceive, distract, locate.', effects: [{ target: 'finesse', delta: 2 }, { target: 'evasion', delta: 3 }] },
  { id: 'ws-aquatic-predator', name: 'Aquatic Predator', tier: 3, levelReq: 5, color: '#1A5A8A', stress: 1, attack: 'Agility · d10+6 phy · Melee', examples: 'Dolphin, Orca, Shark', features: 'Aquatic: breathe and move naturally underwater. Vicious Maul: on a hit spend a Hope to make the target Vulnerable and gain +1 Proficiency. Advantages: attack, swim, track.', effects: [{ target: 'agility', delta: 2 }, { target: 'evasion', delta: 4 }] },
  { id: 'ws-legendary-beast', name: 'Legendary Beast', tier: 3, levelReq: 5, color: '#9A7A4A', stress: 1, attack: 'Inherits the chosen Tier 1 form', examples: 'Upgraded Tier 1 form', features: 'Evolved: pick a Tier 1 Beastform and become a larger version. Retain its traits + features and gain +6 damage, +1 to that form\'s trait, +2 Evasion (the +2 is already counted here; apply the rest from your chosen base form). Advantages: inherits from the chosen Tier 1 form.', effects: [{ target: 'evasion', delta: 2 }] },
  { id: 'ws-legendary-hybrid', name: 'Legendary Hybrid', tier: 3, levelReq: 5, color: '#7A5A9A', stress: 2, attack: 'Strength · d10+8 phy · Melee', examples: 'Griffon, Sphinx', features: 'Hybrid Features: mark an additional Stress to transform (2 total). Choose any two Beastforms from Tiers 1–2; take 4 advantages and 2 features total from them. Advantages: chosen from your two picks.', effects: [{ target: 'strength', delta: 2 }, { target: 'evasion', delta: 3 }] },
  { id: 'ws-massive-behemoth', name: 'Massive Behemoth', tier: 4, levelReq: 8, color: '#6A5A4A', stress: 1, attack: 'Strength · d12+12 phy · Melee', examples: 'Elephant, Mammoth, Rhinoceros', features: 'Carrier: carry up to four willing allies. Demolish: spend a Hope to move Far in a line and hit all in Melee of it (d8+10 phys, temporarily Vulnerable). Undaunted: +2 to all damage thresholds. Advantages: locate, protect, scare, sprint.', effects: [{ target: 'strength', delta: 3 }, { target: 'evasion', delta: 1 }, { target: 'majorThreshold', delta: 2 }, { target: 'severeThreshold', delta: 2 }] },
  { id: 'ws-terrible-lizard', name: 'Terrible Lizard', tier: 4, levelReq: 8, color: '#5A3A2A', stress: 1, attack: 'Strength · d12+10 phy · Melee', examples: 'Brachiosaurus, Tyrannosaurus', features: 'Devastating Strikes: on Severe damage in Melee, mark a Stress to force the target to mark an extra Hit Point. Massive Stride: move up to Far without rolling; ignore rough terrain (GM\'s discretion). Advantages: attack, deceive, scare, track.', effects: [{ target: 'strength', delta: 3 }, { target: 'evasion', delta: 2 }] },
  { id: 'ws-mythic-aerial-hunter', name: 'Mythic Aerial Hunter', tier: 4, levelReq: 8, color: '#8A3A2A', stress: 1, attack: 'Finesse · d10+11 phy · Melee', examples: 'Dragon, Pterodactyl, Roc, Wyvern', features: 'Carrier: carry up to three willing allies. Deadly Raptor: fly at will and move up to Far as part of your action; dive into Melee from Close and attack to reroll all damage dice below your Proficiency. Advantages: attack, deceive, locate, navigate.', effects: [{ target: 'finesse', delta: 3 }, { target: 'evasion', delta: 4 }] },
  { id: 'ws-epic-aquatic-beast', name: 'Epic Aquatic Beast', tier: 4, levelReq: 8, color: '#1A3A6A', stress: 1, attack: 'Agility · d10+10 phy · Melee', examples: 'Giant Squid, Whale', features: 'Ocean Master: breathe + move underwater; on a Melee hit, temporarily Restrain the target. Unyielding: when you\'d mark an Armor Slot, roll a d6; on 5+ reduce severity by one threshold without marking it. Advantages: locate, protect, scare, track.', effects: [{ target: 'agility', delta: 3 }, { target: 'evasion', delta: 3 }] },
  { id: 'ws-mythic-beast', name: 'Mythic Beast', tier: 4, levelReq: 8, color: '#7A4A2A', stress: 1, attack: 'Inherits the chosen Tier 1–2 form', examples: 'Upgraded Tier 1–2 form', features: 'Evolved: pick a Tier 1 or 2 Beastform and become a larger version. Retain its traits + features and gain +9 damage, +2 to that form\'s trait, +3 Evasion, and step the damage die up one size (the +3 Evasion is already counted; apply the rest from your chosen base). Advantages: inherits from the chosen base form.', effects: [{ target: 'evasion', delta: 3 }] },
  { id: 'ws-mythic-hybrid', name: 'Mythic Hybrid', tier: 4, levelReq: 8, color: '#6A2A6A', stress: 3, attack: 'Strength · d12+10 phy · Melee', examples: 'Chimera, Cockatrice, Manticore', features: 'Hybrid Features: mark 2 additional Stress to transform (3 total). Choose any three Beastforms from Tiers 1–3; take 5 advantages and 3 features total from them. Advantages: chosen from your three picks.', effects: [{ target: 'strength', delta: 3 }, { target: 'evasion', delta: 2 }] },
];

const BY_ID = new Map(WILDSHAPES.map((w) => [w.id, w]));

export function wildshapeById(id: string): Wildshape | undefined {
  return BY_ID.get(id);
}

export function isWildshapeId(id: string): boolean {
  return BY_ID.has(id);
}

/** The name of the currently-assumed Beastform (first enabled Wild Shape card), or null. Used to
 *  override the displayed character name so the player always knows they're transformed (#214). */
export function activeWildshapeName(file: { enabledCardIds?: string[] }): string | null {
  for (const id of file.enabledCardIds ?? []) {
    const w = BY_ID.get(id);
    if (w) return w.name;
  }
  return null;
}

/**
 * Resolve the Stress (and, when Stress is full, HP) cost of ASSUMING a form (#214). Most cost 1
 * Stress; Hybrid forms cost 2-3. Stress that can't fit (track full) spills to HP — but never the
 * killing blow: at 1 HP with full Stress the lethal portion is skipped so transforming can't kill.
 */
export function applyWildshapeCost(
  state: { stressActive: number; stressUnlocked: number; hp: number },
  cost: number,
): { stressActive: number; hp: number } {
  let remaining = Math.max(0, cost);
  let stressActive = state.stressActive;
  const room = Math.max(0, state.stressUnlocked - stressActive);
  const addStress = Math.min(remaining, room);
  stressActive += addStress;
  remaining -= addStress;
  // Spill to HP, but never below 1 (the 1-HP / full-Stress no-kill rule).
  const hp = remaining > 0 ? Math.max(1, state.hp - remaining) : state.hp;
  return { stressActive, hp };
}
