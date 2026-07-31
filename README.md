<div align="center">

<img src="assets/images/icon.png" alt="RuneKeep" width="120" />

# RuneKeep

**An animation-first companion app for the [Daggerheart](https://www.daggerheart.com/) TTRPG.**

Build a hero, run the living character sheet, and manage your whole deck. Offline, on your phone or in your browser.

[![Latest release](https://img.shields.io/github/v/release/DavidMGDev/RuneKeep?label=download&sort=semver)](https://github.com/DavidMGDev/RuneKeep/releases/latest)
&nbsp;·&nbsp; Android (arm64) &nbsp;·&nbsp; Web (PWA) &nbsp;·&nbsp; Expo SDK 54 · React Native · Reanimated 4 · TypeScript

*Unofficial fan project. Not affiliated with or endorsed by Darrington Press.*

</div>

---

RuneKeep isn't a form with text fields. It's the Daggerheart sheet brought to life: hearts you **hold to
charge** and watch burst, a hand of cards that fans out and grows to **fullscreen** in place, decks you
flick between on a spinning gear, and a modifier engine that recomputes the whole sheet the instant you
equip a card. Everything ships in the app: no account, no server, no download-on-launch.

One thing worth knowing up front: **RuneKeep never rolls for you.** You roll your own dice and tell the
app what happened. The damage calculator and the rest flow take physical results as input.

## Get it

### Android

Grab the latest APK from the [**Releases**](https://github.com/DavidMGDev/RuneKeep/releases/latest) page
(`Runekeep.vX.X.apk`, arm64-v8a).

1. On your phone, enable **Install unknown apps** for your browser or file manager.
2. Open the downloaded APK and install.
3. Launch RuneKeep. All card data is bundled, so it works with no connection.

> Debug-signed for sideloading. It is not on Google Play; see [Distribution](#distribution) for why that
> is not just a matter of uploading it.

### Web

The same app runs in a browser, built from the same source. Each release ships a
`RuneKeep-web-vX.X.X.zip` containing a static site: unzip it behind any static host and open
`index.html`. There is no server component and nothing to configure.

It is a **PWA**, so on Android you can install it to your home screen and it behaves like an app,
service worker and all. Characters live in **IndexedDB** on that browser and that device, which means:

- clearing site data deletes your characters, so export anything you care about (`.rkp` files);
- private/incognito windows start empty and forget everything on close;
- characters do not sync between the browser build and the Android build. Move them with export/import.

Keyboard control is a first-class citizen in the browser: arrows or WASD to move through the hand and
fan it open, Space to equip, E for edit mode, Enter to confirm, Escape to back out.

### iOS

Not distributed. Run it from source with Expo Go (below). It is pinned to **SDK 54** so the owner's Expo
Go build can run it.

## Features

**Character creation** is a guided, card-by-card forge: class and subclass, ancestry (including **mixed
ancestry**, taking the first trait of one and the second of another), community, two domain cards, the
trait array, experiences, weapons, armor, inventory and starting gold.

**The living sheet** has HP, Stress, Hope and Armor tracks with spring physics, particle bursts and
sound; a card carousel with a spinning gear for fast scrolling; hold-to-equip cards that feed a modifier
engine; tokens you can place on cards; and a timeline that can rewind the character to any earlier
point.

**Cards** are the whole model. Your class, your ancestry, the sword you carry and the notes you scribble
at the table are all cards. You can author your own, import and export them, share them over NFC on
Android, and bundle them into homebrew expansions.

**DM Mode** covers parties, sessions, encounters and an adversary roster, in its own desaturated palette.

## Running from source

```bash
npm install
npx expo start          # then press a for Android, or scan with Expo Go
npx expo start --web    # the browser build, live-reloading
```

Use `npx expo install` (not plain `npm install`) for any Expo-tracked library, so versions stay pinned to
what SDK 54 expects.

### Checks

```bash
npm run typecheck
npm run lint
npm test
npm run forge-hash      # regenerate the forged-card cache signature after changing card art or game data
```

`forge-hash` matters: card bitmaps are cached on device against a signature of the card components and
the game data. A test fails if the committed signature is stale, which is what stops a changed card from
serving a picture of its old self forever.

### Building a release

`apk-build/build-apk.ps1` provisions an Android toolchain, prebuilds, assembles a small arm64 release
APK, and publishes a GitHub release:

```bash
npm run prebuild:android         # first time only, generates the native android/ project
git checkout -- package.json     # revert expo-prebuild's package.json flip
npm run build:apk                # provisions the toolchain, assembles and publishes the APK
```

The web build is `npx expo export --platform web`, which writes a static `dist/`. See
[`apk-build/README.md`](./apk-build/README.md) for toolchain notes and
[`docs/web-deploy.md`](./docs/web-deploy.md) for hosting.

## Project layout

```
src/app/            Expo Router routes & layouts only
src/components/     shared UI kit (card editor, effects editor, loaders, chamfer box, …)
src/features/       feature areas + their own components/ (character-sheet/, create/, cards/, …)
src/data/           all static game data + typed accessors (catalog, equipment, loot, wildshape, …)
src/lib/            pure logic: modifier engine, leveling, rest, character file, sfx
src/constants/      theme (the Rune palette sampled from the art), identity
assets/             card art, images, sounds
docs/               architecture notes (responsive strategy, carousel, perf rules)
scripts/            codegen and browser-driving tools (web-probe, web-profile, forge-hash)
```

## Contributing

Read [`AGENTS.md`](./AGENTS.md) first. For the uniformly-scaled `DesignStage` responsive strategy and the
card-carousel design see [`docs/architecture.md`](./docs/architecture.md). Keep screens runnable in Expo
Go; favour the `Rune` theme over raw hex; TypeScript and `StyleSheet.create` throughout, no
Tailwind/NativeWind. No em dashes in anything a player can read.

## Licensing

This repository contains three different kinds of material, and they are **not** under the same terms.
Please read this section before reusing anything.

### 1. The application code

The source code written for this project is offered under the **MIT License**. That covers `src/`,
`scripts/`, the build tooling and the documentation.

> **Note:** the `LICENSE` file at the repository root is currently the boilerplate MIT licence that
> `create-expo-app` generates, and it still carries **Expo's** copyright line rather than this project's.
> It needs replacing with an MIT licence in the project owner's name before anyone relies on it.

### 2. Daggerheart game content

Daggerheart is © Darrington Press. Rules text, card mechanics, class, ancestry, community and domain
content are Darrington Press material. Darrington Press publishes a Daggerheart SRD under the
**Darrington Press Community Gaming License (DPCGL)**, which is the licence any Daggerheart fan tool
should be operating under.

Nothing in this README grants you rights to that content. If you fork this project or reuse its data,
read the current DPCGL text yourself and comply with it directly. In general terms it governs
attribution, how you may and may not use Darrington Press trademarks, and what you can do commercially.
The operative text is the licence itself, not this summary.

### 3. Bundled third-party assets

These are the ones that need attention, and they are called out here rather than buried:

- **Card artwork** (`assets/extracted_cards/`, roughly 740 files) is extracted from Daggerheart
  rulebook PDFs. **Published book illustrations are generally not the same thing as SRD content**, and a
  licence that covers rules text does not automatically cover the art printed alongside it. This is the
  single biggest reuse and distribution risk in the repository.
- **Sound effects** (`assets/sounds/`) include a folder of joke sounds (`OnLoseHP-1in10chance/`) drawn
  from games, films and internet memes. Those are third-party copyrighted works owned by companies that
  do enforce, and they are unlicensed here.

Neither category is covered by the MIT licence above, and neither should be assumed redistributable.

## Distribution

The project owner's stated goal is a Google Play release. Two things stand between this repository and
that, and both are about the section above rather than about the code:

1. **The extracted card artwork.** A commercial app store listing is a different posture from a personal
   fan tool. Before publishing, either confirm in writing that the art is covered by the licence you are
   relying on, or replace it. The app already renders many cards itself from data, which is the path that
   does not depend on book scans.
2. **The meme sound pack.** Straightforward to resolve: drop the folder, or replace it with sounds you
   own or that are licensed for redistribution. There is no ambiguity to research here.

Also worth doing before a store listing: a proper release-signing key rather than the debug signature,
a privacy policy (the app collects nothing and has no network calls, which makes this short but Play
still requires it), and the attribution and trademark wording the DPCGL asks for.

**This is not legal advice.** It is a description of what is in the repository so the decision can be
made with the facts in view. For a paid or ad-supported release in particular, get an actual opinion.

## Acknowledgements

Daggerheart is © Darrington Press. RuneKeep is an unofficial, fan-made companion tool, built for personal
play at the owner's table. Not affiliated with, sponsored by, or endorsed by Darrington Press.
