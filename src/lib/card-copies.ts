/**
 * Card copies as MIRRORS (v0.34.8, owner).
 *
 * A copy is made with Move → "copy instead of move". It is not a second card: it is the same card
 * seen from another deck. Enable state, the token board, the number input and the effects are all
 * keyed by `refOf`, and a copy's ref is its source's id, so toggling either toggles both, the panel
 * shows one truth, and the modifier lands on the character once.
 *
 * The part that was missing is what happens when the ORIGINAL goes. The deck builder needs a real
 * card to draw a copy from, so deleting the original quietly took every copy with it, and the card
 * did not even reach the trash. So a delete PROMOTES: the underlying card survives and takes the
 * place of one of its copies, and only when the last instance is deleted does the card go.
 *
 * Pure. `resolveCopyDeletions` decides; the sheet applies.
 */
import { refOf } from '@/features/cards/card-effects';
import type { CharacterFile } from './character-file';

export interface CardCopy {
  id: string;
  ref: string;
}

const copiesOf = (file: CharacterFile): CardCopy[] => file.cardCopies ?? [];

/** Every instance id sharing one sync key: the source card first, then its copies in file order. */
export function instancesOfRef(file: CharacterFile, ref: string): string[] {
  return [ref, ...copiesOf(file).filter((c) => c.ref === ref).map((c) => c.id)];
}

export type CopyRole = 'single' | 'original' | 'copy';

/** What this instance is, and how many instances of the card exist in total. Drives the line the
 *  Modifiers panel prints so a player can tell which one they are looking at. */
export function copyRoleOf(file: CharacterFile, id: string): { role: CopyRole; total: number } {
  const ref = refOf(id, file);
  const total = instancesOfRef(file, ref).length;
  if (total <= 1) return { role: 'single', total };
  return { role: id === ref ? 'original' : 'copy', total };
}

export interface CopyDeletion {
  /** Ids to delete for real: copies being removed, and originals with nothing left to promote. */
  deleteIds: string[];
  /** Originals that must SURVIVE the delete because a copy is taking their place. */
  promotedRefs: string[];
  /** Copy ids consumed by a promotion — dropped from `cardCopies`, their slot inherited by the ref. */
  consumedCopyIds: string[];
}

/**
 * Split a delete request into what really goes and what is merely re-seated.
 *
 * Guards the case the owner named: selecting an original AND all of its copies at once. The
 * promotion target is chosen from the copies that SURVIVE this request, so it can never be a card
 * that is being deleted in the same breath, and with none surviving the original is deleted properly
 * (tombstoned, effects dropped, into the trash) rather than half-removed.
 */
export function resolveCopyDeletions(file: CharacterFile, ids: string[]): CopyDeletion {
  const asked = new Set(ids);
  const copies = copiesOf(file);
  const deleteIds: string[] = [];
  const promotedRefs: string[] = [];
  const consumedCopyIds: string[] = [];
  const claimed = new Set<string>(); // a copy can only be promoted into once

  for (const id of ids) {
    const ref = refOf(id, file);
    // A copy is always a plain removal: the card it mirrors is untouched.
    if (ref !== id) { deleteIds.push(id); continue; }
    const survivor = copies.find((c) => c.ref === ref && !asked.has(c.id) && !claimed.has(c.id));
    if (!survivor) { deleteIds.push(id); continue; }
    claimed.add(survivor.id);
    promotedRefs.push(ref);
    consumedCopyIds.push(survivor.id);
  }
  return { deleteIds, promotedRefs, consumedCopyIds };
}

/**
 * Move the surviving card into the slot its promoted copy held: same category, same position in that
 * category's explicit order. Without this the card would jump back to wherever the deleted instance
 * sat, which is the deck the player just emptied.
 */
export function applyPromotions(
  file: CharacterFile,
  promotedRefs: string[],
  consumedCopyIds: string[],
): { cardCategory: Record<string, string>; cardOrder: Record<string, string[]> } {
  const cardCategory = { ...(file.cardCategory ?? {}) };
  const cardOrder: Record<string, string[]> = {};
  for (const [k, v] of Object.entries(file.cardOrder ?? {})) cardOrder[k] = [...v];
  promotedRefs.forEach((ref, i) => {
    const copyId = consumedCopyIds[i];
    if (!copyId) return;
    const cat = cardCategory[copyId];
    if (cat) cardCategory[ref] = cat;
    delete cardCategory[copyId];
    for (const k of Object.keys(cardOrder)) {
      cardOrder[k] = cardOrder[k].map((x) => (x === copyId ? ref : x)).filter((x, j, a) => a.indexOf(x) === j);
    }
  });
  return { cardCategory, cardOrder };
}
