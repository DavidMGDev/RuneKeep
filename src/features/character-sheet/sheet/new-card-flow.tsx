import { useState } from 'react';

import { Text } from 'react-native';

import { CardEditor, type CardDraft } from '@/components/card-editor';
import { RuneButton } from '@/components/rune-button';
import { Body, Rune } from '@/constants/theme';

import { type LibraryCard } from '@/lib/library';

import { type CardCategory } from '../card-data';
import { defaultTypeForCategory, typePickerGroups } from '../card-types';
import { useCarousel } from '../carousel-context';
import { GearBrowser } from './gear-browser';
import { OverlayShell } from './overlay-shell';

/** Where a created card lands. `notes` (#214) is the Notes deck; the others ride inventory/arsenal. */
export type CardTarget = 'inventory' | 'arsenal' | 'both' | 'notes';

/**
 * New Card (#164/#214/#246): author a custom card into a CATEGORY (the one being viewed, or an
 * explicit `categoryOverride` from the Card Management panel's per-category add button). Its "type"
 * (middle ribbon) is chosen from a picker of built-in + custom types. Gear-bearing categories also
 * expose the system catalog browser. The save handler receives the resolved category KEY.
 */
export function NewCardFlow({ onSave, onCancel, onAcquire, onAcquireCustom, acquiredIds, enabledExpansionIds, categoryOverride, customTypes = [], initialMode = 'author' }: { onSave: (draft: CardDraft, categoryKey: CardCategory) => void; onCancel: () => void; onAcquire?: (id: string, category: CardCategory) => void; onAcquireCustom?: (card: LibraryCard, category: CardCategory) => void; acquiredIds?: Set<string>; enabledExpansionIds?: string[]; categoryOverride?: CardCategory; customTypes?: string[]; initialMode?: 'author' | 'catalog' }) {
  const { category: liveCategory } = useCarousel();
  const category = categoryOverride ?? liveCategory;
  // v0.9.8: the sheet's "Add Gear" badge opens straight in catalog mode; "Add Card" omits onAcquire so
  // the catalog option is hidden entirely (pure author flow).
  const [mode, setMode] = useState<'author' | 'catalog'>(initialMode);
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
  if (mode === 'catalog' && onAcquire) {
    // #328: route the catalog card to the category being added to (the Cards-panel per-category Add
    // button, or the current carousel category from the float menu) — not a hardcoded deck.
    return <GearBrowser acquiredIds={acquiredIds ?? new Set()} enabledExpansionIds={enabledExpansionIds} onAdd={(id) => onAcquire(id, category)} onAddCustom={onAcquireCustom ? (card) => onAcquireCustom(card, category) : undefined} onBack={() => setMode('author')} onClose={onCancel} />;
  }
  const defaultType = defaultTypeForCategory(category);
  const typeGroups = typePickerGroups(customTypes);
  // The catalog (system gear/loot) suits the gear-bearing decks + custom categories, not Notes.
  const showsCatalog = onAcquire && category !== 'notes';
  const catalogBtn = showsCatalog
    ? <RuneButton label="Add card from catalog →" kind="ghost" dense height={36} onPress={() => setMode('catalog')} />
    : undefined;
  return <CardEditor kindLabel={defaultType} typeGroups={typeGroups} extraField={catalogBtn} scrimless saveLabel="Create card" onSave={(d) => onSave(d, category)} onCancel={onCancel} />;
}
