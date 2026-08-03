import * as ImagePicker from 'expo-image-picker';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Platform, Pressable, Text, View } from 'react-native';
import Animated, { Easing, runOnJS, useAnimatedStyle, useReducedMotion, useSharedValue, withTiming } from 'react-native-reanimated';
import Svg, { Circle, Path } from 'react-native-svg';

import { DesignStage, useStageScale } from '@/components/design-stage';
import { Body, Rune } from '@/constants/theme';
import { SHEET_DESIGN_HEIGHT, SHEET_DESIGN_WIDTH } from '@/lib/design';
import { focusHaptic, tapHaptic } from '@/lib/haptics';
import {
  addItem,
  bringToFront,
  centreItem,
  duplicateItem,
  layerDown,
  layerUp,
  type MoodboardItem,
  removeItem,
  sendToBack,
  updateItem,
} from '@/lib/moodboard';
import { ownImage } from '@/lib/owned-image';
import { useScreenEdge } from '@/lib/screen-dim';
import { playSfx } from '@/lib/sfx';

import { MoodboardItemView } from './moodboard-item';
import { MoodboardLayers } from './moodboard-layers';
import { MoodboardRadial, type MoodAction } from './moodboard-radial';

/**
 * The one flat surface in the app (owner). No border, no frame, no parchment: a deep blue ground so
 * the images are the only thing with edges on it.
 */
export const MOODBOARD_BG = '#101A2B';

/** How long the lock must be held before the board can be edited. */
const UNLOCK_MS = 1000;
/** The fall an image takes when deleted, before the parent drops it. Matches the item's own timing. */
const LEAVE_MS = 900;

