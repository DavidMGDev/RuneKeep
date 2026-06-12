# RuneKeep — Product

## Register

product

## Users

Daggerheart TTRPG players, mobile-first (Android phones at the table). Two distinct contexts:

1. **In play** (the character sheet): mid-session, one-handed, glancing constantly to tap resource
   trackers (HP, Stress, Hope, Armor) and flip through ability cards. Speed and legibility win.
2. **Between sessions** (everything else): browsing the card library on the couch, building a new
   character before session zero, importing a friend's character file. Calmer pace; clarity,
   structure and easy navigation win over spectacle.

## Product Purpose

A living digital companion for Daggerheart. Core jobs:

- **Track resources during play** — the character sheet (shipped, owner-approved; do not regress it).
- **Browse the full card library** — every domain/ancestry/community/subclass card, scrollable,
  filterable, fullscreen-readable.
- **Create and manage characters** — guided level-1 creation (class → subclass → ancestry →
  community → domain cards), a character roster, and characters as shareable files (import/export).

Success: a player runs an entire session and builds their next character without touching paper.

## Brand Personality

Heroic dark-fantasy, premium and confident. Bold, sharp, a little ceremonial. Not cute, not corporate.
Three words: **forged, deliberate, arcane.**

Energy is tiered by context: the character sheet is the *stage* (rich interaction, particles,
ceremony); the surrounding app is the *keep* (calm, structural, fast). Outside the sheet, motion is
simple and purposeful — fades, slides, unlocks — never showpieces. The card art itself is the
spectacle; the chrome frames it and gets out of the way.

## Anti-references

- Generic SaaS dashboards, rounded-corner card grids, pastel/neutral palettes, cookie-cutter
  bottom-tab apps.
- One-for-one clones of the character sheet on other screens: reuse the LANGUAGE (chamfers, gold
  hairlines, ink/parchment, Archivo), never the sheet's exact panel layout. The HP bar frame is
  sheet-only.
- Over-decorated menus where buttons drown in ornament; D&D Beyond's dense web-page feel.
- Stock spinner-on-white loading screens.

## Design Principles

1. **The sheet is sacred.** Carousel feel, resource interactions, LOD pipeline are owner-approved;
   surrounding app must never degrade them.
2. **Card art is the hero.** Chrome is flat, dark and minimal so the 750×1050 art carries the color.
   Use LOD thumbs for any ambient/decorative card rendering; full-res only when a card is focused.
3. **Structure over spectacle (outside the sheet).** Clear hierarchy, generous tap targets, obvious
   progress/completion states. Simple animations with intent (a tab unlocking, a deck fading) beat
   ambient motion.
4. **Always know where you are and what's missing.** Multi-step flows (character creation) surface
   per-step completion at a glance; never let a user hunt for the unfinished tab.
5. **Loading is designed.** Every async surface has an intentional loading state in the app's
   language — never a bare spinner, never a blank flash.
6. **Characters are files.** Character data is a versioned, serializable document the user owns and
   can share; UI state derives from it, never the reverse.

## Accessibility & Inclusion

- Respect reduced motion (existing `useReducedMotion` gates all ceremony; new screens follow).
- All interactive elements get `accessibilityRole`/`accessibilityLabel`; tap targets ≥44dp or
  hitSlop-extended.
- Text contrast: AA on parchment and ink surfaces (bronze for labels on parchment, ivory on ink).
- Labels sized for NATIVE glyph widths (web renders narrower; never trust web fit).
