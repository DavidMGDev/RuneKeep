import { useCallback, useRef, useState } from 'react';

import { Text } from 'react-native';

import { CardEditor, type CardDraft } from '@/components/card-editor';
import { type ExperienceRef } from '@/components/effects-editor';
import { RuneButton } from '@/components/rune-button';
import { showToast } from '@/components/toast';
import { Body, Rune } from '@/constants/theme';

import { cardById } from '@/data/catalog';
import { lootById } from '@/data/loot-data';
import { type LibraryCard } from '@/lib/library';
import { pickCards } from '@/lib/library-store';

import { type CardCategory } from '../card-data';
import { type CustomCategory } from '../carousel-categories';
import { defaultTypeForCategory, typePickerGroups } from '../card-types';
import { useCarousel } from '../carousel-context';
import { CardDestination } from './card-destination';
import { GearBrowser } from './gear-browser';
import { OverlayShell } from './overlay-shell';
import { QuickCardFlow } from './quick-card-flow';

/** Where a created card lands. `notes` (#214) is the Notes deck; the others ride inventory/arsenal. */
export type CardTarget = 'inventory' | 'arsenal' | 'both' | 'notes';

/**
 * New Card (#164/#214/#246): author a custom card into a CATEGORY (the one being viewed, or an
 * explicit `categoryOverride` from the Card Management panel's per-category add button). Its "type"
 * (middle ribbon) is chosen from a picker of built-in + custom types. Gear-bearing categories also
 * expose the system catalog browser. The save handler receives the resolved category KEY.
 *
 * v0.24.3 adds two things around that:
 * - `quick`: the sheet's Add Card badge opens the stripped QuickCardFlow first (see that file for
 *   why). Advanced hands its draft to this editor, so switching is never a restart.
 * - The DESTINATION prompt: whichever mode authored the card, saving asks which deck it joins rather
 *   than silently using the category on screen. One choke point, so both modes and both entry points
 *   behave identically.
 */
