import { useState } from 'react';

import { Text } from 'react-native';

import { CardEditor, type CardDraft } from '@/components/card-editor';
import { RuneButton } from '@/components/rune-button';
import { Body, Rune } from '@/constants/theme';

import type { CardCategory } from '../card-data';
import { useCarousel } from '../carousel-context';
import { GearBrowser } from './gear-browser';
import { OverlayShell } from './overlay-shell';

/** Where a created card lands. `notes` (#214) is the Notes deck; the others ride inventory/arsenal. */
export type CardTarget = 'inventory' | 'arsenal' | 'both' | 'notes';

/** The category currently being viewed decides where the card goes (#214) — no more deck picker. */
const CATEGORY_TARGET: Record<CardCategory, CardTarget> = {
  abilities: 'arsenal',
  inventory: 'inventory',
  notes: 'notes',
  wildshape: 'arsenal', // Druids can't author Wild Shape cards — fall back to an Arsenal card
};

/** Type-chip options per category (#214): the first is the default; tap the card's plaque to cycle. */
const TYPE_OPTIONS: Record<CardCategory, string[]> = {
  abilities: ['Ability', 'Skill', 'Weapon', 'Spell', 'Trick', 'Maneuver'],
  // Armor (#242 item 5): a custom armor item — pair the 'Armor' type with Set Major/Severe Threshold +
  // Armor Score effects in the editor to make a working piece of armor.
  inventory: ['Item', 'Armor', 'Tool', 'Treasure', 'Key', 'Trinket', 'Supply', 'Relic'],
  notes: ['Note', 'Reminder', 'Important', 'Story', 'Place', 'Person', 'Quest'],
  wildshape: ['Ability', 'Skill', 'Trick'],
};

/**
 * New Card (#164/#214): author a custom card. The card is created in the category the player is
 * CURRENTLY viewing (no destination picker) — its "type" is a tappable chip on the card itself
 * (e.g. Note → Reminder → Story). Gear-bearing categories also expose the system catalog browser.
 */
export function NewCardFlow({ onSave, onCancel, onAcquire, acquiredIds }: { onSave: (draft: CardDraft, target: CardTarget) => void; onCancel: () => void; onAcquire?: (id: string) => void; acquiredIds?: Set<string> }) {
  const { category } = useCarousel();
  const [mode, setMode] = useState<'author' | 'catalog'>('author');
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
  if (mode === 'catalog' && onAcquire) {
    return <GearBrowser acquiredIds={acquiredIds ?? new Set()} onAdd={onAcquire} onBack={() => setMode('author')} onClose={onCancel} />;
  }
  const target = CATEGORY_TARGET[category];
  const typeOptions = TYPE_OPTIONS[category];
  // The catalog (system gear/loot) only makes sense for the gear-bearing decks, not Notes/Wild Shape.
  const catalogBtn = onAcquire && (category === 'inventory' || category === 'abilities')
    ? <RuneButton label="Add gear & loot from the catalog →" kind="ghost" dense height={36} onPress={() => setMode('catalog')} />
    : undefined;
  return <CardEditor kindLabel={typeOptions[0]} typeOptions={typeOptions} extraField={catalogBtn} scrimless saveLabel="Create card" onSave={(d) => onSave(d, target)} onCancel={onCancel} />;
}
