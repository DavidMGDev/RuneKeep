/**
 * Bridge (v0.15.0) between a stored CharacterFile and the party's vitals model. The party layer stays
 * pure (numbers only); this is the one place that reads a character's live sheet to get its current
 * vitals + ceilings, so a member always reflects level-ups / re-equips between sessions (PRD notes).
 */
import { toSheetCharacter, type CharacterFile } from './character-file';
import { type MemberMaxes, type MemberVitals } from './party';

/** The ceilings a member's vitals clamp to, derived from the current sheet. */
export function memberMaxes(file: CharacterFile): MemberMaxes {
  const c = toSheetCharacter(file);
  return {
    maxHp: c.maxHp,
    stressMax: c.stress.total - (c.stress.locked ?? 0),
    hopeMax: c.hope.total - (c.hope.locked ?? 0),
    armorMax: c.armorScore,
  };
}

/** A member's starting vitals = the character's CURRENT sheet resources (party starts where they are). */
export function initialVitals(file: CharacterFile): MemberVitals {
  const c = toSheetCharacter(file);
  return { hp: c.hp, stress: c.stress.active, hope: c.hope.active, armor: c.armor.active };
}

/** Summary numbers the party overview panel shows (PRD #23), read straight from the sheet. */
export function memberSummary(file: CharacterFile) {
  const c = toSheetCharacter(file);
  return {
    name: c.name,
    subclass: c.subclass,
    portraitUri: c.portraitUri,
    level: c.level,
    proficiency: c.proficiency,
    evasion: c.evasion,
    thresholds: c.damageThresholds,
    traits: c.traits,
    maxes: { maxHp: c.maxHp, stressMax: c.stress.total - (c.stress.locked ?? 0), hopeMax: c.hope.total - (c.hope.locked ?? 0), armorMax: c.armorScore } as MemberMaxes,
  };
}
