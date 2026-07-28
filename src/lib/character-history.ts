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
 * A snapshot must never contain history, or each entry would nest the whole chain before it and the
 * file would grow quadratically.
 */
export function stripHistory(file: CharacterFile): CharacterFile {
  if (!('history' in file)) return file;
  const copy = { ...(file as CharacterFile & { history?: unknown }) };
  delete copy.history;
  return copy;
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
  /** Force a fresh entry even if the previous one would otherwise coalesce. */
  separate?: boolean;
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
  const at = now.toISOString();
  const snapshot = stripHistory(next);

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
    entries = [...entries, { id: entryId(at), at, kind: cls.kind, label: cls.label, milestone: cls.milestone, steps: [cls.label], key: cls.key, snapshot }];
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

  const { file, repairs } = repair(entry.snapshot);
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
  /** Which collection it lived in, so restoring puts it back where it came from. */
  collection: AuthoredCollection;
  /** When it was last seen alive. */
  at: string;
  /** The card object itself, ready to be put back. */
  card: unknown;
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
  return [...found.values()].sort((a, b) => b.at.localeCompare(a.at));
}

/** Put a recovered card back in the collection it came from. Returns a new file. */
export function restoreCard(file: CharacterFile, rec: RecoverableCard): CharacterFile {
  const existing = cardsIn(file, rec.collection);
  if (existing.some((c) => c.id === rec.id)) return file; // already back; restoring twice is a no-op
  return { ...file, [rec.collection]: [...existing, rec.card] } as CharacterFile;
}
