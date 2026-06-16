# RuneKeep — agent orientation

RuneKeep is an animation-first **Daggerheart** TTRPG companion app. Expo (SDK 54) + React Native
0.81 + Expo Router + React 19, New Architecture, TypeScript. Screens are dense, art-driven
compositions with tappable/spring icons, particle effects, and floating physics cards.

> Pinned to **SDK 54** so the owner's Expo Go (54.0.8) runs it. Read the versioned docs at
> https://docs.expo.dev/versions/v54.0.0/ before writing native/config code. Don't assume older API shapes.

## Where things live
- `src/app/**` — Expo Router routes & layouts ONLY (file-based routing). `index.tsx` is home.
- `src/components/**` — shared, reusable components.
- `src/features/<feature>/**` — feature screens + their local components (e.g. `character-sheet/`).
- `src/constants/theme.ts` — the `Rune` palette (sampled from the art) + spacing. Use it, not raw hex.
- `src/hooks/**` — shared hooks.
- `assets/art/**` — game art PNGs referenced by screens (`require('@/assets/art/<file>')`... note
  `@/` maps to `src/`, so import art via a relative path or the `assets` alias — see tsconfig).
- `docs/architecture.md` — the load-bearing technical decisions (DesignStage responsive strategy, card
  carousel, perf rules). Read it before laying out a screen or touching the carousel.
- `src/lib/**` — pure, unit-tested logic (modifier engine, leveling, rest, wildshape, character file).

## Laying out a screen
The UI is already built — there's no live mockup oracle to translate from anymore. Author in the fixed
**412×892** design space and render inside `<DesignStage>`: author in design px, scale uniformly, never
stretch non-panel art (lock `aspectRatio` / `resizeMode="contain"`). See `docs/architecture.md` ›
*Responsive layout* for the full rationale.

## Animation conventions
- Reanimated 4 + worklets + gesture-handler are already installed and wired (`GestureHandlerRootView` in `_layout.tsx`).
- Add `@shopify/react-native-skia` (particles via `<Atlas>`) and `react-native-svg` only when first used: `npx expo install ...` (never plain `npm install` for Expo-tracked libs).
- Wrap interactive art in a small pressable that owns a `scale` shared value — never drop a bare `<Image>` where touch behavior is expected later.

## Conventions
- TypeScript, functional components, `StyleSheet.create`. No NativeWind/Tailwind in this project.
- Keep screens runnable in Expo Go during development.
