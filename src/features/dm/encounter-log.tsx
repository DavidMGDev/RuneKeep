/**
 * Encounter log (v0.15.0; reworked v0.16.0, PRD #5/#18) — an animated 80%-width side panel. Notes are
 * markdown, tap-to-edit (with delete) and press-hold to move earlier; auto/stat entries are fixed-order
 * but multi-selectable for deletion (hold to enter selection). Slides in from the right.
 */
import { useState } from 'react';
import { FlatList, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import Animated, { FadeIn, FadeOut, SlideInRight, SlideOutRight } from 'react-native-reanimated';
import Svg, { Line } from 'react-native-svg';

import { CardMarkdownBody } from '@/components/card-markdown';
import { ChamferBox } from '@/components/chamfer-box';
import { RuneButton } from '@/components/rune-button';
import { Body, Display, DmRune } from '@/constants/theme';
import { type LogEntry } from '@/lib/session';
import { showToast } from '@/components/toast';
import { DmModal } from './dm-ui';
import { useSelection } from './use-selection';

function NoteEditor({ initial, onSave, onDelete, onCancel }: { initial: string; onSave: (t: string) => void; onDelete?: () => void; onCancel: () => void }) {
  const [text, setText] = useState(initial);
  return (
    <DmModal onClose={onCancel}>
      <ChamferBox chamfer={14} fill="rgba(12,15,20,0.99)" stroke={DmRune.lineStrong} strokeWidth={1.5} style={{ width: 330, padding: 20 }}>
        <Text style={{ color: DmRune.ivory, fontSize: 16, fontFamily: Display.black, letterSpacing: 1, textTransform: 'uppercase' }}>{initial ? 'Edit note' : 'New note'}</Text>
        <ChamferBox chamfer={6} fill="rgba(20,24,30,0.9)" stroke={DmRune.line} strokeWidth={1.1} style={{ minHeight: 92, paddingHorizontal: 12, paddingVertical: 9, marginTop: 14 }}>
          <TextInput value={text} onChangeText={setText} placeholder="What happened…  (**markdown** supported)" placeholderTextColor={DmRune.muted} autoFocus multiline maxLength={600} style={{ color: DmRune.text, fontSize: 15, fontFamily: Body.regular, textAlignVertical: 'top', minHeight: 74 }} />
        </ChamferBox>
        <View style={{ flexDirection: 'row', gap: 10, marginTop: 18 }}>
          {onDelete ? <RuneButton label="Delete" kind="ghost" height={42} dm style={{ flex: 1 }} onPress={onDelete} /> : <RuneButton label="Cancel" kind="ghost" height={42} dm style={{ flex: 1 }} onPress={onCancel} />}
          <RuneButton label="Save" kind="secondary" height={42} dm disabled={!text.trim()} style={{ flex: 1 }} onPress={() => onSave(text.trim())} />
        </View>
      </ChamferBox>
    </DmModal>
  );
}

export function EncounterLog({
  log,
  onAddNote,
  onEditNote,
  onDeleteNote,
  onMoveNoteUp,
  onDeleteEntries,
  onClose,
}: {
  log: LogEntry[];
  onAddNote: (text: string) => void;
  onEditNote: (id: string, text: string) => void;
  onDeleteNote: (id: string) => void;
  onMoveNoteUp: (id: string) => void;
  onDeleteEntries: (ids: Set<string>) => void;
  onClose: () => void;
}) {
  const [editing, setEditing] = useState<LogEntry | null>(null);
  const [adding, setAdding] = useState(false);
  const sel = useSelection();

  return (
    <View style={[StyleSheet.absoluteFill, { zIndex: 300, flexDirection: 'row' }]}>
      <Animated.View entering={FadeIn.duration(140)} exiting={FadeOut.duration(120)} style={{ flex: 1 }}>
        <Pressable style={{ flex: 1, backgroundColor: 'rgba(6,8,13,0.7)' }} onPress={onClose} accessibilityRole="button" accessibilityLabel="Close log" />
      </Animated.View>
      <Animated.View entering={SlideInRight.springify().damping(22).stiffness(180)} exiting={SlideOutRight.duration(180)} style={{ width: '80%' }}>
        <ChamferBox chamfer={0} fill="rgba(10,13,18,0.99)" stroke={DmRune.lineStrong} strokeWidth={1.4} style={{ flex: 1, paddingHorizontal: 16, paddingTop: 54, paddingBottom: 18 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 12 }}>
            <Text style={{ flex: 1, color: DmRune.ivory, fontSize: 17, fontFamily: Display.black, letterSpacing: 2, textTransform: 'uppercase' }}>Log</Text>
            {sel.selecting ? (
              <RuneButton label={`Delete ${sel.ids.size}`} kind="primary" height={30} dense dm onPress={() => { onDeleteEntries(sel.ids); sel.clear(); }} />
            ) : (
              <Pressable onPress={onClose} hitSlop={10} accessibilityRole="button" accessibilityLabel="Close log">
                <Svg width={20} height={20} viewBox="0 0 20 20"><Line x1={4} y1={4} x2={16} y2={16} stroke={DmRune.accent} strokeWidth={2.2} /><Line x1={16} y1={4} x2={4} y2={16} stroke={DmRune.accent} strokeWidth={2.2} /></Svg>
              </Pressable>
            )}
          </View>
          {log.length === 0 ? (
            <Text style={{ color: DmRune.muted, fontSize: 13, fontFamily: Body.medium, marginTop: 24 }}>No entries yet. Add a note, or toggle Auto-log to record stat changes.</Text>
          ) : (
            <FlatList
              data={log}
              keyExtractor={(e) => e.id}
              contentContainerStyle={{ gap: 8, paddingBottom: 10 }}
              renderItem={({ item }) => {
                const on = sel.ids.has(item.id);
                const isNote = item.kind === 'note';
                return (
                  <Pressable
                    onPress={() => { if (sel.selecting) sel.toggle(item.id); else if (isNote) setEditing(item); }}
                    onLongPress={() => { if (isNote && !sel.selecting) { onMoveNoteUp(item.id); showToast('Note moved up'); } else sel.start(item.id); }}
                    delayLongPress={340}
                    accessibilityRole="button"
                    accessibilityLabel={isNote ? `Note. Tap to edit, hold to move up` : `Auto entry. Hold to select`}>
                    <ChamferBox chamfer={8} fill={on ? 'rgba(196,200,208,0.14)' : isNote ? 'rgba(16,20,26,0.9)' : 'rgba(14,17,22,0.8)'} stroke={on ? DmRune.accent : isNote ? DmRune.line : 'rgba(196,200,208,0.28)'} strokeWidth={1.1} style={{ paddingHorizontal: 12, paddingVertical: 9, flexDirection: 'row', gap: 8, alignItems: 'flex-start' }}>
                      <View style={{ flex: 1 }}>
                        <CardMarkdownBody body={item.text} style={{ color: DmRune.text, fontSize: 13, fontFamily: Body.regular, lineHeight: 18 }} />
                        <Text style={{ color: DmRune.muted, fontSize: 9, fontFamily: Body.medium, marginTop: 5 }}>{item.kind === 'note' ? 'Note' : 'Auto'} · {new Date(item.at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</Text>
                      </View>
                    </ChamferBox>
                  </Pressable>
                );
              }}
            />
          )}
          <View style={{ paddingTop: 10 }}>
            <RuneButton label="Add note" kind="primary" height={46} dm onPress={() => setAdding(true)} />
          </View>
        </ChamferBox>
      </Animated.View>

      {adding ? <NoteEditor initial="" onSave={(t) => { setAdding(false); onAddNote(t); }} onCancel={() => setAdding(false)} /> : null}
      {editing ? (
        <NoteEditor
          initial={editing.text}
          onSave={(t) => { onEditNote(editing.id, t); setEditing(null); }}
          onDelete={() => { onDeleteNote(editing.id); setEditing(null); }}
          onCancel={() => setEditing(null)}
        />
      ) : null}
    </View>
  );
}
