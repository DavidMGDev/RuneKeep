import { Text, View } from 'react-native';

import { ChamferBox } from '@/components/chamfer-box';
import { Body, Display, Rune } from '@/constants/theme';
import { type CharacterFile, sheetBreakdown } from '@/lib/character-file';
import { EFFECT_TARGETS, TARGET_LABEL } from '@/lib/modifiers';

import { OverlayShell } from './overlay-shell';

const signed = (n: number) => (n >= 0 ? `+${n}` : `${n}`);

/**
 * The Modifiers panel (#175) — replaces the old Settings panel. Read-only: for every sheet stat it
 * shows the character's BASE value, then, in application order, each enabled card's contribution (and
 * the card responsible), and the final (capped) total. No manual stat editing — cards do it all now.
 */
export function ModifiersPanel({ file, onClose }: { file: CharacterFile; onClose: () => void }) {
  const sheet = sheetBreakdown(file);
  const enabledCount = (file.enabledCardIds ?? []).length;
  const subtitle = enabledCount > 0 ? `${enabledCount} card${enabledCount === 1 ? '' : 's'} equipped` : 'No cards equipped';
  return (
    <OverlayShell title="Modifiers" subtitle={subtitle} onClose={onClose}>
      {enabledCount === 0 ? (
        <Text style={{ color: Rune.muted, fontSize: 12.5, fontFamily: Body.regular, lineHeight: 18, marginBottom: 2 }}>
          Press and hold a card in the carousel to equip it — its modifiers will appear here, layered on your base stats.
        </Text>
      ) : null}
      {EFFECT_TARGETS.map((t) => {
        const b = sheet[t];
        const has = b.contributions.length > 0;
        const capped = b.cap != null && b.base + b.contributions.reduce((s, c) => s + c.delta, 0) > b.cap;
        return (
          <ChamferBox key={t} chamfer={8} fill="rgba(20,24,31,0.6)" stroke={has ? Rune.red : 'rgba(218,162,73,0.35)'} strokeWidth={has ? 1.3 : 1} style={{ paddingVertical: 10, paddingHorizontal: 13 }}>
            <View style={{ flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between' }}>
              <Text style={{ color: Rune.sheet, fontSize: 13.5, fontFamily: Body.bold }}>{TARGET_LABEL[t]}</Text>
              <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 8 }}>
                {has ? <Text style={{ color: Rune.muted, fontSize: 11, fontFamily: Body.regular }}>{`base ${signed(b.base).replace('+', '')}`}</Text> : null}
                <Text style={{ color: has ? Rune.goldBright : Rune.sheet, fontSize: 19, fontFamily: Display.black }}>{b.total}</Text>
              </View>
            </View>
            {b.contributions.map((c, i) => (
              <View key={i} style={{ flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', marginTop: 4 }}>
                <Text numberOfLines={1} style={{ flex: 1, color: Rune.muted, fontSize: 11, fontFamily: Body.medium, paddingRight: 8 }}>
                  {c.source}{c.note ? ` · ${c.note}` : ''}
                </Text>
                <Text style={{ color: c.delta >= 0 ? Rune.goldText : '#E2705A', fontSize: 13, fontFamily: Body.bold }}>{signed(c.delta)}</Text>
              </View>
            ))}
            {capped ? <Text style={{ color: Rune.muted, fontSize: 10, fontFamily: Body.italic, marginTop: 3 }}>{`capped at ${b.cap}`}</Text> : null}
          </ChamferBox>
        );
      })}
    </OverlayShell>
  );
}
