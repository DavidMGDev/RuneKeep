/**
 * Character state history (v0.22.0) — the engine behind the sheet's State interface.
 *
 * Every change to a character is recorded, and the player can rewind to any earlier point. The rule
 * the owner set: rewinding is browsable and free, committing it needs a deliberate hold, and the
 * moment you change ANYTHING after a rewind the discarded future is gone for good. There is no
 * fast-forward after that.
 *
 * ## Why snapshots and not an event log
 *
 * Inventorying every mutation site turned up three findings that make replay untenable here:
 *
 *  1. `leveling.ts` mints Experience ids DETERMINISTICALLY from the array length (`exp-lvl5-3`).
 *     Rewind past a level-up, author a card (which appends to the same array), redo the level-up,
 *     and it mints an id that already exists. Snapshots never replay, so this cannot happen.
 *  2. Several actions have side effects outside the file — an NFC tag broadcast, a `.rkp` handed to
 *     the OS share sheet, forged PNGs written, images referenced in the picker's cache. A replay
 *     would re-run them. Restoring a snapshot does not.
 *  3. `parseCharacterFile` MUTATES what it parses (the subclass back-fill), so a snapshot written
 *     and read back is not byte-identical to what was written. Any replay-equality check would
 *     produce false positives.
 *
 * Snapshots cost more bytes and buy correctness. Given the alternative is a rewind that silently
 * produces the wrong character, that is the right trade.
 *
 * ## What this module does NOT do
 *
 * History travels with an exported character (owner) — a shared file carries its whole story.
 *
 * It is pure. It does not read or write disk, does not touch party vitals, the card library, DM
 * encounters or any other store, and does not re-run side effects. Rewind is character-scoped by
 * construction: the caller is responsible for telling the player what history could not restore.
 */

import type { CharacterFile } from './character-file';

export const HISTORY_VERSION = 1;

/**
 * How many entries to keep. Milestones are preferentially retained (see `capEntries`), so a long
 * campaign keeps its level-ups and rests even after hundreds of resource edits have aged out.
 */
export const HISTORY_CAP = 120;

/** Consecutive edits to the SAME thing inside this window collapse into one timeline entry. */
export const COALESCE_MS = 15_000;

export type HistoryKind = 'create' | 'resource' | 'equip' | 'cards' | 'edit' | 'layout' | 'level' | 'rest' | 'other';

export interface HistoryEntry {
  id: string;
  /** ISO timestamp of the most recent edit folded into this entry. */
  at: string;
  kind: HistoryKind;
  /** Plain-language summary, e.g. "Equipped Mage Robes" or "HP 12 → 5". */
  label: string;
  /**
   * Milestones (creation, level up, rest) never coalesce and are pinned in the UI, so a player can
   * navigate a campaign without scrolling past forty resource edits.
   */
  milestone: boolean;
  /** The individual edits folded into this entry, oldest first. Expandable in the UI. */
  steps: string[];
  /** Coalescing key: entries only merge when this matches and they are inside the window. */
  key: string;
  /** The complete character at this point, with its own history stripped. */
  snapshot: CharacterFile;
}

export interface CharacterHistory {
  version: number;
  entries: HistoryEntry[];
  /**
   * Index the player has rewound to, or null when sitting at the head. While non-null the entries
   * after it are still present (greyed in the UI) and can be returned to; the next real change
   * discards them permanently.
   */
  rewoundTo: number | null;
}

export function emptyHistory(): CharacterHistory {
  return { version: HISTORY_VERSION, entries: [], rewoundTo: null };
}

/** A history read off a file, normalised — an absent, foreign or corrupt one becomes empty. */
export function readHistory(h: unknown): CharacterHistory {
  const x = h as CharacterHistory | undefined;
  if (!x || x.version !== HISTORY_VERSION || !Array.isArray(x.entries)) return emptyHistory();
  return { version: HISTORY_VERSION, entries: x.entries, rewoundTo: typeof x.rewoundTo === 'number' ? x.rewoundTo : null };
}

/**
 * Stands in for an INLINE image in a snapshot (v0.33.1). See `stripHistory`.
 *
 * Deliberately not a `data:` URI, so anything that renders it fails visibly rather than drawing a
 * broken image. Nothing renders a snapshot, though: `rewind` swaps it back for the live value first.
 */
