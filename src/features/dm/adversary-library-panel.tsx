/**
 * Adversary library picker (v0.16.0, PRD #10/#17) — browse saved combatant templates in a summary list
 * (expandable to details) and spawn one into the encounter as an adversary OR an ally NPC. Delete via the
 * row X. Mirrors the player-summary layout.
 */
import { useState } from 'react';
import { FlatList, Pressable, Text, View } from 'react-native';
import Svg, { Line, Polyline } from 'react-native-svg';

import { ChamferBox } from '@/components/chamfer-box';
import { FitLine } from '@/components/fit-line';
import { RuneButton } from '@/components/rune-button';
import { Body, Display, DmRune } from '@/constants/theme';
import { type SavedAdversary } from '@/lib/adversary-library';
import { StatGlyph } from './stat-glyphs';
import { DmModal } from './dm-ui';

function Row({ t, onAdversary, onAlly, onDelete }: { t: SavedAdversary; onAdversary: () => void; onAlly: () => void; onDelete: () => void }) {
  const [open, setOpen] = useState(false);
  return (
    <ChamferBox chamfer={10} fill="rgba(18,15,15,0.92)" stroke={DmRune.line} strokeWidth={1.2} style={{ paddingHorizontal: 12, paddingVertical: 10, gap: 8 }}>
      <Pressable onPress={() => setOpen((o) => !o)} accessibilityRole="button" accessibilityLabel={`${t.name}, ${open ? 'collapse' : 'expand'}`} style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
        <FitLine style={{ flex: 1, color: DmRune.ivory, fontSize: 15, fontFamily: Display.black, letterSpacing: 0.5, textTransform: 'uppercase' }}>{t.name}</FitLine>
        {t.show.hp ? <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}><StatGlyph kind="hp" size={14} filled /><Text style={{ color: DmRune.text, fontSize: 13, fontFamily: Body.bold }}>{t.maxHp ?? 0}</Text></View> : null}
        <Pressable onPress={onDelete} hitSlop={8} accessibilityRole="button" accessibilityLabel={`Delete ${t.name}`}>
          <Svg width={14} height={14} viewBox="0 0 16 16"><Line x1={3} y1={3} x2={13} y2={13} stroke={DmRune.red} strokeWidth={2} /><Line x1={13} y1={3} x2={3} y2={13} stroke={DmRune.red} strokeWidth={2} /></Svg>
        </Pressable>
        <Svg width={12} height={12} viewBox="0 0 16 16" style={{ transform: [{ rotate: open ? '90deg' : '0deg' }] }}><Polyline points="5,3 11,8 5,13" fill="none" stroke={DmRune.accentDim} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" /></Svg>
      </Pressable>
      {open ? (
        <View style={{ gap: 6, borderTopWidth: 1, borderTopColor: DmRune.line, paddingTop: 8 }}>
          <View style={{ flexDirection: 'row', gap: 18, flexWrap: 'wrap' }}>
            {t.show.hp ? <Text style={{ color: DmRune.muted, fontSize: 11, fontFamily: Body.bold }}>HP {t.maxHp ?? 0}</Text> : null}
            {t.show.stress ? <Text style={{ color: DmRune.muted, fontSize: 11, fontFamily: Body.bold }}>Stress {t.maxStress ?? 0}</Text> : null}
            {t.show.thresholds ? <Text style={{ color: DmRune.muted, fontSize: 11, fontFamily: Body.bold }}>Thr {t.thresholds?.major ?? 0}/{t.thresholds?.severe ?? 0}</Text> : null}
          </View>
          {t.show.description && t.description ? <Text style={{ color: DmRune.muted, fontSize: 12, fontFamily: Body.regular, lineHeight: 16 }}>{t.description}</Text> : null}
        </View>
      ) : null}
      <View style={{ flexDirection: 'row', gap: 8 }}>
        <RuneButton label="+ Adversary" kind="secondary" height={34} dense dm style={{ flex: 1 }} onPress={onAdversary} />
        <RuneButton label="+ Ally" kind="ghost" height={34} dense dm style={{ flex: 1 }} onPress={onAlly} />
      </View>
    </ChamferBox>
  );
}

export function AdversaryLibraryPanel({ templates, onAddAdversary, onAddAlly, onDelete, onClose }: { templates: SavedAdversary[]; onAddAdversary: (t: SavedAdversary) => void; onAddAlly: (t: SavedAdversary) => void; onDelete: (id: string) => void; onClose: () => void }) {
  return (
    <DmModal onClose={onClose}>
      <ChamferBox chamfer={14} fill="rgba(12,15,20,0.99)" stroke={DmRune.lineStrong} strokeWidth={1.5} style={{ width: 340, maxHeight: 560, padding: 18 }}>
        <Text style={{ color: DmRune.ivory, fontSize: 16, fontFamily: Display.black, letterSpacing: 1, textTransform: 'uppercase', marginBottom: 12 }}>Adversary Library</Text>
        {templates.length === 0 ? (
          <Text style={{ color: DmRune.muted, fontSize: 13, fontFamily: Body.medium, marginVertical: 18, textAlign: 'center' }}>No saved adversaries yet. Hold one adversary in an encounter and choose Save to Library.</Text>
        ) : (
          <FlatList data={templates} keyExtractor={(t) => t.id} contentContainerStyle={{ gap: 10 }} showsVerticalScrollIndicator={false} renderItem={({ item }) => (
            <Row t={item} onAdversary={() => onAddAdversary(item)} onAlly={() => onAddAlly(item)} onDelete={() => onDelete(item.id)} />
          )} />
        )}
        <View style={{ marginTop: 14 }}><RuneButton label="Close" kind="secondary" height={44} dm onPress={onClose} /></View>
      </ChamferBox>
    </DmModal>
  );
}
