import { Text, View } from 'react-native';

import { Body, Display, Rune } from '@/constants/theme';
import { type CharacterFile, experienceBreakdown, sheetBreakdown } from '@/lib/character-file';
import { type Contribution, EFFECT_TARGETS, TARGET_LABEL } from '@/lib/modifiers';

import { OverlayShell } from './overlay-shell';

const signed = (n: number) => (n >= 0 ? `+${n}` : `${n}`);

/**
 * The Modifiers panel (#175) — replaces the old Settings panel. Read-only: for every sheet stat it
 * shows the character's BASE value, then, in application order, each enabled card's contribution (and
 * the card responsible), and the final (capped) total. No manual stat editing — cards do it all now.
 */
export function ModifiersPanel({ file, onClose }: { file: CharacterFile; onClose: () => void }) {
  const sheet = sheetBreakdown(file);
  const exps = experienceBreakdown(file);
  const enabledCount = (file.enabledCardIds ?? []).length;
  const subtitle = enabledCount > 0 ? `${enabledCount} card${enabledCount === 1 ? '' : 's'} equipped` : 'No cards equipped';
  return (
    <OverlayShell title="Modifiers" subtitle={subtitle} onClose={onClose}>
      {enabledCount === 0 ? (
        <Text style={{ color: Rune.muted, fontSize: 12.5, fontFamily: Body.regular, lineHeight: 18, marginBottom: 2 }}>
          Press and hold a card in the carousel to equip it — its modifiers will appear here, layered on your base stats.
        </Text>
      ) : null}
      {EFFECT_TARGETS.map((t) => (
        <StatCard key={t} label={TARGET_LABEL[t]} b={sheet[t]} />
      ))}
      {/* v0.14.0: Experiences are per-instance, so they can't be rows of the target-keyed breakdown —
          they get their own section, showing the level-up advancements and any card (the Honing Relic)
          that boosts one. Omitted entirely when the character has no Experiences. */}
      {exps.length ? (
        <>
          <Text style={{ color: Rune.goldText, fontSize: 12, fontFamily: Body.bold, letterSpacing: 1, textTransform: 'uppercase', marginTop: 6 }}>Experiences</Text>
          {exps.map((e) => (
            <StatCard key={e.id} label={e.title || 'Experience'} b={e} />
          ))}
        </>
      ) : null}
    </OverlayShell>
  );
}

/** One stat's row: base, each contribution in application order with its source, and the capped total. */
function StatCard({ label, b }: { label: string; b: { base: number; contributions: Contribution[]; total: number; cap?: number } }) {
  const has = b.contributions.length > 0;
  const capped = b.cap != null && b.base + b.contributions.reduce((s, c) => s + c.delta, 0) > b.cap;
  return (
    // Plain View, NOT ChamferBox: 14 per-row SVGs in the ScrollView caused the scroll lag (#191).
    <View style={{ paddingVertical: 10, paddingHorizontal: 13, borderRadius: 4, backgroundColor: 'rgba(20,24,31,0.6)', borderWidth: has ? 1.3 : 1, borderColor: has ? Rune.red : 'rgba(218,162,73,0.35)' }}>
      <View style={{ flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between' }}>
        <Text style={{ flex: 1, color: Rune.sheet, fontSize: 13.5, fontFamily: Body.bold, paddingRight: 8 }}>{label}</Text>
        <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 8 }}>
          {has ? <Text style={{ color: Rune.muted, fontSize: 11, fontFamily: Body.regular }}>{`base ${signed(b.base).replace('+', '')}`}</Text> : null}
          <Text style={{ color: has ? Rune.goldBright : Rune.sheet, fontSize: 19, fontFamily: Display.black }}>{b.total}</Text>
        </View>
      </View>
      {b.contributions.map((c, i) => (
        <View key={i} style={{ flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', marginTop: 4 }}>
          <Text style={{ flex: 1, color: Rune.muted, fontSize: 11, fontFamily: Body.medium, paddingRight: 8 }}>
            {c.source}{c.note ? ` · ${c.note}` : ''}
          </Text>
          <Text style={{ color: c.delta >= 0 ? Rune.goldText : '#E2705A', fontSize: 13, fontFamily: Body.bold }}>{signed(c.delta)}</Text>
        </View>
      ))}
      {capped ? <Text style={{ color: Rune.muted, fontSize: 10, fontFamily: Body.italic, marginTop: 3 }}>{`capped at ${b.cap}`}</Text> : null}
    </View>
  );
}
