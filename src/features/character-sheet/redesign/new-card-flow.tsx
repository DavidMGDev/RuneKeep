import { useState } from 'react';
import { Text, View } from 'react-native';

import { CardEditor, type CardDraft } from '@/components/card-editor';
import { RuneButton } from '@/components/rune-button';
import { Body, Rune } from '@/constants/theme';

import { GearBrowser } from './gear-browser';

export type CardTarget = 'inventory' | 'arsenal' | 'both';

/**
 * New Card (#164/#180): author a custom card (editor + a target picker routing it to Inventory /
 * Arsenal / Both), OR switch to the catalog browser to add system gear/loot to the decks. The kind
 * label updates with the target so the live preview reads correctly ("Item" / "Ability" / "Card").
 */
export function NewCardFlow({ onSave, onCancel, onAcquire, acquiredIds }: { onSave: (draft: CardDraft, target: CardTarget) => void; onCancel: () => void; onAcquire?: (id: string) => void; acquiredIds?: Set<string> }) {
  const [target, setTarget] = useState<CardTarget>('inventory');
  const [mode, setMode] = useState<'author' | 'catalog'>('author');
  if (mode === 'catalog' && onAcquire) {
    return <GearBrowser acquiredIds={acquiredIds ?? new Set()} onAdd={onAcquire} onBack={() => setMode('author')} onClose={onCancel} />;
  }
  const opts: [CardTarget, string][] = [
    ['inventory', 'Inventory'],
    ['arsenal', 'Arsenal'],
    ['both', 'Both'],
  ];
  const selector = (
    <View style={{ gap: 6, marginTop: 2 }}>
      <Text style={{ color: Rune.bronze, fontSize: 11, fontFamily: Body.bold, letterSpacing: 0.8, textTransform: 'uppercase' }}>Appears in</Text>
      <View style={{ flexDirection: 'row', gap: 8 }}>
        {opts.map(([k, l]) => (
          <RuneButton key={k} label={l} kind={target === k ? 'primary' : 'ghost'} dense height={36} style={{ flex: 1 }} onPress={() => setTarget(k)} />
        ))}
      </View>
      {onAcquire ? <RuneButton label="Add gear & loot from the catalog →" kind="ghost" dense height={36} onPress={() => setMode('catalog')} /> : null}
    </View>
  );
  const kindLabel = target === 'arsenal' ? 'Ability' : target === 'both' ? 'Card' : 'Item';
  return <CardEditor kindLabel={kindLabel} extraField={selector} saveLabel="Create card" onSave={(d) => onSave(d, target)} onCancel={onCancel} />;
}
