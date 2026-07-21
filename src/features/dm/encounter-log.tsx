/**
 * Encounter log (v0.15.0, PRD #43-45) — markdown entries newest-first. The DM adds free notes; stat
 * changes are appended automatically by the encounter (one per hold). Shown as an overlay panel.
 */
import { useState } from 'react';
import { FlatList, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import Svg, { Line } from 'react-native-svg';

import { CardMarkdownBody } from '@/components/card-markdown';
import { ChamferBox } from '@/components/chamfer-box';
import { RuneButton } from '@/components/rune-button';
import { Body, Display, DmRune } from '@/constants/theme';
import { type LogEntry } from '@/lib/session';

function NoteDialog({ onConfirm, onCancel }: { onConfirm: (text: string) => void; onCancel: () => void }) {
  const [text, setText] = useState('');
  return (
    <View style={[StyleSheet.absoluteFill, { zIndex: 320, alignItems: 'center', justifyContent: 'center' }]}>
      <Pressable style={[StyleSheet.absoluteFill, { backgroundColor: 'rgba(6,8,13,0.86)' }]} onPress={onCancel} accessibilityRole="button" accessibilityLabel="Dismiss" />
      <ChamferBox chamfer={14} fill="rgba(12,15,20,0.99)" stroke={DmRune.lineStrong} strokeWidth={1.5} style={{ width: 330, padding: 20 }}>
        <Text style={{ color: DmRune.ivory, fontSize: 16, fontFamily: Display.black, letterSpacing: 1, textTransform: 'uppercase' }}>New note</Text>
        <ChamferBox chamfer={6} fill="rgba(20,24,30,0.9)" stroke={DmRune.line} strokeWidth={1.1} style={{ minHeight: 92, paddingHorizontal: 12, paddingVertical: 9, marginTop: 14 }}>
          <TextInput value={text} onChangeText={setText} placeholder="What happened…  (**markdown** supported)" placeholderTextColor={DmRune.muted} autoFocus multiline maxLength={600} style={{ color: DmRune.text, fontSize: 15, fontFamily: Body.regular, textAlignVertical: 'top', minHeight: 74 }} />
        </ChamferBox>
        <View style={{ flexDirection: 'row', gap: 10, marginTop: 18 }}>
          <RuneButton label="Cancel" kind="ghost" height={42} dm style={{ flex: 1 }} onPress={onCancel} />
          <RuneButton label="Add" kind="secondary" height={42} dm disabled={!text.trim()} style={{ flex: 1 }} onPress={() => onConfirm(text.trim())} />
        </View>
      </ChamferBox>
    </View>
  );
}

export function EncounterLog({ log, onAddNote, onClose }: { log: LogEntry[]; onAddNote: (text: string) => void; onClose: () => void }) {
  const [noting, setNoting] = useState(false);
  return (
    <View style={[StyleSheet.absoluteFill, { zIndex: 300, backgroundColor: 'rgba(6,8,13,0.95)', paddingHorizontal: 18, paddingTop: 56, paddingBottom: 20 }]}>
      <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 12 }}>
        <Text style={{ flex: 1, color: DmRune.ivory, fontSize: 17, fontFamily: Display.black, letterSpacing: 2, textTransform: 'uppercase' }}>Log</Text>
        <Pressable onPress={onClose} hitSlop={10} accessibilityRole="button" accessibilityLabel="Close log">
          <Svg width={20} height={20} viewBox="0 0 20 20"><Line x1={4} y1={4} x2={16} y2={16} stroke={DmRune.accent} strokeWidth={2.2} /><Line x1={16} y1={4} x2={4} y2={16} stroke={DmRune.accent} strokeWidth={2.2} /></Svg>
        </Pressable>
      </View>
      {log.length === 0 ? (
        <Text style={{ color: DmRune.muted, fontSize: 13, fontFamily: Body.medium, textAlign: 'center', marginTop: 30 }}>No entries yet. Add a note, or toggle Auto-log to record stat changes.</Text>
      ) : (
        <FlatList
          data={log}
          keyExtractor={(e) => e.id}
          contentContainerStyle={{ gap: 8, paddingBottom: 10 }}
          renderItem={({ item }) => (
            <ChamferBox chamfer={8} fill={item.kind === 'note' ? 'rgba(16,20,26,0.9)' : 'rgba(14,17,22,0.8)'} stroke={item.kind === 'note' ? DmRune.line : 'rgba(196,200,208,0.28)'} strokeWidth={1.1} style={{ paddingHorizontal: 12, paddingVertical: 9 }}>
              <CardMarkdownBody body={item.text} style={{ color: DmRune.text, fontSize: 13, fontFamily: Body.regular, lineHeight: 18 }} />
              <Text style={{ color: DmRune.muted, fontSize: 9, fontFamily: Body.medium, marginTop: 5 }}>{new Date(item.at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</Text>
            </ChamferBox>
          )}
        />
      )}
      <View style={{ paddingTop: 10 }}>
        <RuneButton label="Add note" kind="primary" height={46} dm onPress={() => setNoting(true)} />
      </View>
      {noting ? <NoteDialog onConfirm={(t) => { setNoting(false); onAddNote(t); }} onCancel={() => setNoting(false)} /> : null}
    </View>
  );
}
