import { useCallback, useEffect, useMemo, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, { Easing, runOnJS, useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';

import { AppScreen } from '@/components/app-screen';
import { RuneButton } from '@/components/rune-button';
import { Body, Display, Rune } from '@/constants/theme';
import { finishTour, saveTourStep, type TourId, tourStep } from '@/lib/onboarding-store';
import { isDesktopWeb } from '@/lib/pwa-install';
import { useInstallMode } from '@/lib/pwa-install';
import { playSfx } from '@/lib/sfx';

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
  render: (ctx: { did: boolean; markDid: () => void }) => React.ReactElement;
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
  {
    title: 'The wheel under your portrait',
    body: 'Press the emblem below your portrait and drag to a wedge.\n\nState shows your modifiers and everything that has happened to this character. Then Level Up, Rest, New Card, and Cards for the rest.',
    render: ({ markDid }) => <WheelDemo onDid={markDid} />,
  },
];

const TOURS: Record<TourId, Page[]> = { welcome: WELCOME, creation: CREATION, sheet: SHEET };

const TITLE: Record<TourId, string> = {
  welcome: 'Welcome',
  creation: 'Making a hero',
  sheet: 'Using your sheet',
};

export function OnboardingScreen({ tour, onDone }: { tour: TourId; onDone: () => void }) {
  const installMode = useInstallMode();
  const [installed, setInstalled] = useState(false);
  // The install offer leads the welcome tour, and only there. It drops out the moment the app is
  // installed (the browser stops offering it, and the page has nothing left to say).
  const pages = useMemo(() => {
    const base = TOURS[tour];
    if (tour !== 'welcome') return base;
    // The keyboard page closes the welcome tour on a desktop browser; the install offer opens it on a
    // phone. The two audiences never overlap, so neither ever sees the other's page.
    const withKeys = isDesktopWeb() ? [...base, KEYS_PAGE] : base;
    if (installMode === 'none' || installed) return withKeys;
    return [installPage(installMode, () => setInstalled(true)), ...withKeys];
  }, [tour, installMode, installed]);
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

  return (
    <AppScreen title={TITLE[tour]} onBack={safeStep === 0 ? undefined : () => go(safeStep - 1)}>
      {/* v0.23.0: real horizontal breathing room. AppScreen insets 18dp, which suits dense screens
          but left this prose almost against the border. */}
      <View style={{ flex: 1, justifyContent: 'space-between', paddingHorizontal: 12, paddingTop: 4 }}>
        <GestureDetector gesture={swipe}>
          <Animated.View style={fadeStyle}>
            {page.render({ did, markDid })}
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
          <RuneButton label={last ? 'Got it' : blocked ? 'Try it first' : onInstallPage ? 'Not now' : 'Next'} kind="primary" height={46} disabled={blocked} onPress={next} />
          <RuneButton label="Skip" kind="ghost" height={36} onPress={finish} />
        </View>
      </View>
    </AppScreen>
  );
}
