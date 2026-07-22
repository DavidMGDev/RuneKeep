/**
 * Encounter log (v0.15.0; reworked v0.16.0/v0.17.0) — a smooth, left-side sliding panel (item 7: the Log
 * button is on the left, so the panel enters from the left). The whole background fades to dim in step with
 * the slide (item 1 — no elastic bounce, no undimmed gap). Notes are markdown, tap-to-edit, and carry a
 * grabber to reorder them (item 3); auto/stat entries render flatter with no grabber. Holding EITHER kind
 * enters multi-select; bottom controls Delete selected / Leave only selected, both confirmed (item 3).
 */
import { useState } from 'react';
import { FlatList, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import Animated, { FadeIn, FadeOut, SlideInLeft, SlideOutLeft } from 'react-native-reanimated';
import Svg, { Line, Polyline } from 'react-native-svg';

import { CardMarkdownBody } from '@/components/card-markdown';
import { ChamferBox } from '@/components/chamfer-box';
import { PopupDialog } from '@/components/popup-dialog';
import { RuneButton } from '@/components/rune-button';
import { Body, Display, DmRune } from '@/constants/theme';
import { type LogEntry } from '@/lib/session';
import { DmModal } from './dm-ui';
import { useSelection } from './use-selection';

function NoteEditor({ initial, onSave, onDelete, onCancel }: { initial: string; onSave: (t: string) => void; onDelete?: () => void; onCancel: () => void }) {
  const [text, setText] = useState(initial);
  return (
    <DmModal onClose={onCancel}>
      <ChamferBox chamfer={14} fill="rgba(12,15,20,0.99)" stroke={DmRune.lineStrong} strokeWidth={1.5} style={{ width: 330, padding: 20 }}>
        <Text style={{ color: DmRune.ivory, fontSize: 16, fontFamily: Display.black, letterSpacing: 1, textTransform: 'uppercase' }}>{initial ? 'Edit note' : 'New note'}</Text>
        <ChamferBox chamfer={6} fill="rgba(20,24,30,0.9)" stroke={DmRune.line} strokeWidth={1.1} style={{ minHeight: 92, paddingHorizontal: 12, paddingVertical: 9, marginTop: 14 }}>
          <TextInput value={text} onChangeText={setText} placeholder="What happened this round?" placeholderTextColor={DmRune.muted} autoFocus multiline maxLength={600} style={{ color: DmRune.text, fontSize: 15, fontFamily: Body.regular, textAlignVertical: 'top', minHeight: 74 }} />
        </ChamferBox>
        <Text style={{ color: DmRune.muted, fontSize: 10, fontFamily: Body.regular, letterSpacing: 0.4, marginTop: 6 }}>Markdown supported</Text>
        <View style={{ flexDirection: 'row', gap: 10, marginTop: 14 }}>
          {onDelete ? <RuneButton label="Delete" kind="ghost" height={42} dm style={{ flex: 1 }} onPress={onDelete} /> : <RuneButton label="Cancel" kind="ghost" height={42} dm style={{ flex: 1 }} onPress={onCancel} />}
          <RuneButton label="Save" kind="secondary" height={42} dm disabled={!text.trim()} style={{ flex: 1 }} onPress={() => onSave(text.trim())} />
        </View>
      </ChamferBox>
    </DmModal>
  );
}

/** The reorder grabber shown only on note rows (item 3): move a note earlier (▲) or later (▼). */
function Grabber({ onUp, onDown }: { onUp: () => void; onDown: () => void }) {
  return (
    <View style={{ alignItems: 'center', justifyContent: 'center', gap: 2, paddingRight: 2 }}>
      <Pressable onPress={onUp} hitSlop={8} accessibilityRole="button" accessibilityLabel="Move note earlier">
        <Svg width={16} height={11} viewBox="0 0 16 11"><Polyline points="3,8 8,3 13,8" fill="none" stroke={DmRune.accentDim} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" /></Svg>
      </Pressable>
      <Svg width={14} height={8} viewBox="0 0 14 8"><Line x1={2} y1={2} x2={12} y2={2} stroke={DmRune.line} strokeWidth={1.4} /><Line x1={2} y1={6} x2={12} y2={6} stroke={DmRune.line} strokeWidth={1.4} /></Svg>
      <Pressable onPress={onDown} hitSlop={8} accessibilityRole="button" accessibilityLabel="Move note later">
        <Svg width={16} height={11} viewBox="0 0 16 11"><Polyline points="3,3 8,8 13,3" fill="none" stroke={DmRune.accentDim} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" /></Svg>
      </Pressable>
    </View>
  );
}

export function EncounterLog({
  log,
  onAddNote,
  onEditNote,
  onDeleteNote,
  onMoveNote,
  onDeleteEntries,
  onKeepOnly,
  onClose,
}: {
  log: LogEntry[];
  onAddNote: (text: string) => void;
  onEditNote: (id: string, text: string) => void;
  onDeleteNote: (id: string) => void;
  onMoveNote: (id: string, delta: number) => void;
  onDeleteEntries: (ids: Set<string>) => void;
  onKeepOnly: (ids: Set<string>) => void;
  onClose: () => void;
}) {
  const [editing, setEditing] = useState<LogEntry | null>(null);
  const [adding, setAdding] = useState(false);
  const [confirm, setConfirm] = useState<'delete' | 'keep' | null>(null);
  const sel = useSelection();

  return (
    <View style={[StyleSheet.absoluteFill, { zIndex: 300 }]}>
      {/* full-screen dim that fades in step with the slide (item 1) */}
      <Animated.View entering={FadeIn.duration(220)} exiting={FadeOut.duration(180)} style={StyleSheet.absoluteFill}>
        <Pressable style={[StyleSheet.absoluteFill, { backgroundColor: 'rgba(6,8,13,0.72)' }]} onPress={onClose} accessibilityRole="button" accessibilityLabel="Close log" />
      </Animated.View>
      {/* the panel slides in smoothly from the LEFT (item 7) */}
      <Animated.View entering={SlideInLeft.duration(240)} exiting={SlideOutLeft.duration(200)} style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: '82%' }}>
        <ChamferBox chamfer={0} fill="rgba(10,13,18,0.99)" stroke={DmRune.lineStrong} strokeWidth={1.4} style={{ flex: 1, paddingHorizontal: 16, paddingTop: 54, paddingBottom: 16 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 12 }}>
            <Text style={{ flex: 1, color: DmRune.ivory, fontSize: 17, fontFamily: Display.black, letterSpacing: 2, textTransform: 'uppercase' }}>Log</Text>
            <Pressable onPress={onClose} hitSlop={10} accessibilityRole="button" accessibilityLabel="Close log">
              <Svg width={20} height={20} viewBox="0 0 20 20"><Line x1={4} y1={4} x2={16} y2={16} stroke={DmRune.accent} strokeWidth={2.2} /><Line x1={16} y1={4} x2={4} y2={16} stroke={DmRune.accent} strokeWidth={2.2} /></Svg>
            </Pressable>
          </View>
          {log.length === 0 ? (
            <Text style={{ color: DmRune.muted, fontSize: 13, fontFamily: Body.medium, marginTop: 24 }}>No entries yet. Add a note, or toggle Auto-log to record stat changes.</Text>
          ) : (
            <FlatList
              data={log}
              keyExtractor={(e) => e.id}
              contentContainerStyle={{ gap: 8, paddingBottom: sel.selecting ? 76 : 10 }}
              renderItem={({ item, index }) => {
                const on = sel.ids.has(item.id);
                const isNote = item.kind === 'note';
                return (
                  <Pressable
                    onPress={() => { if (sel.selecting) sel.toggle(item.id); else if (isNote) setEditing(item); }}
                    onLongPress={() => (sel.selecting ? sel.toggle(item.id) : sel.start(item.id))}
                    delayLongPress={320}
                    accessibilityRole="button"
                    accessibilityLabel={isNote ? 'Note. Tap to edit, hold to select.' : 'Auto entry. Hold to select.'}>
                    <ChamferBox
                      chamfer={8}
                      fill={on ? 'rgba(196,200,208,0.16)' : isNote ? 'rgba(18,22,28,0.92)' : 'rgba(12,15,20,0.7)'}
                      stroke={on ? DmRune.accent : isNote ? DmRune.line : 'transparent'}
                      strokeWidth={on ? 1.8 : 1.1}
                      style={{ paddingHorizontal: 10, paddingVertical: 9, flexDirection: 'row', gap: 8, alignItems: 'center' }}>
                      {/* auto entries get a thin accent bar instead of a grabber, so the two kinds read differently */}
                      {isNote && !sel.selecting ? (
                        <Grabber onUp={() => onMoveNote(item.id, -1)} onDown={() => onMoveNote(item.id, 1)} />
                      ) : !isNote ? (
                        <View style={{ width: 3, alignSelf: 'stretch', backgroundColor: 'rgba(196,200,208,0.35)', borderRadius: 2 }} />
                      ) : null}
                      <View style={{ flex: 1 }}>
                        <CardMarkdownBody body={item.text} style={{ color: isNote ? DmRune.text : DmRune.muted, fontSize: isNote ? 13 : 12, fontFamily: Body.regular, lineHeight: isNote ? 18 : 16 }} />
                        <Text style={{ color: DmRune.muted, fontSize: 9, fontFamily: Body.bold, letterSpacing: 0.8, textTransform: 'uppercase', marginTop: 5 }}>{isNote ? 'Note' : 'Auto'} · {new Date(item.at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</Text>
                      </View>
                      {sel.selecting ? (
                        <ChamferBox chamfer={4} fill={on ? DmRune.accent : 'transparent'} stroke={DmRune.accentDim} strokeWidth={1.2} style={{ width: 20, height: 20, alignItems: 'center', justifyContent: 'center' }}>
                          {on ? <Svg width={11} height={11} viewBox="0 0 12 12"><Polyline points="2,6 5,9 10,3" fill="none" stroke={DmRune.ink} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" /></Svg> : null}
                        </ChamferBox>
                      ) : null}
                    </ChamferBox>
                  </Pressable>
                );
              }}
            />
          )}
          {!sel.selecting ? (
            <View style={{ paddingTop: 10 }}>
              <RuneButton label="Add note" kind="primary" height={46} dm onPress={() => setAdding(true)} />
            </View>
          ) : null}
        </ChamferBox>

        {/* bottom multi-select controls (item 3/4) — always at the bottom of the panel */}
        {sel.selecting ? (
          <View style={{ position: 'absolute', left: 12, right: 12, bottom: 16 }}>
            <ChamferBox chamfer={10} fill="rgba(20,24,30,0.98)" stroke={DmRune.accent} strokeWidth={1.4} style={{ padding: 10, gap: 8 }}>
              <Text style={{ color: DmRune.accent, fontSize: 11, fontFamily: Body.bold, letterSpacing: 1, textTransform: 'uppercase' }}>{sel.ids.size} selected</Text>
              <View style={{ flexDirection: 'row', gap: 8 }}>
                <RuneButton label="Delete" kind="primary" height={34} dense dm style={{ flex: 1 }} onPress={() => setConfirm('delete')} />
                <RuneButton label="Leave only" kind="secondary" height={34} dense dm style={{ flex: 1 }} onPress={() => setConfirm('keep')} />
                <RuneButton label="Cancel" kind="ghost" height={34} dense dm onPress={sel.clear} />
              </View>
            </ChamferBox>
          </View>
        ) : null}
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
      {confirm === 'delete' ? (
        <PopupDialog title="Delete selected?" body={`${sel.ids.size} log entr${sel.ids.size === 1 ? 'y' : 'ies'} will be removed.`} confirmLabel="Delete" destructive
          onConfirm={() => { onDeleteEntries(sel.ids); setConfirm(null); sel.clear(); }} onCancel={() => setConfirm(null)} />
      ) : null}
      {confirm === 'keep' ? (
        <PopupDialog title="Leave only selected?" body={`Everything except the ${sel.ids.size} selected entr${sel.ids.size === 1 ? 'y' : 'ies'} will be erased.`} confirmLabel="Leave only" destructive
          onConfirm={() => { onKeepOnly(sel.ids); setConfirm(null); sel.clear(); }} onCancel={() => setConfirm(null)} />
      ) : null}
    </View>
  );
}
