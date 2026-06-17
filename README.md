<div align="center">

<img src="assets/images/icon.png" alt="RuneKeep" width="120" />

# RuneKeep

**An animation-first companion app for the [Daggerheart](https://www.daggerheart.com/) TTRPG.**

Build a hero, run the living character sheet, and manage your whole deck — fully offline, on your phone.

[![Latest release](https://img.shields.io/github/v/release/DavidMGDev/RuneKeep?label=download&sort=semver)](https://github.com/DavidMGDev/RuneKeep/releases/latest)
&nbsp;·&nbsp; Android (arm64) &nbsp;·&nbsp; Expo SDK 54 · React Native · Reanimated 4 · TypeScript

</div>

---

RuneKeep isn't a form with text fields. It's the Daggerheart sheet brought to life: hearts you **hold to
charge** and watch burst, a hand of cards that fans out and grows to **fullscreen** in place, decks you
flick between on a spinning gear, and a modifier engine that recomputes the whole sheet the instant you
equip a card. Everything ships in the app — no account, no server, no download-on-launch.

## Download

Grab the latest APK from the [**Releases**](https://github.com/DavidMGDev/RuneKeep/releases/latest) page
(`Runekeep.vX.X.apk`, ~75 MB, arm64-v8a).

1. On your phone, enable **Install unknown apps** for your browser/file manager.
2. Open the downloaded APK and install.
3. Launch RuneKeep — all card data is bundled, so it works with no connection.

> Debug-signed for sideloading. iOS isn't distributed; run it from source via Expo Go (below).

## Features

**Character creation** — a guided, card-by-card forge: class & subclass, ancestry (including **mixed
ancestry** — take the first trait of one and the second of another), community, two domain cards, the
trait array, experiences, weapons, armor, inventory and starting gold.

**The living sheet** — HP, Stress, Hope and Armor tracks with spring physics, particle bursts and
hold-to-charge / double-tap interactions; an **Incoming Damage** keypad that reads your thresholds and
applies the hit with a hold-to-confirm.

**The card carousel** — your loadout as a fanned hand. Tap to focus a card to fullscreen, hold to
equip/unequip (with an enabled-corner check), over-scroll the gear to switch decks, and drag cosmetic
**tokens** onto a card. Decks: Arsenal, Inventory, Beastform (Druid), Notes, plus your own **custom
categories** with custom icons.

**Cards & modifiers** — author **custom cards** (image or flat colour art, a title, a markdown
description, a type ribbon) and give them **effects**. Effects can be flat (+2 Max HP) or **formulas**
(× Proficiency, ½ Level rounded up, your Tier, …). The per-card **Modifiers panel** is read *and* write:
fix or add modifiers on any catalog card too. **Duplicate** a card to place copies in different
categories — each copy moves independently but shares one equip and applies its effect once.

**Beastform** — Druid wild shape done right: transforming unequips your weapons (auto-restored when you
revert), keeps armor and domains, blocks switching forms or equipping new domains mid-form, renames the
sheet to the creature, and auto-ends at 0 HP.

**Leveling & rest** — the full advancement flow (traits, HP/Stress, Evasion, Proficiency, domains,
subclass, multiclass) with per-level damage-threshold bonuses that stack on your armor; short/long rest
with dice rolls.

**Sound** — a native Web-Audio SFX engine (risers, pitch variation, contextual cues) in the built APK.

## Tech stack

- **Expo SDK 54** (managed, New Architecture) · React Native 0.81 · React 19 · TypeScript — pinned to
  SDK 54 so it runs in the owner's Expo Go.
- **Expo Router** — file-based navigation.
- **Reanimated 4 + Worklets + Gesture Handler** — all motion and gestures run on the UI thread.
- **react-native-svg** — crisp vector icons, card overlays, the modifier glyphs.
- **react-native-audio-api** — the SFX engine (native; silent in Expo Go, audible in the APK).
- A pure, unit-tested **modifier engine** (`src/lib/modifiers.ts`) computes every derived stat.

See [`docs/architecture.md`](./docs/architecture.md) for the responsive strategy, carousel design, and perf rules.

## Run from source

```bash
npm install --legacy-peer-deps
npx expo start          # press a / i, or scan the QR with Expo Go (SDK 54)
```

Useful checks:

```bash
npx tsc --noEmit        # types
npx jest                # the engine + pure-module tests
npx expo lint           # lint
```

## Build the offline APK

A self-contained build script provisions the Android toolchain (direct-download, no sdkmanager) and
produces a small arm64 release APK, then publishes a GitHub release:

```bash
npm run prebuild:android         # first time only — generates the native android/ project
git checkout -- package.json     # revert expo-prebuild's package.json flip
npm run build:apk                # provisions the toolchain, assembles + publishes the APK
```

The bundle stays under ~90 MB, so the whole rulebook's card data ships inside the app — no database,
no launch-time download. See [`apk-build/README.md`](./apk-build/README.md) for the toolchain notes and gotchas.

## Project layout

```
src/app/            Expo Router routes & layouts only
src/components/     shared components (card editor, effects editor, loaders, …)
src/features/       feature areas + local components (character-sheet/, create/, cards/, …)
src/lib/            pure logic: modifier engine, leveling, rest, wildshape, character file
src/constants/      theme (the Rune palette sampled from the art), identity
assets/             card art (webp), images, sounds
docs/               architecture notes (responsive strategy, carousel, perf rules)
```

## Contributing

Read [`AGENTS.md`](./AGENTS.md) first; for the uniformly-scaled `DesignStage` responsive strategy and the
card-carousel design see [`docs/architecture.md`](./docs/architecture.md).
Keep screens runnable in Expo Go during development; favour the `Rune` theme over raw hex; TypeScript and
`StyleSheet.create` throughout (no Tailwind/NativeWind).

## Acknowledgements

Daggerheart is © Darrington Press. RuneKeep is an unofficial, fan-made companion tool; card text and art
are from the Daggerheart SRD/rulebook for personal play. Not affiliated with or endorsed by Darrington Press.