export function NewCardFlow({ onSave, onCancel, onAcquire, onAcquireCustom, acquiredIds, enabledExpansionIds, categoryOverride, customTypes = [], initialMode = 'author', experiences, quick = false, destinations = [], customCategories = [] }: { onSave: (draft: CardDraft, categoryKey: CardCategory) => void; onCancel: () => void; onAcquire?: (id: string, category: CardCategory) => void; onAcquireCustom?: (card: LibraryCard, category: CardCategory) => void; acquiredIds?: Set<string>; enabledExpansionIds?: string[]; categoryOverride?: CardCategory; customTypes?: string[]; initialMode?: 'author' | 'catalog'; experiences?: ExperienceRef[]; quick?: boolean; destinations?: CardCategory[]; customCategories?: CustomCategory[] }) {
  const { category: liveCategory } = useCarousel();
  const category = categoryOverride ?? liveCategory;
  // v0.9.8: the sheet's "Add Gear" badge opens straight in catalog mode. v0.13.2 (#359): "Add Card" now
  // also passes onAcquire, so the "Add card from catalog" button shows in the author flow too (parity).
  const [mode, setMode] = useState<'author' | 'catalog'>(initialMode);
  // Whether the catalogue was reached from the card editor, so closing it can go back there
  // instead of discarding the flow (v0.28.0).
  const cameFromEditor = useRef(false);
  // v0.24.3: quick mode until the player asks for Advanced (which carries the draft across).
  const [simple, setSimple] = useState(quick);
  const [handoff, setHandoff] = useState<CardDraft | undefined>(undefined);
  // A finished draft waiting on its destination. Held here so BOTH editors ask the same question.
  const [pending, setPending] = useState<CardDraft | null>(null);
  // v0.30.0: cards read out of a `.rune`, waiting on the same destination question an authored card
  // gets. One card or fifty, the flow is identical, because the person sending them should not have
  // to know which kind of file they exported.
  const [imported, setImported] = useState<LibraryCard[] | null>(null);
  const doImport = useCallback(() => {
    void (async () => {
      try {
        const cards = await pickCards();
        if (!cards) return; // cancelled
        if (!onAcquireCustom) { showToast('Cards cannot be imported here.', 'error'); return; }
        setImported(cards);
      } catch (e) {
        showToast(e instanceof Error ? e.message : 'That file could not be read.', 'error');
      }
    })();
  }, [onAcquireCustom]);
  // Beastform is Druid-only and not player-authored (#242 item 5): block New Card here.
  if (category === 'wildshape') {
    return (
      <OverlayShell title="Beastform" subtitle="Druid transformation deck" onClose={onCancel} scroll={false}>
        <Text style={{ color: Rune.muted, fontSize: 13, fontFamily: Body.regular, lineHeight: 19 }}>
          Beastform cards can&apos;t be created — they&apos;re the Druid&apos;s built-in transformations. Switch to another card category to author a custom card.
        </Text>
      </OverlayShell>
    );
  }
  // Martial Form is the Martial Artist's built-in stance sheet (#357): same rule as Beastform.
  if (category === 'martialform') {
    return (
      <OverlayShell title="Martial Form" subtitle="Martial Artist stance deck" onClose={onCancel} scroll={false}>
        <Text style={{ color: Rune.muted, fontSize: 13, fontFamily: Body.regular, lineHeight: 19 }}>
          Martial Form cards can&apos;t be created — they&apos;re the Martial Artist&apos;s built-in stances. Switch to another card category to author a custom card.
        </Text>
      </OverlayShell>
    );
  }
  // The destination prompt. With no list to offer (a caller that hasn't wired it) the authored
  // category stands, so a missing prop can never strand a finished card.
  const finish = (draft: CardDraft) => {
    if (destinations.length === 0) { onSave(draft, category); return; }
    setPending(draft);
  };
  if (pending) {
    return (
      <CardDestination
        cardTitle={pending.title.trim() || undefined}
        categories={destinations}
        customCategories={customCategories}
        suggested={destinations.includes(category) ? category : undefined}
        cancelLabel="Back"
        onPick={(key) => { setPending(null); onSave(pending, key); }}
        onCancel={() => setPending(null)}
      />
    );
  }
  if (imported) {
    // The whole stack lands in one deck. Asking per card would be a wall of the same question, and
    // moving one afterwards is a hold away.
    return (
      <CardDestination
        cardTitle={imported.length === 1 ? imported[0].title.trim() || undefined : `${imported.length} cards`}
        categories={destinations.length ? destinations : [category]}
        customCategories={customCategories}
        suggested={destinations.includes(category) ? category : undefined}
        cancelLabel="Back"
        onPick={(key) => {
          const cards = imported;
          setImported(null);
          for (const c of cards) {
            // A system card travels as a tiny reference, never as bytes, so resolve it back to the
            // real bundled card (true art, working modifiers) exactly as the NFC ceremony does.
            // Without this it would arrive as a flat copy of its text.
            if (c.catalogId && onAcquire && (cardById(c.catalogId) || lootById(c.catalogId))) onAcquire(c.catalogId, key);
            else onAcquireCustom?.(c, key);
          }
          onCancel();
        }}
        onCancel={() => setImported(null)}
      />
    );
  }
  if (mode === 'catalog' && onAcquire) {
    // #328: route the catalog card to the category being added to (the Cards-panel per-category Add
    // button, or the current carousel category from the float menu) — not a hardcoded deck.
    // v0.28.0: the catalogue's bottom button is the Multi-Card toggle now, so the way BACK has to be
    // the close control. When the catalogue was opened from the card editor, closing returns to the
    // editor rather than throwing the whole flow away; opened directly, it closes as before.
    return <GearBrowser acquiredIds={acquiredIds ?? new Set()} enabledExpansionIds={enabledExpansionIds} onAdd={(id) => onAcquire(id, category)} onAddCustom={onAcquireCustom ? (card) => onAcquireCustom(card, category) : undefined} onClose={cameFromEditor.current ? () => { cameFromEditor.current = false; setMode('author'); } : onCancel} />;
  }
  const defaultType = defaultTypeForCategory(category);
  const typeGroups = typePickerGroups(customTypes);
  if (simple) {
    return (
      <QuickCardFlow
        initial={handoff}
        onSave={finish}
        onCancel={onCancel}
        onAdvanced={(d) => { setHandoff(d); setSimple(false); }}
        onImport={onAcquireCustom ? doImport : undefined}
        // v0.31.0: the quick flow can set the type too. The DEFAULT is still "Card" (see its own
        // save handler) — this only gives the player somewhere to say otherwise without leaving.
        typeGroups={typeGroups}
      />
    );
  }
  // The catalog (system gear/loot) suits the gear-bearing decks + custom categories, not Notes.
  const showsCatalog = onAcquire && category !== 'notes';
  const catalogBtn = showsCatalog
    ? <RuneButton label="Add card from catalog →" kind="ghost" dense height={36} onPress={() => { cameFromEditor.current = true; setMode('catalog'); }} />
    : undefined;
  return <CardEditor initial={handoff} kindLabel={defaultType} typeGroups={typeGroups} extraField={catalogBtn} scrimless saveLabel="Create card" experiences={experiences} onSave={finish} onCancel={onCancel} />;
}
