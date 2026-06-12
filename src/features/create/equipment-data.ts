/**
 * Tier-1 weapons + armor, transcribed from the Daggerheart core rulebook tables (the owner placed
 * the table jpgs in assets/temp for reference; the rulebook PDF itself is gitignored and never
 * committed). Used to forge the weapon/armor cards in character creation (#121).
 *
 * These are IMMUTABLE cards (system-authored) — see the card-types memory: only user-authored
 * cards (experiences) are editable, and never in the sheet carousel.
 */

export type WeaponTrait = 'Strength' | 'Agility' | 'Finesse' | 'Instinct' | 'Presence' | 'Knowledge';
export type WeaponRange = 'Melee' | 'Very Close' | 'Close' | 'Far' | 'Very Far';
export type Burden = 'One-Handed' | 'Two-Handed';
export type DamageType = 'phy' | 'mag';
export type WeaponKind = 'physical' | 'magic';
export type WeaponSlot = 'primary' | 'secondary';

export interface WeaponDef {
  id: string;
  name: string;
  trait: WeaponTrait;
  range: WeaponRange;
  /** Damage die expression as printed, e.g. "d8+3" — the type is carried separately. */
  damage: string;
  damageType: DamageType;
  burden: Burden;
  kind: WeaponKind;
  slot: WeaponSlot;
  feature?: { name: string; text: string };
}

export interface ArmorDef {
  id: string;
  name: string;
  /** Base damage thresholds "major / severe", e.g. "7 / 15". */
  thresholds: string;
  baseScore: number;
  feature?: { name: string; text: string };
}

