/**
 * Characterize (v0.36, owner) — turning an adversary or an ally into a real character.
 *
 * An adversary is a stat block: a difficulty, a pair of thresholds, an attack line and a list of
 * features. A character is a class, a level, cards and a modifier engine. A DM running a recurring
 * villain or a named NPC had to keep the interesting half of them outside the app, because nothing
 * could move a stat block across that line.
 *
 * This module is the crossing, and it is deliberately the ONLY thing that knows how one becomes the
 * other. Three consumers read it and they must not drift:
 *
 *  1. the creator's first step, which shows every carried item as a card the DM can grey out;
 *  2. the cards written at Forge, which are those same items minus the greyed ones;
 *  3. the numbers written onto the character file, which come from the items that carry numbers.
 *
 * Everything here is pure and none of it imports the theme, so it stays unit-testable (Jest cannot
 * load a module that reaches the stylesheet).
 */

import type { CardEffect } from './modifiers';

/** The stat-block fields characterization reads. Structural, so a test needs no whole `Combatant`. */
export interface StatBlockLike {
  name: string;
  tier?: 1 | 2 | 3 | 4;
  difficulty?: number;
  role?: string;
  maxHp?: number;
  maxStress?: number;
  thresholds?: { major: number; severe: number };
  atkMod?: string;
  attack?: { name: string; range: string; damage: string };
  damageType?: 'Physical' | 'Magic';
  motives?: string;
  experience?: string;
  description?: string;
  hordeNote?: string;
  features?: { name: string; kind: string; text: string }[];
}

// ---------------------------------------------------------------------------------------------
// Level
// ---------------------------------------------------------------------------------------------

/**
 * Which levels a tier covers, and the difficulty a tier is usually written at.
 *
 * The bands are the rulebook's own: tier 1 is level 1, tier 2 is levels 2 to 4, tier 3 is 5 to 7 and
 * tier 4 is 8 to 10. The typicals are the middle of each tier's published difficulty spread, and
 * they exist only to place an adversary WITHIN its band: a tier 2 brute written at difficulty 17 is
 * a harder fight than one written at 13, and should not arrive as the same level 2 character.
 */
const TIER_BAND: Record<number, [number, number]> = { 1: [1, 1], 2: [2, 4], 3: [5, 7], 4: [8, 10] };
const TIER_TYPICAL: Record<number, number> = { 1: 11, 2: 14, 3: 16, 4: 18 };

/**
 * The level a stat block arrives as, before the DM adjusts it.
 *
 * Tier decides the band, difficulty moves within it. An adversary written at its tier's TYPICAL
 * difficulty lands in the MIDDLE of the band, so difficulty can move it either way, and every two
 * points is worth a level. The band caps it at both ends: a tier 2 adversary can never outrank a
 * tier 3 one however brutal its difficulty is, and can never fall below its tier for being easy.
 *
 * A stat block with no tier is level 1, because one with no tier is usually a custom block somebody
 * has just typed in and has not finished.
 */
export function levelForStatBlock(tier?: number, difficulty?: number): number {
  const band = TIER_BAND[tier ?? 0];
  if (!band) return 1;
  const [lo, hi] = band;
  const typical = TIER_TYPICAL[tier ?? 1] ?? 12;
  const middle = lo + Math.floor((hi - lo) / 2);
  const nudge = Math.floor(((difficulty ?? typical) - typical) / 2);
  return Math.max(lo, Math.min(hi, middle + nudge));
}

/** The range the Level step allows. Level 10 is the top of tier 4, which is where a tier 4 sits. */
export const LEVEL_MIN = 1;
export const LEVEL_MAX = 10;

export const clampLevel = (n: number): number => Math.max(LEVEL_MIN, Math.min(LEVEL_MAX, Math.round(n)));

// ---------------------------------------------------------------------------------------------
// The carried items
// ---------------------------------------------------------------------------------------------

export type CarryKind = 'level' | 'thresholds' | 'vitals' | 'evasion' | 'weapon' | 'feature' | 'statblock';

export interface CarryItem {
  /** Stable across rebuilds: it is the carousel card's id AND the key the disabled set holds. */
  id: string;
  kind: CarryKind;
  /** The card's name. */
  title: string;
  /** The plaque label, so a reaction reads as a reaction rather than as "Card". */
  cardLabel: string;
  /** The card's body. Empty for items that carry only numbers. */
  text: string;
  /** Carried numbers. Only the kind that owns them sets them. */
  level?: number;
  thresholds?: { major: number; severe: number };
  vitals?: { maxHp?: number; maxStress?: number };
  /** An adversary's DIFFICULTY is a character's Evasion: the number an attack has to beat. */
  evasion?: number;
}

const clean = (s: string | undefined): string => (s ?? '').trim();