export const KEPT_IMAGE = '@kept';

/** The collections whose cards can carry a player-supplied image. */
const IMAGE_COLLECTIONS = ['customCards', 'inventoryCustom', 'notes', 'experiences', 'libraryCards', 'moodboard'] as const;

const isInline = (u: unknown): u is string => typeof u === 'string' && u.startsWith('data:');

/**
 * A snapshot must never contain history, or each entry would nest the whole chain before it and the
 * file would grow quadratically.
 *
 * v0.33.1: it must not contain INLINE IMAGE BYTES either, for exactly the same reason.
 *
 * A browser stores a picked image as a `data:` URI inside the character (there is no filesystem to
 * point at), and v0.33.0 started doing that for portraits, which used to be short-lived `blob:`
 * handles. History keeps up to 120 snapshots of the whole character, so a 200KB portrait was being
 * written 120 times into one file, and every save re-serialized all of it. On the web build, where
 * saves were not coalesced, that was the second-long freeze the owner felt when placing a token.
 *
 * So a snapshot records that an image WAS there, not what it was. `rewind` fills the live value back
 * in, which means rewinding never changes your pictures. That is a deliberate trade and the same one
 * the rewind screen already describes for images the device has since cleared: history is for the
 * character's state, and a portrait is not state.
 *
 * A native `file://` path is left exactly as it is. It costs forty bytes and it restores properly.
 */
export function stripHistory(file: CharacterFile): CharacterFile {
  const copy = { ...(file as CharacterFile & { history?: unknown }) };
  delete copy.history;
  if (isInline(copy.portraitUri)) copy.portraitUri = KEPT_IMAGE;
  // v0.34.3: the moodboard's backup of the previous portrait is a picture too, and 120 snapshots of
  // one is the same file-size problem the portrait itself was.
  if (isInline(copy.portraitBefore)) copy.portraitBefore = KEPT_IMAGE;
  for (const key of IMAGE_COLLECTIONS) {
    const arr = (copy as unknown as Record<string, unknown>)[key];
    if (!Array.isArray(arr) || !arr.some((c) => isInline((c as { imageUri?: unknown }).imageUri))) continue;
    (copy as unknown as Record<string, unknown>)[key] = arr.map((card: unknown) =>
      isInline((card as { imageUri?: unknown }).imageUri) ? { ...(card as object), imageUri: KEPT_IMAGE } : card,
    );
  }
  return copy;
}

/**
 * Put the live images back into a restored snapshot (v0.33.1), matching cards by id.
 *
 * A card that no longer exists has nothing to restore from and keeps the placeholder, which is then
 * cleared to null: an empty art zone the player can refill, rather than a string that renders as a
 * broken image forever.
 */
export function rehydrateImages(snapshot: CharacterFile, live: CharacterFile): CharacterFile {
  const out: CharacterFile = { ...snapshot };
  if (out.portraitUri === KEPT_IMAGE) out.portraitUri = isInline(live.portraitUri) ? live.portraitUri : null;
  if (out.portraitBefore === KEPT_IMAGE) out.portraitBefore = isInline(live.portraitBefore) ? live.portraitBefore : null;
  for (const key of IMAGE_COLLECTIONS) {
    const arr = (out as unknown as Record<string, unknown>)[key];
    if (!Array.isArray(arr) || !arr.some((c) => (c as { imageUri?: unknown }).imageUri === KEPT_IMAGE)) continue;
    const liveArr = ((live as unknown as Record<string, unknown>)[key] ?? []) as { id?: string; imageUri?: string | null }[];
    (out as unknown as Record<string, unknown>)[key] = arr.map((card: unknown) => {
      const c = card as { id?: string; imageUri?: string | null };
      if (c.imageUri !== KEPT_IMAGE) return card;
      const now = liveArr.find((x) => x.id === c.id)?.imageUri;
      return { ...(card as object), imageUri: isInline(now) ? now : null };
    });
  }
  return out;
}

/**
 * Field groups, in priority order. The first group with a change decides the entry's kind, because
 * the sheet's single save closure stamps live resources and gold onto EVERY write — so a purely
 * structural change (equipping a card) always carries the player's HP too. Classifying by resources
 * first would mislabel every equip as an HP change.
 */