/** Tier-1 PRIMARY weapons (one chosen at creation): physical first, then magic (Spellcast trait). */
export const PRIMARY_WEAPONS: WeaponDef[] = [
  // --- physical ---
  { id: 'wpn-broadsword', name: 'Broadsword', trait: 'Agility', range: 'Melee', damage: 'd8', damageType: 'phy', burden: 'One-Handed', kind: 'physical', slot: 'primary', feature: { name: 'Reliable', text: '+1 to attack rolls.' } },
  { id: 'wpn-longsword', name: 'Longsword', trait: 'Agility', range: 'Melee', damage: 'd8+3', damageType: 'phy', burden: 'Two-Handed', kind: 'physical', slot: 'primary' },
  { id: 'wpn-battleaxe', name: 'Battleaxe', trait: 'Strength', range: 'Melee', damage: 'd10+3', damageType: 'phy', burden: 'Two-Handed', kind: 'physical', slot: 'primary' },
  { id: 'wpn-greatsword', name: 'Greatsword', trait: 'Strength', range: 'Melee', damage: 'd10+3', damageType: 'phy', burden: 'Two-Handed', kind: 'physical', slot: 'primary', feature: { name: 'Massive', text: '-1 to Evasion; on a successful attack, roll an additional damage die and discard the lowest result.' } },
  { id: 'wpn-mace', name: 'Mace', trait: 'Strength', range: 'Melee', damage: 'd8+1', damageType: 'phy', burden: 'One-Handed', kind: 'physical', slot: 'primary' },
  { id: 'wpn-warhammer', name: 'Warhammer', trait: 'Strength', range: 'Melee', damage: 'd12+3', damageType: 'phy', burden: 'Two-Handed', kind: 'physical', slot: 'primary', feature: { name: 'Heavy', text: '-1 to Evasion.' } },
  { id: 'wpn-dagger', name: 'Dagger', trait: 'Finesse', range: 'Melee', damage: 'd8+1', damageType: 'phy', burden: 'One-Handed', kind: 'physical', slot: 'primary' },
  { id: 'wpn-quarterstaff', name: 'Quarterstaff', trait: 'Instinct', range: 'Melee', damage: 'd10+3', damageType: 'phy', burden: 'Two-Handed', kind: 'physical', slot: 'primary' },
  { id: 'wpn-cutlass', name: 'Cutlass', trait: 'Presence', range: 'Melee', damage: 'd8+1', damageType: 'phy', burden: 'One-Handed', kind: 'physical', slot: 'primary' },
  { id: 'wpn-rapier', name: 'Rapier', trait: 'Presence', range: 'Melee', damage: 'd8', damageType: 'phy', burden: 'One-Handed', kind: 'physical', slot: 'primary', feature: { name: 'Quick', text: 'When you make an attack, you can mark a Stress to target another creature within range.' } },
  { id: 'wpn-halberd', name: 'Halberd', trait: 'Strength', range: 'Very Close', damage: 'd10+2', damageType: 'phy', burden: 'Two-Handed', kind: 'physical', slot: 'primary', feature: { name: 'Cumbersome', text: '-1 to Finesse.' } },
  { id: 'wpn-spear', name: 'Spear', trait: 'Finesse', range: 'Very Close', damage: 'd10+2', damageType: 'phy', burden: 'Two-Handed', kind: 'physical', slot: 'primary', feature: { name: 'Cumbersome', text: '-1 to Finesse.' } },
  { id: 'wpn-shortbow', name: 'Shortbow', trait: 'Agility', range: 'Far', damage: 'd6+3', damageType: 'phy', burden: 'One-Handed', kind: 'physical', slot: 'primary' },
  { id: 'wpn-crossbow', name: 'Crossbow', trait: 'Finesse', range: 'Far', damage: 'd6+1', damageType: 'phy', burden: 'One-Handed', kind: 'physical', slot: 'primary' },
  { id: 'wpn-longbow', name: 'Longbow', trait: 'Agility', range: 'Very Far', damage: 'd8+3', damageType: 'phy', burden: 'Two-Handed', kind: 'physical', slot: 'primary', feature: { name: 'Cumbersome', text: '-1 to Finesse.' } },
  // --- magic (require a Spellcast trait) ---
  { id: 'wpn-arcane-gauntlets', name: 'Arcane Gauntlets', trait: 'Strength', range: 'Melee', damage: 'd10+3', damageType: 'mag', burden: 'Two-Handed', kind: 'magic', slot: 'primary' },
  { id: 'wpn-hallowed-axe', name: 'Hallowed Axe', trait: 'Strength', range: 'Melee', damage: 'd8+1', damageType: 'mag', burden: 'One-Handed', kind: 'magic', slot: 'primary' },
  { id: 'wpn-glowing-rings', name: 'Glowing Rings', trait: 'Agility', range: 'Very Close', damage: 'd10+1', damageType: 'mag', burden: 'One-Handed', kind: 'magic', slot: 'primary' },
  { id: 'wpn-hand-runes', name: 'Hand Runes', trait: 'Instinct', range: 'Very Close', damage: 'd10', damageType: 'mag', burden: 'One-Handed', kind: 'magic', slot: 'primary' },
  { id: 'wpn-returning-blade', name: 'Returning Blade', trait: 'Finesse', range: 'Close', damage: 'd8', damageType: 'mag', burden: 'One-Handed', kind: 'magic', slot: 'primary', feature: { name: 'Returning', text: 'When this weapon is thrown within its range, it appears in your hand immediately after the attack.' } },
  { id: 'wpn-shortstaff', name: 'Shortstaff', trait: 'Instinct', range: 'Close', damage: 'd8+1', damageType: 'mag', burden: 'One-Handed', kind: 'magic', slot: 'primary' },
  { id: 'wpn-dualstaff', name: 'Dualstaff', trait: 'Instinct', range: 'Far', damage: 'd6+3', damageType: 'mag', burden: 'One-Handed', kind: 'magic', slot: 'primary' },
  { id: 'wpn-scepter', name: 'Scepter', trait: 'Presence', range: 'Far', damage: 'd6', damageType: 'mag', burden: 'One-Handed', kind: 'magic', slot: 'primary', feature: { name: 'Versatile', text: 'This weapon can also be used with these statistics - Presence, Melee, d8.' } },
  { id: 'wpn-wand', name: 'Wand', trait: 'Knowledge', range: 'Far', damage: 'd6+1', damageType: 'mag', burden: 'One-Handed', kind: 'magic', slot: 'primary' },
  { id: 'wpn-greatstaff', name: 'Greatstaff', trait: 'Knowledge', range: 'Very Far', damage: 'd6', damageType: 'mag', burden: 'Two-Handed', kind: 'magic', slot: 'primary', feature: { name: 'Powerful', text: 'On a successful attack, roll an additional damage die and discard the lowest result.' } },
];

