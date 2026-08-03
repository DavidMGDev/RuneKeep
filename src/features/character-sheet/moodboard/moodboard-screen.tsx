import * as ImagePicker from 'expo-image-picker';
import { useCallback, useEffect, useRef, useState } from 'react';
import { BackHandler, Platform, Pressable, Text, View } from 'react-native';
import { captureRef } from 'react-native-view-shot';
import Animated, { Easing, runOnJS, useAnimatedStyle, useReducedMotion, useSharedValue, withTiming } from 'react-native-reanimated';
import Svg, { Path, Rect } from 'react-native-svg';

import { DesignStage, useStageScale } from '@/components/design-stage';
import { useScreenInsets } from '@/components/app-screen';
import { ChamferBox } from '@/components/chamfer-box';
import { ColorPalette } from '@/components/color-palette';
import { Body, Rune } from '@/constants/theme';
import { SHEET_DESIGN_HEIGHT, SHEET_DESIGN_WIDTH } from '@/lib/design';
import { tapHaptic } from '@/lib/haptics';
import {
  addItem,
  bringToFront,
  centreItem,
  duplicateItem,
  type MoodboardItem,
  removeItem,
  updateItem,
} from '@/lib/moodboard';
import { boardPalette } from '@/lib/palette';
import { renderMoodboardToDataUri } from '@/lib/moodboard-render';
import { ownImage } from '@/lib/owned-image';
import { useScreenEdge } from '@/lib/screen-dim';
import { playSfx } from '@/lib/sfx';
import { showToast } from '@/components/toast';

import { MoodboardItemView } from './moodboard-item';
import { MoodboardLayers } from './moodboard-layers';
import { MoodboardRadial, type MoodAction } from './moodboard-radial';

/**
 * The one flat surface in the app (owner). No border, no frame, no parchment: a deep blue ground so
 * the images are the only thing with edges on it.
 */
export const MOODBOARD_BG = '#101A2B';

/** The swatches the colour button offers (v0.34.3). Generated: see `lib/moodboard`. */
const PALETTE = boardPalette();

/** The fall an image takes when deleted, before the parent drops it. Matches the item's own timing. */
const LEAVE_MS = 900;