const GROUPS: { kind: HistoryKind; fields: string[] }[] = [
  { kind: 'equip', fields: ['enabledCardIds', 'beastformUnequipped', 'beastformDomainSnapshot'] },
  { kind: 'cards', fields: ['customCards', 'inventoryCustom', 'notes', 'experiences', 'acquiredCardIds', 'libraryCards', 'cardCopies', 'removedCardIds', 'domainCardIds'] },
  { kind: 'edit', fields: ['cardEffectOverrides', 'cardTokens', 'tokenColor'] },
  { kind: 'layout', fields: ['cardOrder', 'cardCategory', 'categoryOrder', 'customCategories', 'hiddenCategories', 'customCardTypes'] },
  {
    kind: 'other',
    fields: ['name', 'portraitUri', 'portraitTransform', 'companion', 'classTracker', 'martialFocus', 'traits', 'traitBonuses', 'weaponPrimaryId', 'weaponSecondaryId', 'armorId', 'inventoryItemIds', 'mixedAncestry', 'subclassCardId', 'ancestryCardId', 'communityCardId', 'multiclassName', 'multiclassSubclassCardId', 'multiclassDomain'],
  },
];

function same(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  return JSON.stringify(a ?? null) === JSON.stringify(b ?? null);
}

function differs(prev: CharacterFile, next: CharacterFile, field: string): boolean {
  return !same((prev as unknown as Record<string, unknown>)[field], (next as unknown as Record<string, unknown>)[field]);
}

/** Which resource actually moved, for a readable "HP 12 → 9" label. */
function resourceDelta(prev: CharacterFile, next: CharacterFile): { field: string; from: number; to: number } | null {
  const pr = (prev.resources ?? {}) as Record<string, number>;
  const nr = (next.resources ?? {}) as Record<string, number>;
  for (const k of ['hp', 'stress', 'hope', 'armor']) {
    if (typeof nr[k] === 'number' && pr[k] !== nr[k]) return { field: k, from: pr[k] ?? 0, to: nr[k] };
  }
  if (!same(prev.gold, next.gold)) return { field: 'gold', from: 0, to: 0 };
  return null;
}

const RESOURCE_LABEL: Record<string, string> = { hp: 'HP', stress: 'Stress', hope: 'Hope', armor: 'Armor', gold: 'Gold' };

export interface RecordIntent {
  /**
   * Explicit intent from the caller, for changes a diff cannot identify. A rest only moves
   * resources, so it is indistinguishable from a tap on the HP track without this; a bulk equip
   * arrives as N separate writes milliseconds apart and must collapse by INTENT, not by timing.
   */
  kind?: HistoryKind;
  label?: string;
  /**
   * What the change consisted of, for entries whose detail lives in the caller (v0.33.0).
   *
   * A level-up is the case that needed it. "Levelled up to 5" is the one entry in a campaign anyone
   * would actually want to read, and it was also the least informative, because the choices that
   * define the level (which domain card, which advancements, which traits) are only nameable where
   * they were made. A diff can see that `domainCardIds` grew; it cannot say the card is called
   * Rune Ward without knowing the whole catalog.
   */
  steps?: string[];
  /** Force a fresh entry even if the previous one would otherwise coalesce. */
  separate?: boolean;
  /**
   * A write the APP made, not the player: seeding and normalisation that runs off an effect rather
   * than off a gesture. It never appears in the timeline and never truncates a rewound future,
   * because the player did not do it.
   *
   * The no-op guard below cannot stand in for this, which is why v0.27.3 did not hold: these writes
   * genuinely change the file, so the snapshots differ and the guard lets them straight through.
   * Attribution has to come from the writer, which knows. A diff never can.
   */
  system?: boolean;
}

export interface Classified {
  kind: HistoryKind;
  label: string;
  milestone: boolean;
  key: string;
}