/** " physical" / " magic", unless the damage line already says so ("1d12+2 phy"). */
function damageSuffix(damage: string, type: 'Physical' | 'Magic' | undefined): string {
  if (!type) return '';
  const stem = type.toLowerCase().slice(0, 3); // phy / mag, which is how the book abbreviates it
  return damage.toLowerCase().includes(stem) ? '' : ` ${type.toLowerCase()}`;
}

/**
 * A name the app made up, not one anybody chose (v0.36.1, owner).
 *
 * `newAdversary` names its rows "Adversary #3", and carrying that into a character is worse than
 * carrying nothing: the DM has to clear the field before they can type their own. A real name is
 * inherited and counts the name answered; a placeholder leaves the field empty and the step open.
 */
const GENERIC_NAME = /^(adversary|npc|ally|enemy|combatant|creature)[ #]*[0-9]*$/i;
export const isGenericName = (name: string): boolean => GENERIC_NAME.test((name ?? '').trim());

/**
 * Everything a stat block hands over, in the order the DM should read it.
 *
 * Ordering is not cosmetic: the first step is a carousel and it opens on the first card, so what
 * leads is what the DM is most likely to want to check. Level and thresholds lead because they are
 * the two that silently change the character's numbers; the features follow in their own order,
 * which is the order whoever wrote the stat block chose.
 */
export function carryItems(c: StatBlockLike): CarryItem[] {
  const out: CarryItem[] = [];

  const level = levelForStatBlock(c.tier, c.difficulty);
  out.push({
    id: 'carry-level',
    kind: 'level',
    title: `Level ${level}`,
    cardLabel: 'Level',
    level,
    text: [
      c.tier ? `Tier ${c.tier}` : 'No tier given',
      c.difficulty ? `Difficulty ${c.difficulty}` : null,
      `becomes level ${level}.`,
    ]
      .filter(Boolean)
      .join(', ')
      .concat(
        '\n\nThe level brings only what a level brings on its own: Proficiency and the per-level damage threshold bonuses. No trait increases, no subclass card and no domain cards, so everything this character knows is something you picked.',
      ),
  });

  if (c.thresholds && (c.thresholds.major || c.thresholds.severe)) {
    out.push({
      id: 'carry-thresholds',
      kind: 'thresholds',
      title: `Thresholds ${c.thresholds.major}/${c.thresholds.severe}`,
      cardLabel: 'Thresholds',
      thresholds: { ...c.thresholds },
      text: `Major ${c.thresholds.major}, Severe ${c.thresholds.severe}.\n\nHeld exactly. Whatever the level and the chosen cards work out to, this makes up the difference, so the numbers on the sheet are the numbers the stat block had.`,
    });
  }

  if (c.maxHp || c.maxStress) {
    const bits = [c.maxHp ? `${c.maxHp} HP` : null, c.maxStress ? `${c.maxStress} Stress` : null].filter(Boolean);
    out.push({
      id: 'carry-vitals',
      kind: 'vitals',
      title: bits.join(' · '),
      cardLabel: 'Vitals',
      vitals: { maxHp: c.maxHp, maxStress: c.maxStress },
      text: `${bits.join(' and ')}.\n\nHeld exactly, the same way the thresholds are: the difference between what the class and level give and what the stat block said.`,
    });
  }

  if (c.difficulty) {
    out.push({
      id: 'carry-evasion',
      kind: 'evasion',
      title: `Evasion ${c.difficulty}`,
      cardLabel: 'Evasion',
      evasion: c.difficulty,
      text: `Difficulty ${c.difficulty} becomes Evasion ${c.difficulty}.

Both are the number an attack has to beat, so it carries across as itself. Whatever class you pick brings its own Evasion, and this makes up the difference, so the sheet reads ${c.difficulty} either way.`,
    });
  }

  if (c.attack && (clean(c.attack.name) || clean(c.attack.damage))) {
    const a = c.attack;
    out.push({
      id: 'carry-weapon',
      kind: 'weapon',
      title: clean(a.name) || 'Standard attack',
      cardLabel: 'Weapon',
      /**
       * One stat PER LINE (v0.36.1, owner).
       *
       * The markdown parser joins consecutive non-blank lines into one paragraph, so a plain newline
       * between the stats printed "Range: Very Close Damage: 1d12+2 phy Attack: +3" as a single run,
       * which is genuinely hard to read mid-fight. A bullet list gives one row per stat and costs
       * less card height than blank-line paragraphs would.
       *
       * The damage TYPE is appended only when the damage does not already say it: the book writes
       * "1d12+2 phy", and adding "physical" to that produced "1d12+2 phy physical".
       */
      text: [
        clean(a.range) ? `- **Range:** ${clean(a.range)}` : null,
        clean(a.damage) ? `- **Damage:** ${clean(a.damage)}${damageSuffix(a.damage, c.damageType)}` : null,
        clean(c.atkMod) ? `- **Attack:** ${clean(c.atkMod)}` : null,
      ]
        .filter(Boolean)
        .join('\n'),
    });
  }

  for (const [i, f] of (c.features ?? []).entries()) {
    if (!clean(f.name) && !clean(f.text)) continue;
    out.push({
      id: `carry-feature-${i}`,
      kind: 'feature',
      title: clean(f.name) || `Feature ${i + 1}`,
      // The kind IS the label, so a Reaction card says Reaction on its plaque. Anything unexpected
      // falls back to Feature rather than printing whatever string arrived.
      cardLabel: ['Passive', 'Action', 'Reaction'].includes(f.kind) ? f.kind : 'Feature',
      text: clean(f.text),
    });
  }

  const block = [
    c.role ? `**Type:** ${c.role}` : null,
    c.tier ? `**Tier:** ${c.tier}` : null,
    c.difficulty ? `**Difficulty:** ${c.difficulty}` : null,
    clean(c.motives) ? `**Motives & Tactics:** ${clean(c.motives)}` : null,
    clean(c.experience) ? `**Experience:** ${clean(c.experience)}` : null,
    clean(c.hordeNote) ? `**Horde:** ${clean(c.hordeNote)}` : null,
    clean(c.description) ? `\n${clean(c.description)}` : null,
  ].filter(Boolean);
  if (block.length) {
    out.push({ id: 'carry-statblock', kind: 'statblock', title: clean(c.name) || 'Stat block', cardLabel: 'Stat block', text: block.join('\n') });
  }

  return out;
}

/** The items that survive the first step. */
export const keptItems = (items: CarryItem[], disabled: Set<string>): CarryItem[] => items.filter((i) => !disabled.has(i.id));

/** The level the kept items ask for, or 1 when the DM greyed the level card out. */
export function keptLevel(items: CarryItem[], disabled: Set<string>): number {
  const l = keptItems(items, disabled).find((i) => i.kind === 'level');
  return l?.level ?? 1;
}

// ---------------------------------------------------------------------------------------------
// Holding the stat block's numbers
// ---------------------------------------------------------------------------------------------

/** What the sheet already works out on its own, before the carried numbers are held. */
export interface ComputedNumbers {
  majorThreshold: number;
  severeThreshold: number;
  maxHp: number;
  stressMax: number;
  evasion: number;
}

/**
 * The effects that make the sheet agree with the stat block.
 *
 * The DM's rule, stated plainly: a characterized adversary with thresholds of 8/14 must READ 8/14,
 * whatever the class, the level bonuses, an ancestry and a pair of domain cards happen to add up to.
 * So the sheet is computed once from everything else the character has, and this writes the single
 * difference as a bonus. Base plus level plus cards plus this is the stat block's number, exactly.
 *
 * A difference of zero writes nothing: there is no point carrying a card that adds 0.
 *
 * Armor is the one thing that can move the answer AFTER this is worked out, which is why the creator
 * warns when armor is chosen for something that inherited thresholds.
 */
export function itemHoldEffects(item: CarryItem, have: ComputedNumbers): CardEffect[] {
  const out: CardEffect[] = [];
  const push = (target: CardEffect['target'], want: number | undefined, has: number) => {
    if (want === undefined || !Number.isFinite(want)) return;
    const delta = Math.round(want - has);
    if (delta === 0) return;
    out.push({ target, delta, mode: 'bonus', note: 'Carried from the stat block' });
  };
  if (item.thresholds) {
    push('majorThreshold', item.thresholds.major, have.majorThreshold);
    push('severeThreshold', item.thresholds.severe, have.severeThreshold);
  }
  if (item.vitals) {
    push('maxHp', item.vitals.maxHp, have.maxHp);
    push('stressMax', item.vitals.maxStress, have.stressMax);
  }
  if (item.evasion !== undefined) push('evasion', item.evasion, have.evasion);
  return out;
}

export function holdEffects(items: CarryItem[], disabled: Set<string>, have: ComputedNumbers): CardEffect[] {
  return keptItems(items, disabled).flatMap((i) => itemHoldEffects(i, have));
}

/** True when anything carried sets damage thresholds, which is what the armor warning hangs on. */
export const carriesThresholds = (items: CarryItem[], disabled: Set<string>): boolean =>
  keptItems(items, disabled).some((i) => i.kind === 'thresholds');

/**
 * Whether the CLASS step can be skipped (v0.36.1, owner).
 *
 * A class exists on a character sheet to supply numbers: a starting Evasion and starting hit points.
 * An adversary carrying both is already supplying them itself, so making the DM pick a class before
 * they can forge is making them choose something that will be overwritten anyway.
 *
 * Greying either card out puts the class back, because without the carried number the class is the
 * only thing left that can give it. The creator watches this and un-skips Class when it flips false.
 */
export function canSkipClass(items: CarryItem[], disabled: Set<string>): boolean {
  const kept = keptItems(items, disabled);
  const hp = kept.find((i) => i.kind === 'vitals')?.vitals?.maxHp;
  const ev = kept.find((i) => i.kind === 'evasion')?.evasion;
  return !!hp && !!ev;
}
