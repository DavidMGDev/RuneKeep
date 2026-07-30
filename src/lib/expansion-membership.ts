/**
 * Which expansions a character actually needs (v0.25.0).
 *
 * v0.25.0 split one official pack in two: everything the printed Hope and Fear book contains stayed
 * on `void`, and everything only the beta had (Blood Hunter, Summoner, their subclasses, the Blood
 * domain) moved to `thevoid`. Content is gated on the character's `enabledExpansionIds`, so a
 * character created before the split lists only `void` and would, after updating, stop resolving the
 * half of its content that moved. A Blood Hunter would lose its class.
 *
 * So membership is derived from what the character REFERENCES rather than trusted from what it
 * happens to have stored, and the stored list is topped up on load. Pure and store-free on purpose:
 * it runs inside `parseCharacterFile`, which must not touch async storage.
 *
 * This is deliberately additive. It never removes an id, because a character may legitimately have
 * an expansion enabled whose content it has not picked yet.
 */
import { cardById } from '@/data/catalog';
import { HOPE_AND_FEAR_CLASSES, THE_VOID_CLASSES, THE_VOID_EXPANSION_ID, VOID_EXPANSION_ID, type ClassName } from '@/constants/identity';

/** Which expansion a class belongs to (undefined = base game). */
export function classExpansion(key: ClassName): string | undefined {
  if (HOPE_AND_FEAR_CLASSES.includes(key)) return VOID_EXPANSION_ID;
  if (THE_VOID_CLASSES.includes(key)) return THE_VOID_EXPANSION_ID;
  return undefined;
}

/** The parts of a character this needs to look at. Structural typing keeps the character file's own
 *  (much larger) shape out of here, so the module stays testable with a literal. */
export interface ExpansionRefs {
  className?: string;
  multiclassName?: string | null;
  subclassCardId?: string;
  multiclassSubclassCardId?: string | null;
  ancestryCardId?: string;
  communityCardId?: string;
  domainCardIds?: string[];
  enabledExpansionIds?: string[];
}

/** Every expansion id the character's own content belongs to. */
export function expansionsNeededBy(f: ExpansionRefs): string[] {
  const need = new Set<string>();

  for (const key of [f.className, f.multiclassName]) {
    const exp = key ? classExpansion(key as ClassName) : undefined;
    if (exp) need.add(exp);
  }

  const ids = [f.subclassCardId, f.multiclassSubclassCardId, f.ancestryCardId, f.communityCardId, ...(f.domainCardIds ?? [])];
  for (const id of ids) {
    // Embedded homebrew cards are not in the catalog and carry no expansion, so a miss is normal.
    const exp = id ? cardById(id)?.expansion : undefined;
    if (exp) need.add(exp);
  }

  return [...need];
}

/** The character's enabled list, topped up with anything its content requires. Returns the SAME array
 *  when nothing is missing, so callers can skip a write. */
export function withRequiredExpansions(f: ExpansionRefs): string[] {
  const current = f.enabledExpansionIds ?? [];
  const missing = expansionsNeededBy(f).filter((id) => !current.includes(id));
  return missing.length ? [...current, ...missing] : current;
}