/** Describe the change from `prev` to `next` in the player's language. */
export function classify(prev: CharacterFile | null, next: CharacterFile, intent: RecordIntent = {}): Classified {
  if (!prev) return { kind: 'create', label: `${next.name} was created`, milestone: true, key: 'create' };

  if (next.level !== prev.level) {
    return { kind: 'level', label: `Levelled up to ${next.level}`, milestone: true, key: `level:${next.level}` };
  }
  if (intent.kind === 'rest') {
    return { kind: 'rest', label: intent.label ?? 'Rested', milestone: true, key: 'rest' };
  }
  if (intent.kind) {
    return { kind: intent.kind, label: intent.label ?? 'Updated character', milestone: false, key: intent.label ?? intent.kind };
  }

  for (const g of GROUPS) {
    const hit = g.fields.filter((f) => differs(prev, next, f));
    if (hit.length) return { kind: g.kind, label: groupLabel(g.kind, hit), milestone: false, key: `${g.kind}:${hit[0]}` };
  }

  const res = resourceDelta(prev, next);
  if (res) {
    const name = RESOURCE_LABEL[res.field] ?? res.field;
    const label = res.field === 'gold' ? 'Gold changed' : `${name} ${res.from} → ${res.to}`;
    return { kind: 'resource', label, milestone: false, key: `resource:${res.field}` };
  }

  return { kind: 'other', label: 'Updated character', milestone: false, key: 'other' };
}

function groupLabel(kind: HistoryKind, fields: string[]): string {
  switch (kind) {
    case 'equip':
      return 'Changed equipped cards';
    case 'cards':
      return fields.includes('removedCardIds') ? 'Removed a card' : 'Changed cards';
    case 'edit':
      return fields.includes('cardEffectOverrides') ? 'Edited card modifiers' : 'Changed card tokens';
    case 'layout':
      return fields.includes('cardOrder') ? 'Reordered cards' : 'Changed categories';
    default:
      return fields.includes('name') ? 'Renamed' : fields.includes('portraitUri') ? 'Changed portrait' : 'Updated character';
  }
}

/**
 * Fold a resource entry's label into a net statement. Two taps taking HP 12 → 11 → 10 read as one
 * "HP 12 → 10", with both steps kept underneath.
 */
function mergeLabel(existing: HistoryEntry, incoming: Classified): string {
  if (existing.kind !== 'resource') return incoming.label;
  const from = existing.label.match(/(\d+) →/)?.[1];
  const to = incoming.label.match(/→ (\d+)/)?.[1];
  if (from == null || to == null) return incoming.label;
  return `${existing.label.split(' ')[0]} ${from} → ${to}`;
}

let seq = 0;
function entryId(at: string): string {
  seq = (seq + 1) % 100000;
  return `h-${Date.parse(at).toString(36)}-${seq.toString(36)}`;
}

/**
 * Record a change. Returns a NEW history; the input is never mutated.
 *
 * If the player had rewound, this is the moment the discarded future is truncated — the owner's
 * rule: once you change something, you can never fast-forward again.
 */
export function record(history: CharacterHistory, prev: CharacterFile | null, next: CharacterFile, intent: RecordIntent = {}, now: Date = new Date()): CharacterHistory {
  /**
   * Checked FIRST (v0.34.5), before any of the work below.
   *
   * It used to be tested after the no-op guard, which meant a write the app made still paid for a
   * `stripHistory` and two `JSON.stringify`s of the whole character. Rolling a die is one of those
   * writes and it happens mid-animation, on the JS thread, in a browser. Nothing about a write that
   * cannot produce an entry needs to be computed to find that out.
   */
  if (intent.system) return history;
  const at = now.toISOString();
  const snapshot = stripHistory(next);

  /**
   * A save that wrote nothing is not "the player changed something" (v0.27.3).
   *
   * The sheet funnels every write through one choke point, and it reaches here unprompted: once on
   * mount, again on the debounced resource write, and again on the unmount/background flush. Each of
   * those counted as an edit, so the moment you rewound to look at an earlier state the app itself
   * triggered a save and destroyed the future you had just been told was safe to browse. The panel
   * was not lying; the app was overwriting the history behind it.
   *
   * Returning the history untouched keeps both the entries and `rewoundTo`, so browsing stays free.
   * The first genuine edit still truncates, which is the owner's rule and stays covered by the test.
   */
  if (prev && same(prev, snapshot)) return history;


  // Truncate any rewound-away future BEFORE appending.
  let entries = history.rewoundTo != null ? history.entries.slice(0, history.rewoundTo + 1) : history.entries;

  const cls = classify(prev, next, intent);
  const last = entries[entries.length - 1];
  const canCoalesce =
    !intent.separate &&
    last != null &&
    !last.milestone &&
    !cls.milestone &&
    last.key === cls.key &&
    now.getTime() - Date.parse(last.at) <= COALESCE_MS;

  if (canCoalesce) {
    const merged: HistoryEntry = {
      ...last,
      at,
      label: mergeLabel(last, cls),
      steps: [...last.steps, cls.label],
      snapshot,
    };
    entries = [...entries.slice(0, -1), merged];
  } else {
    entries = [...entries, { id: entryId(at), at, kind: cls.kind, label: cls.label, milestone: cls.milestone, steps: intent.steps?.length ? intent.steps : [cls.label], key: cls.key, snapshot }];
  }

  return { version: HISTORY_VERSION, entries: capEntries(entries), rewoundTo: null };
}