/** Tier-1 SECONDARY weapons (optional, only with a One-Handed primary): all One-Handed, physical. */
export const SECONDARY_WEAPONS: WeaponDef[] = [
  { id: 'wpn-shortsword', name: 'Shortsword', trait: 'Agility', range: 'Melee', damage: 'd8', damageType: 'phy', burden: 'One-Handed', kind: 'physical', slot: 'secondary', feature: { name: 'Paired', text: '+2 to primary weapon damage to targets within Melee range.' } },
  { id: 'wpn-round-shield', name: 'Round Shield', trait: 'Strength', range: 'Melee', damage: 'd4', damageType: 'phy', burden: 'One-Handed', kind: 'physical', slot: 'secondary', feature: { name: 'Protective', text: '+1 to Armor Score.' } },
  { id: 'wpn-tower-shield', name: 'Tower Shield', trait: 'Strength', range: 'Melee', damage: 'd6', damageType: 'phy', burden: 'One-Handed', kind: 'physical', slot: 'secondary', feature: { name: 'Barrier', text: '+2 to Armor Score; -1 to Evasion.' } },
  { id: 'wpn-small-dagger', name: 'Small Dagger', trait: 'Finesse', range: 'Melee', damage: 'd8', damageType: 'phy', burden: 'One-Handed', kind: 'physical', slot: 'secondary', feature: { name: 'Paired', text: '+2 to primary weapon damage to targets within Melee range.' } },
  { id: 'wpn-whip', name: 'Whip', trait: 'Presence', range: 'Very Close', damage: 'd6', damageType: 'phy', burden: 'One-Handed', kind: 'physical', slot: 'secondary', feature: { name: 'Startling', text: 'Mark a Stress to crack the whip and force all adversaries within Melee range back to Close range.' } },
  { id: 'wpn-grappler', name: 'Grappler', trait: 'Finesse', range: 'Close', damage: 'd6', damageType: 'phy', burden: 'One-Handed', kind: 'physical', slot: 'secondary', feature: { name: 'Hooked', text: 'On a successful attack, you can pull the target into Melee range.' } },
  { id: 'wpn-hand-crossbow', name: 'Hand Crossbow', trait: 'Finesse', range: 'Far', damage: 'd6+1', damageType: 'phy', burden: 'One-Handed', kind: 'physical', slot: 'secondary' },
];

/** Tier-1 armor (one chosen at creation). */
export const TIER1_ARMOR: ArmorDef[] = [
  { id: 'arm-gambeson', name: 'Gambeson Armor', thresholds: '5 / 11', baseScore: 3, feature: { name: 'Flexible', text: '+1 to Evasion.' } },
  { id: 'arm-leather', name: 'Leather Armor', thresholds: '6 / 13', baseScore: 3 },
  { id: 'arm-chainmail', name: 'Chainmail Armor', thresholds: '7 / 15', baseScore: 4, feature: { name: 'Heavy', text: '-1 to Evasion.' } },
  { id: 'arm-full-plate', name: 'Full Plate Armor', thresholds: '8 / 17', baseScore: 4, feature: { name: 'Very Heavy', text: '-2 to Evasion; -1 to Agility.' } },
];

export const ALL_WEAPONS: WeaponDef[] = [...PRIMARY_WEAPONS, ...SECONDARY_WEAPONS];

export function weaponById(id: string): WeaponDef | undefined {
  return ALL_WEAPONS.find((w) => w.id === id);
}
export function armorById(id: string): ArmorDef | undefined {
  return TIER1_ARMOR.find((a) => a.id === id);
}
