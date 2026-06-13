import { useState } from 'react';
import { Text, View } from 'react-native';

import { CardEditor, type CardDraft } from '@/components/card-editor';
import { RuneButton } from '@/components/rune-button';
import { Body, Rune } from '@/constants/theme';

export type CardTarget = 'inventory' | 'arsenal' | 'both';

/**
 * New Card (#164): the card editor plus a target picker that routes the finished card to the
 * Inventory deck, the Arsenal (abilities) deck, or both. The kind label updates with the target so
 * the live preview reads correctly ("Item" / "Ability" / "Card").
 */
export function NewCardFlow({ onSave, onCancel }: { onSave: (draft: CardDraft, target: CardTarget) => void; onCancel: () => void }) {
  const [target, setTarget] = useState<CardTarget>('inventory');
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
    </View>
  );
  const kindLabel = target === 'arsenal' ? 'Ability' : target === 'both' ? 'Card' : 'Item';
  return <CardEditor kindLabel={kindLabel} extraField={selector} saveLabel="Create card" onSave={(d) => onSave(d, target)} onCancel={onCancel} />;
}
