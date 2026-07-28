/**
 * Encounter log (v0.15.0; reworked through v0.19.1) — a smooth, left-side sliding panel (item 7). The whole
 * background fades to dim in step with the slide (item 1). Notes are markdown, tap-to-edit, and carry a
 * DRAG HANDLE on the left (the grip lines) — press it and drag to reorder (v0.19.1 item 5: the grip is now
 * a standalone gesture OUTSIDE the row's tap Pressable, and the lift rides a SHARED VALUE so a drag no
 * longer re-renders — and tears down — its own gesture mid-move). A drop indicator shows where it will land;
 * rows reflow with a short, smooth (non-elastic, item 4) layout animation. Auto/stat entries render flatter
 * with no handle. Holding EITHER kind enters multi-select; bottom controls Delete selected / Leave only
 * selected, both confirmed (item 3).
 */
import { useCallback, useMemo, useRef, useState } from 'react';
import { LayoutChangeEvent, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { Gesture, GestureDetector, ScrollView } from 'react-native-gesture-handler';
import Animated, { Easing, FadeIn, FadeOut, LinearTransition, runOnJS, type SharedValue, SlideInLeft, SlideOutLeft, useAnimatedStyle, useSharedValue } from 'react-native-reanimated';
import Svg, { Line, Polyline } from 'react-native-svg';

import { CardMarkdownBody } from '@/components/card-markdown';
import { ChamferBox } from '@/components/chamfer-box';
import { PopupDialog } from '@/components/popup-dialog';
import { RuneButton } from '@/components/rune-button';
import { DmType, Body, Display, DmRune } from '@/constants/theme';
import { type LogEntry } from '@/lib/session';
import { playSfx } from '@/lib/sfx';
import { DimScreen } from '@/lib/screen-dim';
import { DmModal } from './dm-ui';
import { useSelection } from './use-selection';

// item 4: short, smooth reflow — no spring bounce.
const ROW_LAYOUT = LinearTransition.duration(170).easing(Easing.out(Easing.cubic));

function NoteEditor({ initial, onSave, onDelete, onCancel }: { initial: string; onSave: (t: string) => void; onDelete?: () => void; onCancel: () => void }) {
  const [text, setText] = useState(initial);
  return (
    <DmModal onClose={onCancel}>
      <ChamferBox chamfer={14} fill="rgba(12,15,20,0.99)" stroke={DmRune.lineStrong} strokeWidth={1.5} style={{ width: 330, padding: 20 }}>
        <Text style={{ color: DmRune.ivory, fontSize: DmType.title, fontFamily: Display.black, letterSpacing: 1, textTransform: 'uppercase' }}>{initial ? 'Edit note' : 'New note'}</Text>
        <ChamferBox chamfer={6} fill="rgba(20,24,30,0.9)" stroke={DmRune.line} strokeWidth={1.1} style={{ minHeight: 92, paddingHorizontal: 12, paddingVertical: 9, marginTop: 14 }}>
          <TextInput value={text} onChangeText={setText} placeholder="What happened this round?" placeholderTextColor={DmRune.muted} autoFocus multiline maxLength={600} style={{ color: DmRune.text, fontSize: DmType.title, fontFamily: Body.regular, textAlignVertical: 'top', minHeight: 74 }} />
        </ChamferBox>
        <Text style={{ color: DmRune.muted, fontSize: DmType.micro, fontFamily: Body.regular, letterSpacing: 0.4, marginTop: 6 }}>Markdown supported</Text>
        <View style={{ flexDirection: 'row', gap: 10, marginTop: 14 }}>
          {onDelete ? <RuneButton label="Delete" kind="ghost" height={42} dm style={{ flex: 1 }} onPress={onDelete} /> : <RuneButton label="Cancel" kind="ghost" height={42} dm style={{ flex: 1 }} onPress={onCancel} />}
          <RuneButton label="Save" kind="secondary" height={42} dm disabled={!text.trim()} style={{ flex: 1 }} onPress={() => onSave(text.trim())} />
        </View>
      </ChamferBox>
    </DmModal>
  );
}

/** The grip handle (drag lines) on note rows — no arrows (item 8). Its own gesture area (item 5). */
function GripLines() {
  return (
    // v0.23.0: 34dp wide, not 26. Combined with the RN ScrollView stealing the touch (now the
    // gesture-handler one), the handle was effectively unhittable.
    <View style={{ width: 34, alignSelf: 'stretch', alignItems: 'center', justifyContent: 'center', gap: 3 }}>
      {[0, 1, 2].map((i) => <View key={i} style={{ width: 15, height: 2, backgroundColor: DmRune.accentDim }} />)}
    </View>
  );
}

/** One log row. The dragged row's lift rides `dragY` (a shared value) so a drag never re-renders itself. */
function LogRow({ item, isNote, isDragged, selecting, on, showDropAbove, dragY, dragGesture, onPress, onLongPress, onLayout }: {
  item: LogEntry; isNote: boolean; isDragged: boolean; selecting: boolean; on: boolean; showDropAbove: boolean;
  dragY: SharedValue<number>; dragGesture: ReturnType<typeof Gesture.Pan>;
  onPress: () => void; onLongPress: () => void; onLayout: (e: LayoutChangeEvent) => void;
}) {
  const lift = useAnimatedStyle(() => ({
    transform: isDragged ? [{ translateY: dragY.value }, { scale: 1.03 }] : [],
    zIndex: isDragged ? 20 : 1,
    opacity: isDragged ? 0.94 : 1,
  }));
  return (
    <Animated.View layout={ROW_LAYOUT} onLayout={onLayout} style={[{ marginBottom: 8 }, lift]}>
      {showDropAbove ? <View style={{ height: 2, backgroundColor: DmRune.accent, borderRadius: 1, marginBottom: 8, marginHorizontal: 4 }} /> : null}
      <ChamferBox
        chamfer={8}
        fill={on ? 'rgba(196,200,208,0.16)' : isDragged ? 'rgba(28,33,42,0.98)' : isNote ? 'rgba(18,22,28,0.92)' : 'rgba(12,15,20,0.7)'}
        stroke={on ? DmRune.accent : isDragged ? DmRune.accent : isNote ? DmRune.line : 'transparent'}
        strokeWidth={on || isDragged ? 1.8 : 1.1}
        style={{ paddingRight: 10, paddingVertical: 9, flexDirection: 'row', gap: 8, alignItems: 'center' }}>
        {/* grip is its OWN gesture — a plain drag handle, NOT wrapped in the tap Pressable (item 5) */}
        {isNote && !selecting ? (
          <GestureDetector gesture={dragGesture}><GripLines /></GestureDetector>
        ) : !isNote ? (
          <View style={{ width: 3, alignSelf: 'stretch', marginLeft: 10, backgroundColor: 'rgba(196,200,208,0.35)', borderRadius: 2 }} />
        ) : (
          <View style={{ width: 34 }} />
        )}
        <Pressable
          onPress={onPress}
          onLongPress={onLongPress}
          delayLongPress={320}
          accessibilityRole="button"
          accessibilityLabel={isNote ? 'Note. Tap to edit, drag the handle to reorder, hold to select.' : 'Auto entry. Hold to select.'}
          style={{ flex: 1, flexDirection: 'row', gap: 8, alignItems: 'center' }}>
          <View style={{ flex: 1 }}>
            <CardMarkdownBody body={item.text} style={{ color: isNote ? DmRune.text : DmRune.muted, fontSize: isNote ? 13 : 12, fontFamily: Body.regular, lineHeight: isNote ? 18 : 16 }} />
            <Text style={{ color: DmRune.muted, fontSize: DmType.micro, fontFamily: Body.bold, letterSpacing: 0.8, textTransform: 'uppercase', marginTop: 5 }}>{isNote ? 'Note' : 'Auto'} · {new Date(item.at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</Text>
          </View>
          {selecting ? (
            <ChamferBox chamfer={4} fill={on ? DmRune.accent : 'transparent'} stroke={DmRune.accentDim} strokeWidth={1.2} style={{ width: 20, height: 20, alignItems: 'center', justifyContent: 'center' }}>
              {on ? <Svg width={11} height={11} viewBox="0 0 12 12"><Polyline points="2,6 5,9 10,3" fill="none" stroke={DmRune.ink} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" /></Svg> : null}
            </ChamferBox>
          ) : null}
        </Pressable>
      </ChamferBox>
    </Animated.View>
  );
}

export function EncounterLog({
  log,
  onAddNote,
  onEditNote,
  onDeleteNote,
  onReorder,
  onDeleteEntries,
  onKeepOnly,
  onClose,
}: {
  log: LogEntry[];
  onAddNote: (text: string) => void;
  onEditNote: (id: string, text: string) => void;
  onDeleteNote: (id: string) => void;
  onReorder: (id: string, toIndex: number) => void;
  onDeleteEntries: (ids: Set<string>) => void;
  onKeepOnly: (ids: Set<string>) => void;
  onClose: () => void;
}) {
  const [editing, setEditing] = useState<LogEntry | null>(null);
  const [adding, setAdding] = useState(false);
  const [confirm, setConfirm] = useState<'delete' | 'keep' | null>(null);
  const sel = useSelection();

  // drag-to-reorder state (item 5). The lift rides a SHARED VALUE (dragY) so moving a row never triggers a
  // React re-render — which previously rebuilt the row's gesture and killed the drag. dragFrom/dropIndex
  // change only at start/land, so they're cheap.
  const geom = useRef<{ y: number; h: number }[]>([]);
  const [dragFrom, setDragFrom] = useState(-1);
  const [dropIndex, setDropIndex] = useState(-1);
  const dragY = useSharedValue(0);
  const draggingSV = useSharedValue(0);
  const dragging = dragFrom >= 0;

  const logRef = useRef(log); logRef.current = log;
  const dragFromRef = useRef(-1); dragFromRef.current = dragFrom;

  const onRowLayout = useCallback((i: number) => (e: LayoutChangeEvent) => { geom.current[i] = { y: e.nativeEvent.layout.y, h: e.nativeEvent.layout.height }; }, []);

  const computeDrop = useCallback((from: number, ty: number) => {
    const g = geom.current;
    const len = logRef.current.length;
    if (!g[from]) return from;
    const center = g[from].y + g[from].h / 2 + ty;
    let idx = 0;
    for (let j = 0; j < len; j++) {
      if (j === from) continue;
      const gj = g[j]; if (!gj) continue;
      if (gj.y + gj.h / 2 < center) idx++;
    }
    return idx;
  }, []);

  const beginDrag = useCallback((i: number) => { setDragFrom(i); setDropIndex(i); playSfx('floatMenuOpen'); }, []);
  const updateDrop = useCallback((i: number, ty: number) => { const d = computeDrop(i, ty); setDropIndex((p) => (p === d ? p : d)); }, [computeDrop]);
  const endDrag = useCallback((i: number, ty: number) => {
    const to = computeDrop(i, ty);
    if (to !== i) { onReorder(logRef.current[i].id, to); playSfx('floatMenuHighlight'); }
    setDragFrom(-1); setDropIndex(-1);
  }, [computeDrop, onReorder]);

  // One stable gesture per index — memoized on log identity so it never changes DURING a drag (log can't
  // change mid-drag). Refs keep the callbacks stable, so the memo only rebuilds when entries add/remove.
  const gestures = useMemo(() => log.map((_, i) => Gesture.Pan()
    .activateAfterLongPress(140)
    .onStart(() => { 'worklet'; draggingSV.value = 1; dragY.value = 0; runOnJS(beginDrag)(i); })
    .onUpdate((e) => { 'worklet'; if (draggingSV.value !== 1) return; dragY.value = e.translationY; runOnJS(updateDrop)(i, e.translationY); })
    .onFinalize((e) => { 'worklet'; if (draggingSV.value !== 1) return; draggingSV.value = 0; dragY.value = 0; runOnJS(endDrag)(i, e.translationY); })),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [log, beginDrag, updateDrop, endDrag]);

  return (
    <View style={[StyleSheet.absoluteFill, { zIndex: 300 }]}>
      <Animated.View entering={FadeIn.duration(200)} exiting={FadeOut.duration(160)} style={StyleSheet.absoluteFill}>
        <Pressable style={[StyleSheet.absoluteFill, { backgroundColor: 'rgba(6,8,13,0.72)' }]} onPress={onClose} accessibilityRole="button" accessibilityLabel="Close log" />
        <DimScreen opacity={0.72} />
      </Animated.View>
      {/* item 4: short, smooth slide — no elastic spring. */}
      <Animated.View entering={SlideInLeft.duration(210).easing(Easing.out(Easing.cubic))} exiting={SlideOutLeft.duration(170).easing(Easing.in(Easing.cubic))} style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: '82%' }}>
        <ChamferBox chamfer={0} fill="rgba(10,13,18,0.99)" stroke={DmRune.lineStrong} strokeWidth={1.4} style={{ flex: 1, paddingHorizontal: 16, paddingTop: 54, paddingBottom: 16 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 12 }}>
            <Text style={{ flex: 1, color: DmRune.ivory, fontSize: DmType.title, fontFamily: Display.black, letterSpacing: 2, textTransform: 'uppercase' }}>Log</Text>
            <Pressable onPress={onClose} hitSlop={10} accessibilityRole="button" accessibilityLabel="Close log">
              <Svg width={20} height={20} viewBox="0 0 20 20"><Line x1={4} y1={4} x2={16} y2={16} stroke={DmRune.accent} strokeWidth={2.2} /><Line x1={16} y1={4} x2={4} y2={16} stroke={DmRune.accent} strokeWidth={2.2} /></Svg>
            </Pressable>
          </View>
          {log.length === 0 ? (
            <Text style={{ color: DmRune.muted, fontSize: DmType.body, fontFamily: Body.medium, marginTop: 24 }}>No entries yet. Add a note, or toggle Auto-log to record stat changes.</Text>
          ) : (
            <ScrollView showsVerticalScrollIndicator={false} scrollEnabled={!dragging} contentContainerStyle={{ paddingBottom: sel.selecting ? 76 : 10 }}>
              <View>
                {log.map((item, index) => {
                  const on = sel.ids.has(item.id);
                  const isNote = item.kind === 'note';
                  const isDragged = dragFrom === index;
                  const showDropAbove = dragging && !isDragged && dropIndex === index && dropIndex !== dragFrom;
                  return (
                    <LogRow
                      key={item.id}
                      item={item}
                      isNote={isNote}
                      isDragged={isDragged}
                      selecting={sel.selecting}
                      on={on}
                      showDropAbove={showDropAbove}
                      dragY={dragY}
                      dragGesture={gestures[index]}
                      onPress={() => { if (sel.selecting) sel.toggle(item.id); else if (isNote) setEditing(item); }}
                      onLongPress={() => (sel.selecting ? sel.toggle(item.id) : sel.start(item.id))}
                      onLayout={onRowLayout(index)}
                    />
                  );
                })}
                {dragging && dropIndex >= log.length ? <View style={{ height: 2, backgroundColor: DmRune.accent, borderRadius: 1, marginHorizontal: 4 }} /> : null}
              </View>
            </ScrollView>
          )}
          {!sel.selecting ? (
            <View style={{ paddingTop: 10 }}>
              <RuneButton label="Add note" kind="primary" height={46} dm onPress={() => setAdding(true)} />
            </View>
          ) : null}
        </ChamferBox>

        {sel.selecting ? (
          <View style={{ position: 'absolute', left: 12, right: 12, bottom: 16 }}>
            <ChamferBox chamfer={10} fill="rgba(20,24,30,0.98)" stroke={DmRune.accent} strokeWidth={1.4} style={{ padding: 10, gap: 8 }}>
              <Text style={{ color: DmRune.accent, fontSize: DmType.body, fontFamily: Body.bold, letterSpacing: 1, textTransform: 'uppercase' }}>{sel.ids.size} selected</Text>
              <View style={{ flexDirection: 'row', gap: 8 }}>
                <RuneButton label="Delete" kind="primary" height={34} dense dm style={{ flex: 1 }} onPress={() => setConfirm('delete')} />
                <RuneButton label="Keep only these" kind="secondary" height={34} dense dm style={{ flex: 1 }} onPress={() => setConfirm('keep')} />
                <RuneButton label="Cancel" kind="ghost" height={34} dense dm onPress={sel.clear} />
              </View>
            </ChamferBox>
          </View>
        ) : null}
      </Animated.View>

      {adding ? <NoteEditor initial="" onSave={(t) => { setAdding(false); onAddNote(t); }} onCancel={() => setAdding(false)} /> : null}
      {editing ? (
        <NoteEditor initial={editing.text} onSave={(t) => { onEditNote(editing.id, t); setEditing(null); }} onDelete={() => { onDeleteNote(editing.id); setEditing(null); }} onCancel={() => setEditing(null)} />
      ) : null}
      {confirm === 'delete' ? (
        <PopupDialog dm title="Delete selected?" body={`${sel.ids.size} log entr${sel.ids.size === 1 ? 'y' : 'ies'} will be removed.`} confirmLabel="Delete" destructive
          onConfirm={() => { onDeleteEntries(sel.ids); setConfirm(null); sel.clear(); }} onCancel={() => setConfirm(null)} />
      ) : null}
      {confirm === 'keep' ? (
        <PopupDialog dm title="Keep only these entries?" body={`Everything except the ${sel.ids.size} selected entr${sel.ids.size === 1 ? 'y' : 'ies'} will be erased.`} confirmLabel="Leave only" destructive
          onConfirm={() => { onKeepOnly(sel.ids); setConfirm(null); sel.clear(); }} onCancel={() => setConfirm(null)} />
      ) : null}
    </View>
  );
}