/** The top-bar controls. Small enough to sit clear of a phone's own chrome (v0.34.1). */
const BTN = 38;
const CANVAS = { width: SHEET_DESIGN_WIDTH, height: SHEET_DESIGN_HEIGHT };
const newId = () => `mb-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;

function Glyph({ kind, size = 20, color = Rune.goldText }: { kind: 'x' | 'lock' | 'unlock' | 'list' | 'plus' | 'paint'; size?: number; color?: string }) {
  const s = { fill: 'none' as const, stroke: color, strokeWidth: 1.9, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const };
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" pointerEvents="none">
      {kind === 'x' ? (
        <Path d="M6 6 L18 18 M18 6 L6 18" {...s} />
      ) : kind === 'plus' ? (
        <Path d="M12 5 V19 M5 12 H19" {...s} />
      ) : kind === 'list' ? (
        <Path d="M4 7 H20 M4 12 H20 M4 17 H14" {...s} />
      ) : kind === 'paint' ? (
        /* v0.34.3: four swatches, two of them filled. The palette-and-thumbhole drawing it replaces
           was unreadable at this size, which is the only size it is ever drawn at. */
        <>
          <Rect x={3.2} y={3.2} width={7.6} height={7.6} rx={1.2} {...s} fill={color} />
          <Rect x={13.2} y={3.2} width={7.6} height={7.6} rx={1.2} {...s} />
          <Rect x={3.2} y={13.2} width={7.6} height={7.6} rx={1.2} {...s} />
          <Rect x={13.2} y={13.2} width={7.6} height={7.6} rx={1.2} {...s} fill={color} />
        </>
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
      style={({ pressed }) => ({ width: BTN, height: BTN, borderRadius: BTN / 2, alignItems: 'center', justifyContent: 'center', backgroundColor: tint, borderWidth: 1.2, borderColor: Rune.goldEdge, opacity: pressed ? 0.7 : 1 })}>
      {children}
    </Pressable>
  );
}

/**
 * The lock: a TAP each way (owner, v0.34.1 -> v0.34.2).
 *
 * It was a one-second hold to unlock, which is a lot of ceremony every time you want to move an
 * image, and on a phone it is a second of standing still before the app admits anything happened. The
 * lock's job is to stop an ACCIDENT, and a deliberate tap on a small button in the corner is already
 * not an accident. The hold, and the progress ring that had to exist to explain it, are gone.
 */
function LockButton({ locked, onToggle }: { locked: boolean; onToggle: () => void }) {
  return (
    <Pressable
      onPress={() => { tapHaptic(); playSfx(locked ? 'cardSelect' : 'buttonTap'); onToggle(); }}
      hitSlop={10}
      accessibilityRole="switch"
      accessibilityState={{ checked: !locked }}
      accessibilityLabel={locked ? 'Unlock the moodboard' : 'Lock the moodboard'}
      style={({ pressed }) => ({
        width: BTN,
        height: BTN,
        borderRadius: BTN / 2,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: locked ? 'rgba(14,20,32,0.92)' : 'rgba(96,79,30,0.94)',
        borderWidth: 1.2,
        borderColor: locked ? Rune.goldEdge : Rune.goldBright,
        opacity: pressed ? 0.7 : 1,
      })}>
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
export function MoodboardScreen({ items, usePortrait, background, onChange, onSetPortrait, onUsePortrait, onBackground, onClose }: {
  items: MoodboardItem[];
  /** v0.34.1: leaving the board saves a picture of it over the character's portrait. */
  usePortrait: boolean;
  /** v0.34.2: the board's own ground colour, or undefined for the default deep blue. */
  background?: string;
  onChange: (next: MoodboardItem[]) => void;
  onSetPortrait: (uri: string) => void;
  onUsePortrait: (on: boolean) => void;
  onBackground: (color: string) => void;
  onClose: () => void;
}) {
  const reduced = useReducedMotion();
  /**
   * An EMPTY board opens unlocked (v0.34.2, owner).
   *
   * The lock is there to stop an arrangement being nudged by accident, and an empty board has no
   * arrangement to protect. Arriving at a locked blank canvas meant the first thing a new board asked
   * of you was to work out how to unlock it before it would show you anything at all.
   */
  const [locked, setLocked] = useState(() => items.length > 0);
  const [menu, setMenu] = useState<{ id: string; x: number; y: number } | null>(null);
  const [layers, setLayers] = useState(false);
  const [dragging, setDragging] = useState(false);
  /** Ids that are falling off the canvas. They are still drawn; the model has already let them go. */
  const [leaving, setLeaving] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [saving, setSaving] = useState(false);
  const [picking, setPicking] = useState(false);
  /**
   * The locked-board notice, drawn HERE rather than as an app toast (v0.34.3).
   *
   * The app's toast sits at the top centre, which is exactly where the lock button is, so the message
   * telling you to press the lock covered the lock for as long as it was up. Its own banner sits at
   * the foot of the board, out of the way of every control.
   */
  const [nag, setNag] = useState(0);
  const insets = useScreenInsets();
  /** The board AS IT LOOKS, ground included: what a portrait capture is taken from (v0.34.2). */
  const shotRef = useRef<View>(null);
  /** Last time the locked board said so. One notice every two seconds, per the owner. */
  const lastNag = useRef(0);
  const ground = background || MOODBOARD_BG;
  useScreenEdge(ground);
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

  /**
   * Leaving (v0.34.1).
   *
   * If the board is the portrait, it is captured BEFORE the fade starts, while everything is still on
   * screen at full opacity. Capturing a view mid-fade would save a half-transparent picture.
   *
   * v0.34.2: the capture is FLATTENED, ground and all.
   *
   * It used to be taken from a view holding the images and nothing else, chasing a transparent PNG.
   * That was the wrong reading of the request: what has to be transparent is each PNG the player puts
   * ON the board, which `expo-image` handles by itself. The portrait wants to be a picture of the
   * board as it looks. Excluding the ground is also why a web capture came out white, since
   * html2canvas fills whatever background it is not given, and why it looked like the portrait had
   * not been overwritten at all.
   */
  const leave = useCallback(async () => {
    if (usePortrait && shotRef.current) {
      setSaving(true);
      try {
        // A browser DRAWS the board rather than photographing it (v0.34.2). See `lib/moodboard-render`.
        const shot =
          Platform.OS === 'web'
            ? await renderMoodboardToDataUri(itemsRef.current, CANVAS, ground)
            : await captureRef(shotRef, { format: 'png', quality: 1, result: 'tmpfile', width: CANVAS.width, height: CANVAS.height });
        const owned = shot ? await ownImage(shot) : null;
        if (owned) onSetPortrait(owned);
        else showToast('The board could not be saved as a portrait.');
      } catch {
        // A failed capture must never trap the player on the board, but it must not be silent either:
        // the portrait simply not changing is indistinguishable from the feature not existing.
        showToast('The board could not be saved as a portrait.');
      } finally {
        setSaving(false);
      }
    }
    playSfx('panelClose');
    enter.value = withTiming(0, { duration: reduced ? 0 : 260, easing: Easing.in(Easing.cubic) }, (f) => {
      'worklet';
      if (f) runOnJS(onClose)();
    });
  }, [enter, ground, onClose, onSetPortrait, reduced, usePortrait]);

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
    [onChange, reduced],
  );

  const act = useCallback(
    (id: string, a: MoodAction) => {
      if (a === 'delete') { drop(id); return; }
      if (a === 'copy') { onChange(duplicateItem(items, id, newId(), CANVAS)); return; }
      if (a === 'front') { onChange(bringToFront(items, id)); return; }
      onChange(centreItem(items, id, CANVAS));
    },
    [items, onChange, drop],
  );

  const commit = useCallback(
    (id: string, next: { x: number; y: number; scale: number; rotation: number }) => onChange(updateItem(items, id, next)),
    [items, onChange],
  );

  /**
   * The locked board says so (v0.34.2), at most once every two seconds.
   *
   * Every gesture on an image is simply disabled while locked, so touching one did nothing at all and
   * looked exactly like the app being broken. The throttle is the owner's: a canvas gets a lot of
   * stray taps and a notice per tap would be worse than silence.
   */
  const nagLocked = useCallback(() => {
    const now = Date.now();
    if (now - lastNag.current < 2000) return;
    lastNag.current = now;
    playSfx('buttonTap');
    setNag(now);
    setTimeout(() => setNag((n) => (n === now ? 0 : n)), 1900);
  }, []);

  /**
   * The device back button CLOSES the board (owner, v0.34.3).
   *
   * The board renders INSTEAD of the sheet, so the sheet's own back guard is unmounted while it is
   * up and back went all the way out to the character list. It leaves the same way the X does,
   * portrait capture and all, because that is what "close and save" means here.
   */
  useEffect(() => {
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      if (picking) { setPicking(false); return true; }
      if (layers) { setLayers(false); return true; }
      if (menu) { setMenu(null); return true; }
      void leave();
      return true;
    });
    return () => sub.remove();
  }, [layers, leave, menu, picking]);

  const onMenu = useCallback((id: string, x: number, y: number) => { playSfx('buttonTap'); setMenu({ id, x, y }); }, []);
  const onGrab = useCallback(() => setDragging(true), []);
  const onRelease = useCallback(() => setDragging(false), []);


  return (
    <Animated.View style={[{ flex: 1, backgroundColor: ground }, groundStyle]}>
      <DesignStage designWidth={SHEET_DESIGN_WIDTH} designHeight={SHEET_DESIGN_HEIGHT} clip>
        {/* `shotRef` wraps the GROUND and the images: a portrait is a flattened picture of the board
            as it looks, which is also what stops a web capture coming out white (v0.34.2). */}
        <View ref={shotRef} collapsable={false} style={{ position: 'absolute', left: 0, top: 0, width: SHEET_DESIGN_WIDTH, height: SHEET_DESIGN_HEIGHT, backgroundColor: ground }} pointerEvents="box-none">
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
        </View>
        {/* Locked: swallow taps on the canvas and say why, rather than doing nothing (v0.34.2). */}
        {locked ? (
          <Pressable
            onPress={nagLocked}
            accessibilityRole="button"
            accessibilityLabel="The moodboard is locked"
            style={{ position: 'absolute', left: 0, top: 0, width: SHEET_DESIGN_WIDTH, height: SHEET_DESIGN_HEIGHT }}
          />
        ) : null}
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
        {/* v0.34.1: measured from the real inset rather than a flat 46, which left a band of dead
            space at the top of a browser and sat under the status bar on some phones. */}
        <View style={{ position: 'absolute', right: 14, top: insets.top + 10, flexDirection: 'row', gap: 10, alignItems: 'center' }}>
          <RoundButton label="Change the board's background colour" onPress={() => setPicking(true)}>
            <Glyph kind="paint" />
          </RoundButton>
          <RoundButton label="Show every image on the board" onPress={() => setLayers(true)}>
            <Glyph kind="list" />
          </RoundButton>
          <LockButton locked={locked} onToggle={() => setLocked((v) => !v)} />
          <RoundButton label="Close the moodboard" onPress={() => void leave()}>
            <Glyph kind="x" />
          </RoundButton>
        </View>

        {/* The add button, hidden while something is being moved so it is never under the finger.
            v0.34.1: smaller, and lifted clear of the navigation bar it was bleeding into. */}
        {!locked && !dragging ? (
          <View style={{ position: 'absolute', left: 0, right: 0, bottom: insets.bottom + 26, alignItems: 'center' }}>
            <Pressable
              onPress={() => { tapHaptic(); void add(); }}
              accessibilityRole="button"
              accessibilityLabel="Add an image to the moodboard"
              style={({ pressed }) => ({ width: 48, height: 48, borderRadius: 24, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(14,20,32,0.94)', borderWidth: 1.5, borderColor: Rune.goldBright, opacity: pressed ? 0.75 : 1 })}>
              <Glyph kind="plus" size={22} color={Rune.goldBright} />
            </Pressable>
          </View>
        ) : null}

        {/* v0.34.2: an empty board points at the button that fills it. The arrow sits just above the
            plus, so the sentence and the target are one thing to look at rather than two. */}
        {items.length === 0 && !layers && !saving ? (
          <View pointerEvents="none" style={{ position: 'absolute', left: 0, right: 0, bottom: insets.bottom + 26 + 48 + 10, alignItems: 'center' }}>
            <Text style={{ color: 'rgba(224,214,196,0.78)', fontSize: 13, fontFamily: Body.medium, textAlign: 'center', lineHeight: 20, paddingHorizontal: 30 }}>
              This is your character&apos;s moodboard.{'\n'}Add your first image here.
            </Text>
            <Svg width={26} height={34} viewBox="0 0 26 34" style={{ marginTop: 6 }}>
              <Path d="M13 2 V26 M5 19 L13 27 L21 19" fill="none" stroke={Rune.goldBright} strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round" />
            </Svg>
          </View>
        ) : null}

        {saving ? (
          <View pointerEvents="auto" style={{ position: 'absolute', left: 0, top: 0, right: 0, bottom: 0, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(16,26,43,0.72)' }}>
            <Text style={{ color: Rune.goldText, fontSize: 12.5, fontFamily: Body.bold, letterSpacing: 1, textTransform: 'uppercase' }}>Saving your portrait</Text>
          </View>
        ) : null}

        {/* The locked notice, at the foot of the board so it never covers the lock it names. */}
        {nag ? (
          <View pointerEvents="none" style={{ position: 'absolute', left: 0, right: 0, bottom: insets.bottom + 26, alignItems: 'center' }}>
            <ChamferBox chamfer={7} fill="rgba(12,15,20,0.96)" stroke={Rune.goldEdge} strokeWidth={1.2} style={{ paddingHorizontal: 13, paddingVertical: 6, maxWidth: 300 }}>
              <Text style={{ color: Rune.goldText, fontSize: 12.5, fontFamily: Body.bold, letterSpacing: 0.3, textAlign: 'center' }}>The board is locked. Tap the lock to make changes.</Text>
            </ChamferBox>
          </View>
        ) : null}

        {picking ? (
          <ColorPalette title="Background" colors={PALETTE} current={ground} onPick={(c) => { onBackground(c); setPicking(false); }} onClose={() => setPicking(false)} />
        ) : null}

        {layers ? (
          <MoodboardLayers
            items={items}
            usePortrait={usePortrait}
            onAction={(id, a) => { setLayers(false); act(id, a); }}
            onTogglePortrait={onUsePortrait}
            onClose={() => setLayers(false)}
          />
        ) : null}
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
