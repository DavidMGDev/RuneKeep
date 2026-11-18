import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, { Easing, runOnJS, useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';

import { AppScreen } from '@/components/app-screen';
import { ChamferBox } from '@/components/chamfer-box';
import { useDesktopPage } from '@/hooks/use-desktop';
import { useScreenFocus } from '@/hooks/use-screen-focus';
import { RuneButton } from '@/components/rune-button';
import { Body, Display, Rune } from '@/constants/theme';
import { finishTour, saveTourStep, type TourId, tourStep } from '@/lib/onboarding-store';
import { isDesktopWeb , useInstallMode } from '@/lib/pwa-install';

import { beginLoading, endLoading, playSfx } from '@/lib/sfx';

import { CircleDemo, EquipDemo, HandDemo, HeartsDemo, WelcomeDemo, WheelDemo } from './demos';
import { InstallDemo } from './install-demo';
import { KeysDemo } from './keys-demo';

/**
 * The guided tours (v0.23.0).
 *
 * Three short tours, each shown where it is needed, replacing v0.22.0's single tour on first launch
 * which explained the character sheet to someone who had never seen a character:
 *
 *  - `welcome`   what the app is and the two ways in. Nothing about the sheet.
 *  - `creation`  how the creator works, the first time a hero is built.
 *  - `sheet`     the gestures with no visible affordance, once there is a character to use them on.
 *
 * Pages can REQUIRE their gesture: `gate` holds Next until the player has done it. That is the only
 * honest way to know a hold has been felt rather than read about.
 */

interface Page {
  title: string;
  body: string;
  /**
   * The page's illustration. OPTIONAL since v0.42.4: the campaigns tour explains a screen the reader
   * is about to be standing in, so a diagram of it would be a picture of the thing behind the dialog.
   */
  render?: (ctx: { did: boolean; markDid: () => void }) => React.ReactElement;
  /** Next stays disabled until the page's gesture has been performed. */
  gate?: boolean;
}

/**
 * v0.24.4: in a mobile browser the FIRST thing the welcome tour does is offer to install the app,
 * before anything is explained. A browser tab spends the top and bottom of the screen on chrome that
 * the app is not laid out for, and an installed copy is the version worth learning. It appears only
 * when there is something to offer (see `lib/pwa-install`), so on Android, iOS and native the tour
 * is otherwise unchanged.
 */
/** v0.26.0: the keyboard page, shown only where there is a keyboard. */
const KEYS_PAGE: Page = {
  title: 'You can use the keyboard',
  body: 'RuneKeep is built for thumbs, and on a desktop that means a lot of dragging. These do the same jobs without the mouse.\n\nThe arrow keys and WASD both work, whichever your hands already know.',
  render: () => <KeysDemo />,
};

function installPage(mode: Exclude<ReturnType<typeof useInstallMode>, 'none'>, onInstalled: () => void): Page {
  return {
    title: 'Add it to your home screen',
    body:
      mode === 'ios'
        ? 'RuneKeep runs better as an app than as a tab. Installed, it opens on its own with the whole screen, and it keeps working when the wifi at the table does not.\n\nSafari installs it from the Share menu, and your characters stay on this device either way.'
        : 'RuneKeep runs better as an app than as a tab. Installed, it opens on its own with the whole screen, no address bar, and it keeps working when the wifi at the table does not.\n\nYour characters stay on this device either way.',
    render: () => <InstallDemo mode={mode} onInstalled={onInstalled} />,
  };
}

const WELCOME: Page[] = [
  {
    title: 'Welcome to RuneKeep',
    body: 'Everything here is a card. Your class, your ancestry, the sword you carry, the notes you scribble at the table. You build a character by choosing cards, and you play by using them.\n\nOne thing worth knowing up front: RuneKeep never rolls for you. You roll your own dice and tell the app what happened.',
    render: () => <WelcomeDemo />,
  },
  {
    title: 'Two ways to start',
    body: 'Make a character, and the app walks you through it one step at a time.\n\nOr open Cards and browse the archive first. Every level 1 domain card is in there, and reading a few is the quickest way to see how the game fits together.',
    render: () => <WelcomeDemo />,
  },
];

const CREATION: Page[] = [
  {
    title: 'One step at a time',
    body: 'The row of tabs is your checklist. Each one turns gold when it is done, and the bar above it shows how far along you are.\n\nYou can go back to any step and change your mind. Nothing is locked in until you forge.',
    render: () => <WelcomeDemo />,
  },
  {
    title: 'Pick from the middle',
    body: 'Swipe the cards sideways. Whichever one sits in the middle is the one the button picks, and the button names it so you always know which.\n\nTap a card that is already in the middle to read it full screen.',
    render: () => <HandDemo />,
  },
  {
    title: 'If you get stuck',
    body: 'Random rolls a valid choice for the step you are on, which is a good way to see what the options look like.\n\nForge sits in the top corner. If something is still missing it takes you straight to it rather than doing nothing.',
    render: () => <WelcomeDemo />,
  },
];

const SHEET: Page[] = [
  {
    title: 'Your hand of cards',
    body: 'Your cards sit along the bottom. Tap them to fan the hand open, tap the middle one to read it, and swipe down to put it away.\n\nSwipe sideways at any time to look through the rest.',
    render: () => <HandDemo />,
  },
  {
    title: 'Hold to equip',
    body: 'Holding a card equips it. Gold fills the card as you hold, and a check lands in the corner when it takes.\n\nEquipped cards change your sheet. The State screen shows exactly what each one is doing.',
    gate: true,
    render: ({ did, markDid }) => <EquipDemo did={did} onDid={markDid} />,
  },
  {
    title: 'Hit Points, Stress, Hope, Armor',
    body: 'Each row is split down the middle. One side clears, the other marks. Hold for the full effect, or double tap when things are moving fast.\n\nThe split follows the value, so the side that clears is always the filled side.',
    render: ({ markDid }) => <HeartsDemo onDid={markDid} />,
  },
  {
    title: 'The circle controls',
    body: 'The circles at the bottom of the screen, behind your cards, open and close your hand. Drag them sideways to skim the whole deck quickly.\n\nHold them still to enter Edit mode, where you can select several cards at once and equip, move, favourite or delete them all together.',
    render: () => <CircleDemo />,
  },
  // v0.26.0: two things a new character needs doing once, neither of them discoverable. Equipping is
  // a hold per card until you know Edit mode exists, and a fresh arsenal holds armor and starting
  // gear that crowd out the cards you actually play with.
  {
    title: 'Equip everything at once',
    body: 'A new character starts with nothing equipped except their armor, so most of their bonuses are not being counted yet.\n\nHold the circles for Edit mode, press Select All, then Equip from the card menu. That is every card in one go rather than a hold each.',
    render: () => <CircleDemo />,
  },
  {
    title: 'Tidy the arsenal afterwards',
    body: 'Your armor and starting gear live in the arsenal to begin with, which works but gets crowded.\n\nOnce their bonuses are counted, move them to Inventory: Edit mode, select them, then Move. Your arsenal is then just the cards you play with.',
    render: () => <CircleDemo />,
  },
  // v0.34.0: the moodboard is opened by a gesture on a thing that already had two other gestures, so
  // it is the least discoverable feature in the app. It gets a page.
  {
    title: 'Double tap your portrait',
    body: 'Two taps on your portrait open this character’s moodboard: a blank canvas that belongs to them, for faces, places, armour, anything you have collected.\n\nDrag with one finger, use two to resize and turn, and double tap an image for its menu. It opens locked, so hold the lock for a second before you move anything.',
    render: () => <WheelDemo />,
  },
  {
    title: 'The wheel under your portrait',
    body: 'Press the emblem below your portrait and drag to a wedge.\n\nState shows your modifiers and everything that has happened to this character. Then Level Up, Rest, New Card, and Cards for the rest.\n\nOne last thing: your sheet is bright parchment and this tour is dark, so Got it is a jump in brightness.',
    render: ({ markDid }) => <WheelDemo onDid={markDid} />,
  },
];

/**
 * v0.42.4 (owner): the DM's first-run introduction.
 *
 * Campaigns is a top-level destination now, reached in one press with no mode toggle in front of it
 * announcing what kind of screen is coming. So the screen introduces itself, once. Three pages: what
 * a campaign is, what it holds, and the two things a DM does with it that a player never sees.
 */
const CAMPAIGNS: Page[] = [
  {
    title: 'This side of the table',
    body: 'Campaigns is where you run games rather than play in them.\n\nA campaign holds a cast of characters and the nights you play them. Everything here is yours as the DM: your players never see it, and nothing you do here touches their character files.',
  },
  {
    title: 'Sessions and encounters',
    body: 'A campaign holds SESSIONS, one for each night at the table.\n\nEach session holds ENCOUNTERS: an adversary roster you build ahead of time or on the spot, with health, stress and counters you drive during the fight. Finishing an encounter freezes it, so you can look back at what happened.',
  },
  {
    title: 'Your table, your rules',
    body: 'Two things worth knowing.\n\nCharacterize turns an adversary into a real character sheet, which is how an NPC gets cards and traits like anybody else.\n\nAnd in the Cards menu, any expansion you author carries CAMPAIGN SETTINGS: walk the character creator and turn off whatever your world does not have. Everyone who enables the pack builds inside those rules.',
  },
];

/** v0.42.6: the class-card explanation is drawn INSIDE the chooser it is about, not as a tour screen. */
/**
 * The desktop tours (v0.45.0). A desktop window lays the app out differently, so the pages that described
 * phone gestures (swipes, holds, the circle controls) describe what is on the screen instead.
 */
const DESKTOP_KEYS: { caps: string[]; what: string }[] = [
  { caps: ['A', 'D'], what: 'Bring the next card into focus' },
  { caps: ['Shift', 'A', 'D'], what: 'Two cards at a time' },
  { caps: ['[', ']'], what: 'Move the card in its deck' },
  { caps: ['Space'], what: 'Equip or unequip' },
  { caps: ['Q', 'E'], what: 'Change deck' },
  { caps: ['1 to 9'], what: 'Jump to a deck' },
  { caps: ['Esc'], what: 'Put the card back, close a panel' },
];

const DESKTOP_KEYS_PAGE: Page = {
  title: 'You can use the keyboard',
  body: 'On a desktop the sheet stays on the left and your cards sit on a table beside it, so most things are a click away.\n\nThe keyboard does the rest. Right click any card on the table for everything else it can do.',
  render: () => <KeysDemo rows={DESKTOP_KEYS} />,
};

const DESKTOP_CREATION: Page[] = [
  {
    title: 'One step at a time',
    body: 'The steps on the left are your checklist. Each one turns gold when it is done, and Your hero on the right shows what you have chosen so far.\n\nGo back to any step and change your mind. Nothing is locked in until you forge.',
    render: () => <WelcomeDemo />,
  },
  {
    title: 'Pick from the middle',
    body: 'Move through the cards with the arrow keys, or drag them. Whichever one sits in the middle is the one the button picks, and the button names it.\n\nClick the card in the middle to read it at full size.',
    render: () => <HandDemo desktop />,
  },
  CREATION[2],
];

const DESKTOP_SHEET: Page[] = [
  {
    title: 'Your table',
    body: 'Your sheet stays on the left. Your cards sit on the table beside it, in a hand along the bottom.\n\nClick a card to bring it into focus and read it. Click it again, press Esc, or use Back to hand to put it away.',
    render: () => <HandDemo desktop />,
  },
  {
    title: 'Equip and act',
    body: 'Under the focused card are its controls: Equip, Modifiers, and whatever else that card does. Space equips too.\n\nRight click any card for its menu: favourite it, move it to another deck, export it, or delete it.',
    render: () => <WelcomeDemo />,
  },
  {
    title: 'Hit Points, Stress, Hope, Armor',
    body: 'Each row is split down the middle. One side clears, the other marks. Hold for the full effect, or double click when things are moving fast.\n\nThe split follows the value, so the side that clears is always the filled side.',
    render: ({ markDid }) => <HeartsDemo onDid={markDid} />,
  },
  {
    title: 'Decks and panels',
    body: 'The decks are listed beside the table: click one, or press Q and E. Manage cards and Sort this deck sit underneath.\n\nRest, Level Up and State open their panels next to the sheet, and Dice brings out the dice tray on the sheet itself. Esc closes whichever panel is on top.',
    render: () => <WelcomeDemo />,
  },
  DESKTOP_KEYS_PAGE,
  {
    title: 'Double click your portrait',
    body: 'Two clicks on your portrait open this character’s moodboard: a blank canvas that belongs to them, for faces, places, armour, anything you have collected.\n\nIt opens locked, so hold the lock for a second before you move anything.',
    render: () => <WelcomeDemo />,
  },
];

const DESKTOP_TOURS: Partial<Record<TourId, Page[]>> = { creation: DESKTOP_CREATION, sheet: DESKTOP_SHEET };

const TOURS: Record<TourId, Page[]> = { welcome: WELCOME, creation: CREATION, sheet: SHEET, campaigns: CAMPAIGNS, classcards: [], featurecards: [] };

const TITLE: Record<TourId, string> = {
  welcome: 'Welcome',
  creation: 'Making a hero',
  sheet: 'Using your sheet',
  campaigns: 'Running a game',
  classcards: 'Class cards',
  featurecards: 'Feature cards',
};

export function OnboardingScreen({ tour, onDone }: { tour: TourId; onDone: () => void }) {
  // A tour covers the screen it is teaching, so an arrival chime playing underneath belongs to
  // something the player cannot see yet (v0.28.0). Reuse the loading-screen guard: the sound is
  // DEFERRED rather than dropped, so it lands the moment the tour is dismissed and the screen it
  // announces is actually in front of them.
  useEffect(() => {
    beginLoading();
    return endLoading;
  }, []);
  const installMode = useInstallMode();
  const desktop = useDesktopPage();
  const [installed, setInstalled] = useState(false);
  // The install offer leads the welcome tour, and only there. It drops out the moment the app is
  // installed (the browser stops offering it, and the page has nothing left to say).
  const pages = useMemo(() => {
    const base = (desktop && DESKTOP_TOURS[tour]) || TOURS[tour];
    if (tour !== 'welcome') return base;
    // The keyboard page closes the welcome tour on a desktop browser; the install offer opens it on a
    // phone. The two audiences never overlap, so neither ever sees the other's page.
    const withKeys = desktop ? [...base, DESKTOP_KEYS_PAGE] : isDesktopWeb() ? [...base, KEYS_PAGE] : base;
    if (installMode === 'none' || installed) return withKeys;
    return [installPage(installMode, () => setInstalled(true)), ...withKeys];
  }, [tour, installMode, installed, desktop]);
  const [step, setStep] = useState(() => Math.min(tourStep(tour), pages.length - 1));
  const [didSteps, setDidSteps] = useState<Set<number>>(new Set());
  const safeStep = Math.min(step, pages.length - 1);
  // Installing is never required: the first page's Next reads "Not now" so it is plainly optional.
  const onInstallPage = tour === 'welcome' && installMode !== 'none' && !installed && safeStep === 0;
  const page = pages[safeStep];
  const last = safeStep === pages.length - 1;
  const did = didSteps.has(safeStep);
  const blocked = !!page.gate && !did;

  const markDid = useCallback(() => {
    setDidSteps((s) => (s.has(step) ? s : new Set(s).add(step)));
  }, [step]);

  const go = useCallback(
    (n: number) => {
      setStep(n);
      saveTourStep(tour, n);
    },
    [tour],
  );

  const finish = useCallback(() => {
    finishTour(tour);
    onDone();
  }, [tour, onDone]);

  const next = useCallback(() => {
    if (blocked) return;
    playSfx('buttonTap');
    if (last) finish();
    else go(safeStep + 1);
  }, [blocked, last, finish, go, safeStep]);

  /**
   * v0.25.0: the page counter at the bottom promises swiping, so swiping has to work.
   *
   * Left goes forward, right goes back, matching every paged interface a player has already used. A
   * page that gates on its gesture still refuses to advance, since the point of that gate is that you
   * felt the gesture; swiping past it would defeat it.
   */
  const swipe = useMemo(
    () =>
      Gesture.Pan()
        .activeOffsetX([-18, 18])
        .failOffsetY([-24, 24])
        .onEnd((e) => {
          'worklet';
          if (Math.abs(e.translationX) < 48 || Math.abs(e.velocityX) < 120) return;
          if (e.translationX < 0) runOnJS(next)();
          else if (safeStep > 0) runOnJS(go)(safeStep - 1);
        }),
    [next, go, safeStep],
  );

  /** Each page FADES in rather than appearing complete. Pages used to swap in one frame, which read
   *  as a glitch next to the rest of the app. */
  const fade = useSharedValue(1);
  useEffect(() => {
    fade.value = 0;
    fade.value = withTiming(1, { duration: 260, easing: Easing.out(Easing.quad) });
  }, [safeStep, fade]);
  const fadeStyle = useAnimatedStyle(() => ({ opacity: fade.value, transform: [{ translateY: (1 - fade.value) * 10 }] }));

  // Desktop keys: the arrows page through, Enter is Next, Escape skips.
  const front = useScreenFocus();
  const keys = useRef({ next, go, finish, safeStep });
  keys.current = { next, go, finish, safeStep };
  useEffect(() => {
    if (!desktop || typeof document === 'undefined') return;
    const onKey = (e: KeyboardEvent) => {
      if (e.defaultPrevented || e.ctrlKey || e.metaKey || e.altKey || !front()) return;
      const k = keys.current;
      if (e.key === 'ArrowRight') { e.preventDefault(); k.next(); }
      else if (e.key === 'ArrowLeft' && k.safeStep > 0) { e.preventDefault(); k.go(k.safeStep - 1); }
      else if (e.key === 'Escape') { e.preventDefault(); k.finish(); }
      else if (e.key === 'Enter' && (e.target as HTMLElement)?.getAttribute?.('role') !== 'button') { e.preventDefault(); k.next(); }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [desktop, front]);

  const nextLabel = last ? 'Got it' : blocked ? 'Try it first' : onInstallPage ? 'Not now' : 'Next';
  if (desktop) {
    // Desktop (v0.45.0): one wide card in the middle of the window, the illustration beside the words.
    return (
      // Leaving a tour by the header menu finishes it, as Skip does, and takes it off the stack.
      <AppScreen title={TITLE[tour]} navReplace navGuard={(leave) => { finishTour(tour); leave(); }} onBack={safeStep === 0 ? undefined : () => go(safeStep - 1)}>
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', paddingBottom: 30 }}>
          <ChamferBox chamfer={18} fill="rgba(14,17,22,0.94)" stroke="rgba(218,162,73,0.45)" strokeWidth={1.4} style={{ width: 1000, maxWidth: '100%', flexDirection: 'row', gap: 44, paddingHorizontal: 44, paddingVertical: 40, minHeight: 460 }}>
            <Animated.View style={[{ width: 440, alignItems: 'center', justifyContent: 'center' }, fadeStyle]}>
              {/* The illustrations are drawn for a phone column; a little larger suits the wide card. */}
              <View style={{ transform: [{ scale: 1.3 }] }}>{page.render?.({ did, markDid }) ?? null}</View>
            </Animated.View>
            <View style={{ flex: 1, justifyContent: 'space-between', gap: 24 }}>
              <Animated.View style={fadeStyle}>
                <Text style={{ color: Rune.goldBright, fontSize: 30, fontFamily: Display.black, letterSpacing: 1, textTransform: 'uppercase' }}>{page.title}</Text>
                <Text style={{ color: Rune.sheet, fontSize: 16, fontFamily: Body.medium, lineHeight: 25, marginTop: 16 }}>{page.body}</Text>
              </Animated.View>
              <View style={{ gap: 16 }}>
                <View style={{ flexDirection: 'row', gap: 9 }}>
                  {pages.map((_, i) => (
                    <Pressable key={i} onPress={() => go(i)} hitSlop={8} accessibilityRole="button" accessibilityLabel={`Step ${i + 1} of ${pages.length}`}>
                      <View style={{ width: 9, height: 9, backgroundColor: i === safeStep ? Rune.goldBright : 'rgba(218,162,73,0.3)', transform: [{ rotate: '45deg' }] }} />
                    </Pressable>
                  ))}
                </View>
                <View style={{ flexDirection: 'row', gap: 12, alignItems: 'center' }}>
                  <RuneButton label={nextLabel} kind="primary" height={46} style={{ minWidth: 200 }} disabled={blocked} muteSfx onPress={next} />
                  <RuneButton label="Skip" kind="ghost" height={46} style={{ minWidth: 120 }} onPress={finish} />
                </View>
                <Text style={{ color: Rune.muted, fontSize: 12, fontFamily: Body.medium }}>The arrow keys page through, and Esc skips.</Text>
              </View>
            </View>
          </ChamferBox>
        </View>
      </AppScreen>
    );
  }

  return (
    <AppScreen title={TITLE[tour]} onBack={safeStep === 0 ? undefined : () => go(safeStep - 1)}>
      {/* v0.23.0: real horizontal breathing room. AppScreen insets 18dp, which suits dense screens
          but left this prose almost against the border. */}
      <View style={{ flex: 1, justifyContent: 'space-between', paddingHorizontal: 12, paddingTop: 4 }}>
        <GestureDetector gesture={swipe}>
          <Animated.View style={fadeStyle}>
            {page.render?.({ did, markDid })}
            <Text style={{ color: Rune.goldBright, fontSize: 21, fontFamily: Display.black, letterSpacing: 0.8, textTransform: 'uppercase', marginTop: 14 }}>{page.title}</Text>
            <Text style={{ color: Rune.muted, fontSize: 14, fontFamily: Body.medium, lineHeight: 21, marginTop: 10 }}>{page.body}</Text>
          </Animated.View>
        </GestureDetector>

        <View style={{ gap: 14, paddingBottom: 10 }}>
          <View style={{ flexDirection: 'row', gap: 7, justifyContent: 'center' }}>
            {pages.map((_, i) => (
              <Pressable key={i} onPress={() => go(i)} hitSlop={8} accessibilityRole="button" accessibilityLabel={`Step ${i + 1} of ${pages.length}`}>
                <View style={{ width: 8, height: 8, backgroundColor: i === safeStep ? Rune.goldBright : 'rgba(218,162,73,0.3)', transform: [{ rotate: '45deg' }] }} />
              </Pressable>
            ))}
          </View>
          {/* muteSfx (v0.29.0): `next` plays the tap itself, because it is also the SWIPE handler and a
              swipe has no button to make the sound. Without this the button's own tap and next's land
              in the same millisecond and the click is heard twice. */}
          <RuneButton label={last ? 'Got it' : blocked ? 'Try it first' : onInstallPage ? 'Not now' : 'Next'} kind="primary" height={46} disabled={blocked} muteSfx onPress={next} />
          <RuneButton label="Skip" kind="ghost" height={36} onPress={finish} />
        </View>
      </View>
    </AppScreen>
  );
}