/**
 * Cap the history, dropping ordinary entries oldest-first and keeping milestones as long as
 * possible. Creation is never dropped: it is the only entry that can restore the character as it
 * was made.
 */
export function capEntries(entries: HistoryEntry[], cap = HISTORY_CAP): HistoryEntry[] {
  if (entries.length <= cap) return entries;
  const keep = new Set<number>();
  entries.forEach((e, i) => {
    if (e.milestone) keep.add(i);
  });
  // Always keep the newest entries — they are what a player is most likely to rewind through.
  for (let i = entries.length - 1; i >= 0 && keep.size < cap; i--) keep.add(i);
  // Still over budget (a campaign with more milestones than the cap): keep the newest of those too.
  let result = entries.filter((_, i) => keep.has(i));
  if (result.length > cap) result = [entries[0], ...result.slice(result.length - (cap - 1))];
  return result;
}

/** Move the viewing position without committing anything. Browsing must always be free. */
export function preview(history: CharacterHistory, index: number): CharacterHistory {
  if (index < 0 || index >= history.entries.length) return history;
  const atHead = index === history.entries.length - 1;
  return { ...history, rewoundTo: atHead ? null : index };
}

export interface RewindResult {
  file: CharacterFile;
  history: CharacterHistory;
  /** Corrections the repair pass had to make, for honest reporting in the confirmation. */
  repairs: string[];
  /** How many entries will be discarded when the player next changes something. */
  discards: number;
}

/**
 * Restore the character as it was at `index`.
 *
 * The restored file is VALIDATED, not trusted. A raw snapshot bypasses the mutation layer's guards
 * (never delete the last card, at least one category enabled, resources within their maxima), so a
 * rewind could otherwise produce a state the app's own code paths consider impossible.
 */
export function rewind(history: CharacterHistory, index: number, live: CharacterFile): RewindResult {
  const entry = history.entries[index];
  if (!entry) return { file: live, history, repairs: [], discards: 0 };

  // v0.33.1: snapshots hold a placeholder where an inline image was, so the live picture goes back in
  // before anything else looks at the restored character.
  const { file, repairs } = repair(rehydrateImages(entry.snapshot, live));
  return {
    file,
    history: preview(history, index),
    repairs,
    discards: history.entries.length - 1 - index,
  };
}

/**
 * Bring a restored snapshot back inside the invariants the app's mutation paths maintain. Returns
 * what it had to change so the UI can say so rather than silently altering the player's character.
 */
export function repair(snapshot: CharacterFile): { file: CharacterFile; repairs: string[] } {
  const repairs: string[] = [];
  const file: CharacterFile = { ...snapshot };

  // Resources are stored but clamped against the DERIVED maxima on read, so restoring HP 9 into a
  // build whose maxHp is now 6 silently yields 6. Say so rather than hide it.
  const res = file.resources;
  if (res && typeof file.maxHp === 'number' && res.hp > file.maxHp) {
    repairs.push(`HP reduced to ${file.maxHp}, this build's maximum is lower than it was.`);
    file.resources = { ...res, hp: file.maxHp };
  }

  // At least one category must stay enabled, or the carousel has nothing to show.
  if (Array.isArray(file.hiddenCategories) && file.hiddenCategories.length > 0 && file.customCategories?.length === 0 && file.hiddenCategories.includes('abilities')) {
    repairs.push('Re-enabled the Abilities category, every category was hidden.');
    file.hiddenCategories = file.hiddenCategories.filter((c) => c !== 'abilities');
  }

  return { file, repairs };
}

