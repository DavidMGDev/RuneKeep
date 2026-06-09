<div align="center">

# 🛡️ RuneKeep

**An animation-first companion app for the [Daggerheart](https://www.daggerheart.com/) TTRPG.**

Expo · React Native · Reanimated 4 · Skia · TypeScript

</div>

---

RuneKeep brings the Daggerheart character sheet to life: tappable icons that spring to life,
particle effects (embers, sparks, magical dust), and dynamic cards that float, drag, and throw
with real physics — all at 60fps on the GPU.

## Stack
- **Expo SDK 56** (managed) · React Native 0.85 · React 19 · New Architecture
- **Expo Router** — file-based navigation
- **Reanimated 4 + Worklets + Gesture Handler** — UI-thread animation & gestures (bundled)
- **Skia** + **react-native-svg** — GPU particles, shaders, crisp vectors (added per-feature)
- TypeScript throughout

See [`docs/animation-stack.md`](./docs/animation-stack.md) for the full, version-verified library rationale.

## Getting started
```bash
npm install
npx expo start          # then press i / a, or scan the QR with Expo Go
```

## Project layout
```
src/app/            Expo Router routes & layouts only
src/components/     shared components
src/features/       feature screens + local components (e.g. character-sheet)
src/constants/      theme (Rune palette), spacing
src/hooks/          shared hooks
assets/art/         Daggerheart sheet art (PNG)
docs/               animation stack + architecture decisions (ADRs)
design-reference/   Ligma export = ground-truth mockup oracle (see AGENTS.md)
```

## Contributing / agents
Read [`AGENTS.md`](./AGENTS.md) first — it explains the design-reference → screen workflow and the
responsive `DesignStage` strategy ([`docs/adr/0001`](./docs/adr/0001-responsive-design-stage.md)).
