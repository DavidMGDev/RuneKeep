/**
 * A pack's VERSION moves when other people would see something different (v0.42.5, owner).
 *
 * "Instead of making the expansion pack bump its version with every save (makes no sense since
 * expansions have auto-save upon every card modification / creation) then make it so that when the
 * user can successfully share it then the expansion bumps the version if there have been changes with
 * respect to the last time it was shared."
 *
 * v0.42.1 bumped on save. Auto-save fires on every card edit, so a pack reached v300 before anybody
 * saw it once, and the number stopped meaning anything at all. A version is not a save counter, it is
 * the thing an INSTALLED COPY compares itself against: it should move exactly when what would arrive
 * on somebody's device is different from what last did.
 *
 * So: a signature of the pack's content is taken at the moment of a successful share. The next share
 * compares against it, and bumps only if they differ. Sharing the same pack twice sends the same
 * version, which is what makes "v3" a thing two people can talk about.
 *
 * The signature covers the CONTENT and nothing else. The name, the author line and the description
 * are the pack's own labels and change nothing about the cards, so re-sharing after a typo fix keeps
 * the version; the campaign rules ARE content, because they change what a receiver can build.
 */

import { contentSig } from './content-sig';
import type { Expansion, LibraryCard } from './library';

/**
 * One card, as the string its signature is taken from.
 *
 * Everything a receiver would see: what the card is, what it says, what it does, what it links to and
 * what it carries. Deliberately NOT the card's own image bytes: an image is embedded at share time
 * and hashing it would make the signature cost grow with the pack.
 */
const cardSig = (c: LibraryCard): string =>
  contentSig(
    c.id,
    c.contentType,
    c.title,
    c.text,
    c.imageUri,
    c.color,
    c.typeLabel,
    c.domain,
    c.level,
    c.className,
    c.linkSubclass,
    c.classRole,
    c.subclass,
    c.tier,
    c.spellcastTrait,
    c.fullImage ? 'face' : '',
    JSON.stringify(c.sections ?? []),
    JSON.stringify(c.effects ?? []),
    JSON.stringify(c.functions ?? []),
    JSON.stringify(c.advances ?? []),
    JSON.stringify(c.classSpec ?? {}),
    JSON.stringify(c.weapon ?? {}),
    JSON.stringify(c.armor ?? {}),
  );

/** The signature of everything a receiver of this pack would get. */
export function packSig(exp: Pick<Expansion, 'cards' | 'campaign'>): string {
  return contentSig(...exp.cards.map(cardSig), JSON.stringify(exp.campaign ?? {}));
}

/** Whether this pack differs from the last one that was shared. A pack never shared always does. */
export const packChangedSinceShare = (exp: Pick<Expansion, 'cards' | 'campaign' | 'sharedSig'>): boolean =>
  exp.sharedSig !== packSig(exp);

/**
 * The pack as it should be RECORDED after a successful share.
 *
 * The version moves only if the content did, and the signature is stamped either way so the next
 * share compares against what actually went out.
 */
export function afterShare<T extends Pick<Expansion, 'cards' | 'campaign' | 'version' | 'sharedSig'>>(exp: T): T {
  const sig = packSig(exp);
  return { ...exp, version: exp.sharedSig === sig ? exp.version : exp.version + 1, sharedSig: sig };
}

/** The version the NEXT share would send, for the pack's own header line. */
export const nextShareVersion = (exp: Pick<Expansion, 'cards' | 'campaign' | 'version' | 'sharedSig'>): number =>
  packChangedSinceShare(exp) ? exp.version + 1 : exp.version;