/** Entries grouped for display: newest first, with milestones flagged for pinning. */
export function timeline(history: CharacterHistory): { entry: HistoryEntry; index: number; discarded: boolean }[] {
  const cut = history.rewoundTo;
  return history.entries
    .map((entry, index) => ({ entry, index, discarded: cut != null && index > cut }))
    .reverse();
}

/** An authored card that existed in an earlier snapshot and is gone from the character now. */
export interface RecoverableCard {
  id: string;
  title: string;
  /**
   * The collection it lived in, or null for a SYSTEM card (v0.34.0).
   *
   * A card the player authored is spliced out of its array when deleted and has to be put back. A
   * catalog card is never spliced, because that would corrupt the file's structure: it is tombstoned
   * in `removedCardIds` instead, and putting it back means taking the tombstone away.
   */
  collection: AuthoredCollection | null;
  /** When it was last seen alive. */
  at: string;
  /** The card object itself, ready to be put back. Absent for a system card, which still exists. */
  card?: unknown;
}

/** The four collections that hold player-AUTHORED cards. Catalog cards aren't listed: they are
 *  re-addable from the gear browser at any time, so they were never really lost. */
export type AuthoredCollection = 'customCards' | 'inventoryCustom' | 'notes' | 'experiences';
const AUTHORED: AuthoredCollection[] = ['customCards', 'inventoryCustom', 'notes', 'experiences'];

function cardsIn(file: CharacterFile, col: AuthoredCollection): { id?: string; title?: string }[] {
  const v = (file as unknown as Record<string, unknown>)[col];
  return Array.isArray(v) ? (v as { id?: string; title?: string }[]) : [];
}

/**
 * The card trash (v0.22.0), derived rather than stored.
 *
 * The owner asked for a way to see and recover deleted cards without a general undo stack. Because
 * every mutation already snapshots the whole character, a deleted card is still sitting in history —
 * so the trash is a QUERY over what used to exist, not a second copy of the data to keep in sync.
 * That also means it is bounded by the history cap for free, and cannot drift out of agreement with
 * the character the way a parallel `trashedCards` array would.
 *
 * Newest sighting wins, so a card deleted, restored and deleted again reports the latest version.
 */
const removedIds = (f: CharacterFile): string[] => (Array.isArray(f.removedCardIds) ? f.removedCardIds : []);

export function recoverableCards(history: CharacterHistory, current: CharacterFile): RecoverableCard[] {
  const alive = new Set<string>();
  for (const col of AUTHORED) for (const c of cardsIn(current, col)) if (c.id) alive.add(c.id);

  const found = new Map<string, RecoverableCard>();
  for (const entry of history.entries) {
    for (const col of AUTHORED) {
      for (const c of cardsIn(entry.snapshot, col)) {
        if (!c.id || alive.has(c.id)) continue;
        found.set(c.id, { id: c.id, title: c.title || 'Untitled card', collection: col, at: entry.at, card: c });
      }
    }
  }
  /**
   * Tombstoned SYSTEM cards belong in the trash too (v0.34.0).
   *
   * They were left out on the grounds that a catalog card is re-addable from the gear browser and so
   * was never really lost. That is not what deleting one feels like: the owner deleted an armor card,
   * looked in the trash, and it was not there. A weapon or an armor is not "re-addable" in any obvious
   * sense either, because it came from a slot rather than from a list.
   *
   * They carry no card OBJECT because nothing was removed: the card still exists, it is hidden.
   * Restoring one takes the tombstone away. The title is left as the id here, because turning an id
   * into the name on the card needs the catalog and the character's own cards, which is the screen's
   * job and not this module's.
   */
  const hiddenNow = new Set(removedIds(current));
  for (const id of hiddenNow) {
    if (found.has(id)) continue;
    const last = [...history.entries].reverse().find((e) => !removedIds(e.snapshot).includes(id));
    found.set(id, { id, title: id, collection: null, at: last?.at ?? history.entries[0]?.at ?? new Date(0).toISOString() });
  }
  return [...found.values()].sort((a, b) => b.at.localeCompare(a.at));
}