const CANVAS = { width: SHEET_DESIGN_WIDTH, height: SHEET_DESIGN_HEIGHT };
const newId = () => `mb-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;

function Glyph({ kind, size = 20, color = Rune.goldText }: { kind: 'x' | 'lock' | 'unlock' | 'list' | 'plus'; size?: number; color?: string }) {
  const s = { fill: 'none' as const, stroke: color, strokeWidth: 1.9, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const };
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" pointerEvents="none">
      {kind === 'x' ? (
        <Path d="M6 6 L18 18 M18 6 L6 18" {...s} />
      ) : kind === 'plus' ? (
        <Path d="M12 5 V19 M5 12 H19" {...s} />
      ) : kind === 'list' ? (
        <Path d="M4 7 H20 M4 12 H20 M4 17 H14" {...s} />
      ) : (
        <>
          <Path d="M6 11 H18 V20 H6 Z" {...s} />
          {kind === 'lock' ? <Path d="M9 11 V7.5 A3 3 0 0 1 15 7.5 V11" {...s} /> : <Path d="M9 11 V7.5 A3 3 0 0 1 14.6 6" {...s} />}
        </>
      )}
    </Svg>
  );
}

/** A round control in the top bar. */
function RoundButton({ onPress, label, children, tint = 'rgba(14,20,32,0.92)' }: { onPress: () => void; label: string; children: React.ReactNode; tint?: string }) {
  return (
    <Pressable
      onPress={() => { tapHaptic(); playSfx('buttonTap'); onPress(); }}
      hitSlop={10}
      accessibilityRole="button"
      accessibilityLabel={label}
      style={({ pressed }) => ({ width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center', backgroundColor: tint, borderWidth: 1.2, borderColor: Rune.goldEdge, opacity: pressed ? 0.7 : 1 })}>
      {children}
    </Pressable>
  );
}

/**
 * The lock (owner): a full second of holding to unlock, drawn as it fills. Locking again is a single
 * tap, because securing the board should never make you wait.
 */
function LockButton({ locked, onUnlock, onLock, reduced }: { locked: boolean; onUnlock: () => void; onLock: () => void; reduced: boolean }) {
  const p = useSharedValue(0);
  const fired = useRef(false);
  const ring = useAnimatedStyle(() => ({ opacity: p.value > 0.02 ? 1 : 0, transform: [{ scale: 0.9 + 0.1 * p.value }] }));
  const fill = useAnimatedStyle(() => ({ height: `${p.value * 100}%` }));

  const done = useCallback(() => {
    if (fired.current) return;
    fired.current = true;
    p.value = withTiming(0, { duration: 260 }); // the hold is spent; the button stops looking charged
    focusHaptic();
    playSfx('cardSelect');
    onUnlock();
  }, [onUnlock, p]);

  return (
    <Pressable
      onPressIn={() => {
        if (!locked) return;
        fired.current = false;
        p.value = 0;
        p.value = withTiming(1, { duration: reduced ? 0 : UNLOCK_MS, easing: Easing.linear }, (f) => {
          'worklet';
          if (f) runOnJS(done)();
        });
      }}
      onPressOut={() => {
        if (!locked) return;
        p.value = withTiming(0, { duration: 180 });
      }}
      /**
       * The release that FINISHED a hold is not a tap (v0.34.0).
       *
       * `Pressable` fires `onPress` after `onPressOut`, and by then the hold has already unlocked the
       * board, so the tap branch saw an unlocked board and locked it straight back: holding for a
       * second did nothing at all, twice as slowly. The flag the hold sets is what tells them apart.
       */
      onPress={() => {
        if (fired.current) { fired.current = false; return; }
        if (!locked) { tapHaptic(); playSfx('buttonTap'); onLock(); }
      }}
      hitSlop={10}
      accessibilityRole="button"
      accessibilityLabel={locked ? 'Hold to unlock the moodboard' : 'Lock the moodboard'}
      accessibilityHint={locked ? 'Hold for one second' : undefined}
      style={{ width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center', backgroundColor: locked ? 'rgba(14,20,32,0.92)' : 'rgba(63,52,20,0.92)', borderWidth: 1.2, borderColor: locked ? Rune.goldEdge : Rune.goldBright, overflow: 'hidden' }}>
      {/* The hold, drawn: gold rises from the bottom of the button over the full second. */}
      <Animated.View pointerEvents="none" style={[{ position: 'absolute', left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(224,181,99,0.35)' }, fill]} />
      <Animated.View pointerEvents="none" style={[{ position: 'absolute', left: 0, top: 0, right: 0, bottom: 0, alignItems: 'center', justifyContent: 'center' }, ring]}>
        <Svg width={40} height={40} viewBox="0 0 40 40">
          <Circle cx={20} cy={20} r={18} fill="none" stroke={Rune.goldBright} strokeWidth={1.4} />
        </Svg>
      </Animated.View>
      <Glyph kind={locked ? 'lock' : 'unlock'} color={locked ? Rune.goldText : Rune.goldBright} />
    </Pressable>
  );
}

/**
 * The moodboard (v0.34.0) — a character's canvas, opened by double-tapping its portrait.
 *
 * ## Why it is a screen and not an overlay
 *
 * The owner asked for the sheet to be unloaded while this is open, and they are right to: the sheet
 * is the most expensive thing in the app, and a canvas wants every frame it can get. The sheet
 * renders this INSTEAD of itself, so the carousel, the forge stage and every track come down while it
 * is up, and the character's state and save path stay exactly where they were.
 *
 * ## Locked by default, every time
 *
 * Not persisted, deliberately. The board opens locked however it was left, because the alternative is
 * arriving on a live canvas and nudging something you cannot undo.
 *
 * ## What the canvas is
 *
 * A fixed 412x892 design space, the same one the sheet is authored in, so a phone, a browser and the
 * tablet frame all get the same board with no per-platform arithmetic. It does not scroll and does
 * not zoom, which is what makes "nothing can be lost" a promise the app can keep: a centre is clamped
 * inside the canvas, and the image list can always bring something back.
 */
export function MoodboardScreen({ items, onChange, onClose }: { items: MoodboardItem[]; onChange: (next: MoodboardItem[]) => void; onClose: () => void }) {
  const reduced = useReducedMotion();
  const [locked, setLocked] = useState(true);
  const [menu, setMenu] = useState<{ id: string; x: number; y: number } | null>(null);
  const [layers, setLayers] = useState(false);
  const [dragging, setDragging] = useState(false);
  /** Ids that are falling off the canvas. They are still drawn; the model has already let them go. */
  const [leaving, setLeaving] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  useScreenEdge(MOODBOARD_BG);
  // Read by the delete timer, which outlives the render that started it.
  const itemsRef = useRef(items);
  itemsRef.current = items;

  // Enter and leave as one cross-fade: the ground first, then the controls, then each image as it
  // decodes. Nothing arrives at full opacity in a single frame.
  const enter = useSharedValue(0);
  useEffect(() => {
    enter.value = withTiming(1, { duration: reduced ? 0 : 320, easing: Easing.out(Easing.cubic) });
    playSfx('panelOpen');
  }, [enter, reduced]);
  const groundStyle = useAnimatedStyle(() => ({ opacity: enter.value }));
  const chromeStyle = useAnimatedStyle(() => ({ opacity: Math.max(0, (enter.value - 0.35) / 0.65), transform: [{ translateY: (1 - enter.value) * -8 }] }));

  const leave = useCallback(() => {
    playSfx('panelClose');
    enter.value = withTiming(0, { duration: reduced ? 0 : 240, easing: Easing.in(Easing.cubic) }, (f) => {
      'worklet';
      if (f) runOnJS(onClose)();
    });
  }, [enter, onClose, reduced]);

  const add = useCallback(async () => {
    if (busy) return;
    setBusy(true);
    try {
      const res = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 0.9 });
      if (res.canceled || !res.assets[0]) return;
      const a = res.assets[0];
      const uri = await ownImage(a.uri);
      if (!uri) return;
      const aspect = a.width && a.height ? a.width / a.height : 1;
      onChange(addItem(items, { id: newId(), imageUri: uri, aspect }, CANVAS));
      playSfx('placeToken');
    } finally {
      setBusy(false);
    }
  }, [busy, items, onChange]);

  /** A deleted image keeps drawing while it falls, and leaves the model only when it lands. */
  const drop = useCallback(
    (id: string) => {
      setLeaving((l) => (l.includes(id) ? l : [...l, id]));
      playSfx('tokenRemove');
      setTimeout(() => {
        setLeaving((l) => l.filter((x) => x !== id));
        onChange(removeItem(itemsRef.current, id));
      }, reduced ? 180 : LEAVE_MS);
    },
    [items, onChange, reduced],
  );

  const act = useCallback(
    (id: string, a: MoodAction) => {
      if (a === 'delete') { drop(id); return; }
      if (a === 'copy') { onChange(duplicateItem(items, id, newId(), CANVAS)); return; }
      if (a === 'front') { onChange(bringToFront(items, id)); return; }
      if (a === 'back') { onChange(sendToBack(items, id)); return; }
      onChange(centreItem(items, id, CANVAS));
    },
    [items, onChange, drop],
  );

  const commit = useCallback(
    (id: string, next: { x: number; y: number; scale: number; rotation: number }) => onChange(updateItem(items, id, next)),
    [items, onChange],
  );

  const onMenu = useCallback((id: string, x: number, y: number) => { playSfx('buttonTap'); setMenu({ id, x, y }); }, []);
  const onGrab = useCallback(() => setDragging(true), []);
  const onRelease = useCallback(() => setDragging(false), []);


  return (
    <Animated.View style={[{ flex: 1, backgroundColor: MOODBOARD_BG }, groundStyle]}>
      <DesignStage designWidth={SHEET_DESIGN_WIDTH} designHeight={SHEET_DESIGN_HEIGHT} clip>
        <Canvas
          items={items}
          locked={locked}
          leaving={leaving}
          onCommit={commit}
          onMenu={onMenu}
          onGrab={onGrab}
          onRelease={onRelease}
          reduced={reduced}
        />
        {menu ? (
          <MoodboardRadial
            x={menu.x}
            y={menu.y}
            canvasW={CANVAS.width}
            canvasH={CANVAS.height}
            onPick={(a) => { setMenu(null); act(menu.id, a); }}
            onDismiss={() => setMenu(null)}
          />
        ) : null}
      </DesignStage>

      {/* The chrome sits OUTSIDE the stage, in device points, so the buttons are a comfortable size on
          every screen rather than scaled with the canvas. */}
      <Animated.View pointerEvents="box-none" style={[{ position: 'absolute', left: 0, right: 0, top: 0, bottom: 0 }, chromeStyle]}>
        <View style={{ position: 'absolute', right: 14, top: 46, flexDirection: 'row', gap: 10, alignItems: 'center' }}>
          <RoundButton label="Show every image on the board" onPress={() => setLayers(true)}>
            <Glyph kind="list" />
          </RoundButton>
          <LockButton locked={locked} onUnlock={() => setLocked(false)} onLock={() => setLocked(true)} reduced={reduced} />
          <RoundButton label="Close the moodboard" onPress={leave}>
            <Glyph kind="x" />
          </RoundButton>
        </View>

        {/* The add button, hidden while something is being moved so it is never under the finger. */}
        {!locked && !dragging ? (
          <View style={{ position: 'absolute', left: 0, right: 0, bottom: 44, alignItems: 'center' }}>
            <Pressable
              onPress={() => { tapHaptic(); void add(); }}
              accessibilityRole="button"
              accessibilityLabel="Add an image to the moodboard"
              style={({ pressed }) => ({ width: 58, height: 58, borderRadius: 29, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(14,20,32,0.94)', borderWidth: 1.6, borderColor: Rune.goldBright, opacity: pressed ? 0.75 : 1 })}>
              <Glyph kind="plus" size={26} color={Rune.goldBright} />
            </Pressable>
          </View>
        ) : null}

        {locked && items.length === 0 ? (
          <View pointerEvents="none" style={{ position: 'absolute', left: 24, right: 24, top: '44%' }}>
            <Text style={{ color: 'rgba(224,214,196,0.66)', fontSize: 13, fontFamily: Body.medium, textAlign: 'center', lineHeight: 20 }}>
              This is your character&apos;s moodboard.{'\n'}Hold the lock for a second to start adding images.
            </Text>
          </View>
        ) : null}

        {layers ? <MoodboardLayers items={items} onAction={(id, a) => { setLayers(false); act(id, a); }} onClose={() => setLayers(false)} /> : null}
      </Animated.View>
    </Animated.View>
  );
}

/** Inside the stage, so it can read the stage scale that gesture translations must be divided by. */
function Canvas({
  items,
  locked,
  leaving,
  onCommit,
  onMenu,
  onGrab,
  onRelease,
  reduced,
}: {
  items: MoodboardItem[];
  locked: boolean;
  leaving: string[];
  onCommit: (id: string, next: { x: number; y: number; scale: number; rotation: number }) => void;
  onMenu: (id: string, x: number, y: number) => void;
  onGrab: () => void;
  onRelease: () => void;
  reduced: boolean;
}) {
  // A gesture reports its translation in SCREEN pixels while the board is laid out in design pixels,
  // so every translation is divided by the stage's scale. The same convention the token board uses;
  // getting it wrong is invisible on a phone and wildly wrong on a tablet or in a browser.
  const stageScale = useStageScale();
  const factor = stageScale || 1;
  return (
    <View style={{ position: 'absolute', left: 0, top: 0, width: SHEET_DESIGN_WIDTH, height: SHEET_DESIGN_HEIGHT }} pointerEvents={Platform.OS === 'web' ? 'box-none' : 'auto'}>
      {items.map((it) => (
        <MoodboardItemView
          key={it.id}
          item={it}
          canvas={CANVAS}
          locked={locked}
          scaleFactor={factor}
          leaving={leaving.includes(it.id)}
          onCommit={onCommit}
          onMenu={onMenu}
          onGrab={onGrab}
          onRelease={onRelease}
          reduced={reduced}
        />
      ))}
    </View>
  );
}