/**
 * Put a recovered card back, in `category` when one is given. Returns a new file.
 *
 * v0.34.0 fixes two ways this used to do nothing at all.
 *
 * An authored card is deleted by BOTH splicing it out of its collection and tombstoning its id, and
 * this only ever undid the splice. So restoring the note every character starts with put the note
 * object back and the tombstone went on hiding it: the card came back to a file nobody could see.
 * The tombstone is lifted either way now.
 *
 * And a restored card had no CATEGORY, because deleting one drops its `cardCategory` entry. Without
 * one it falls back to wherever its kind defaults to, which is rarely where it was. The caller asks
 * the player, the same way every other card destination in the app is chosen.
 */
export function restoreCard(file: CharacterFile, rec: RecoverableCard, category?: string): CharacterFile {
  const next: CharacterFile = { ...file };
  const hidden = removedIds(file);
  if (hidden.includes(rec.id)) next.removedCardIds = hidden.filter((x) => x !== rec.id);
  if (rec.collection && rec.card) {
    const existing = cardsIn(file, rec.collection);
    if (!existing.some((c) => c.id === rec.id)) (next as unknown as Record<string, unknown>)[rec.collection] = [...existing, rec.card];
  }
  if (category) next.cardCategory = { ...(file.cardCategory ?? {}), [rec.id]: category };
  return next;
}

/**
 * Which cards an entry brought in, and which it let go (v0.29.1).
 *
 * History is snapshots, not events, so nothing records "you equipped Bone 1". But the snapshots are
 * whole characters, and the difference between two of them is exactly that fact. "Changed cards" on
 * its own asks the player to remember what they did; a list of what actually moved does not.
 *
 * Ids only. Turning an id into a title needs the catalog and the character's own authored cards, and
 * that belongs to the screen rendering the row, not to the history model.
 */
const ID_LISTS: readonly string[] = ['enabledCardIds', 'domainCardIds', 'inventoryItemIds', 'acquiredCardIds'];
const OBJECT_LISTS: readonly string[] = [...AUTHORED, 'libraryCards'];
const SLOT_FIELDS: readonly string[] = ['weaponPrimaryId', 'weaponSecondaryId', 'armorId', 'subclassCardId', 'multiclassSubclassCardId', 'ancestryCardId', 'communityCardId'];

/**
 * Every card id a snapshot counts as HELD.
 *
 * `removedCardIds` is SUBTRACTED rather than added. A system card is never spliced out of its array
 * when a player removes it, because that would corrupt the file's structure; it is tombstoned in that
 * list instead. Read inverted, entering the list is a removal and leaving it is a restore, which is
 * what the player actually saw happen.
 */
function cardMembership(file: CharacterFile | null | undefined): Set<string> {
  const out = new Set<string>();
  if (!file) return out;
  const rec = file as unknown as Record<string, unknown>;
  for (const k of ID_LISTS) {
    const v = rec[k];
    if (Array.isArray(v)) for (const id of v) if (typeof id === 'string' && id) out.add(id);
  }
  for (const k of OBJECT_LISTS) {
    const v = rec[k];
    if (Array.isArray(v)) for (const c of v as { id?: string }[]) if (c?.id) out.add(c.id);
  }
  for (const k of SLOT_FIELDS) {
    const v = rec[k];
    if (typeof v === 'string' && v) out.add(v);
  }
  const gone = rec.removedCardIds;
  if (Array.isArray(gone)) for (const id of gone) out.delete(id as string);
  return out;
}

export interface CardMoves {
  added: string[];
  removed: string[];
}

/** The cards that came and went between two snapshots. Order follows the newer snapshot. */
export function cardMoves(prev: CharacterFile | null | undefined, next: CharacterFile | null | undefined): CardMoves {
  const before = cardMembership(prev);
  const after = cardMembership(next);
  return {
    added: [...after].filter((id) => !before.has(id)),
    removed: [...before].filter((id) => !after.has(id)),
  };
}
