# RuneKeep Character Sheet — UI/UX Fix Brief

> Hand-off for the UI design agent. Source: a deep screenshot + codebase review of the single
> character sheet (`src/features/character-sheet/redesign/redesigned-sheet.tsx`) running in Expo on
> web/Expo Go. The owner has reviewed the findings and confirmed the decisions below.
>
> **Your job:** turn this into a PRD via `/to-prd`, then implement. Treat the "Authoritative product
> decisions" as fixed requirements — do not relitigate them. Everything else is a prioritized backlog
> with evidence and acceptance criteria.

---

## 0. Orientation (read first)

- **Target & verification:** Phone (Expo Go, SDK 54) is the real target, but the owner verifies on
  **web** and fixes propagate to mobile. So: fixes must look correct in the browser render, AND must
  not rely on web-only behavior that silently no-ops on native (see the `adjustsFontSizeToFit`
  caveat in §5). Verify both; never trust a fix that only works because web cheats.
- **Architecture:** one screen, authored in a fixed **412×892 design space**, uniformly scaled by
  `DesignStage` (see `docs/adr/0001-responsive-design-stage.md`). All coordinates below are design px.
- **Signature style (must hold):** chamfered 45° edges, **no rounded corners**, flat, red + gold on
  warm parchment / dark ink panels. Priority order: resource **icons** (HP / Armor / Stress / Hope —
  big, framed) > traits > character info.
- **File map for everything referenced here:**
  - Composition: `src/features/character-sheet/redesign/redesigned-sheet.tsx`
  - Frame + class banner: `src/features/character-sheet/components/sheet-frame.tsx`
  - Trait banners: `src/features/character-sheet/components/trait-banners.tsx`
  - Pip primitives: `src/features/character-sheet/components/primitives.tsx`
  - Pip resolver: `src/lib/pips.ts`
  - Character data/model: `src/features/character-sheet/character.ts`
  - Carousel: `src/features/character-sheet/components/card-carousel.tsx`,
    `carousel-geometry.ts`, `carousel-context.tsx`, `components/fullscreen-card.tsx`,
    `components/expand-indicator.tsx`, `components/card.tsx`, `card-data.ts`
  - Frames/SVG: `src/features/character-sheet/redesign/frame-svgs.tsx`, `redesign/chamfer.tsx`
  - Theme: `src/constants/theme.ts`; Accent: `src/components/accent.tsx`
  - Art wrappers: `src/components/art-image.tsx`, `src/components/pressable-art.tsx`

---

## 1. Authoritative product decisions (owner-confirmed — these are requirements)

These answer the open questions from review. Build to these.

### D1 — Golden hearts (HP ×2 mechanic)
Hearts represent HP. A **golden** heart counts as **×2**; a **red** heart counts as ×1. Right now
every heart renders red and the numeric tracker is a separate hard-coded value, so they disagree.
- The numeric HP must be **derived from the heart pips**, never an independent field that can drift.
- With the current pips (5 filled, all red) the correct readout is **`5 / 12`**, not `10 / 12`.
- Add a **golden heart state** to the pip vocabulary and the art mapping; the displayed
  `current / max` = Σ(worth of filled hearts) / Σ(worth of all heart capacity).
- **Exact fill rule is specified in §1A — implement it precisely.**

### D2 — Portrait is a temporary placeholder
The pale sparkle in the portrait frame is a **temp placeholder until a photo picker** fills it with
an image. Keep it for now, but the portrait frame should be a tappable affordance that will (later)
open an image picker. Add a quiet "tap to add portrait" affordance so the top-left quadrant doesn't
read as accidental empty space.

### D3 — Card model interaction (this is the biggest change — see §2 for full spec)
Owner **dislikes** the current 1-second auto-collapse + tap-to-lock. Replace the whole gesture model:
- **Tap or swipe up** on the compact hand → **open/expand** the hand.
- **Tap a single card** → that card goes **fullscreen / focused**.
- **Swipe up** (from the hand) → center card goes **fullscreen / focused** — but the **threshold is
  far too high right now** (must drag ~78px up). Lower the sensitivity substantially.
- **Swipe down** → collapse the hand / **close the fullscreen card**.
- A **device shake** OR a downward swipe should close the fullscreen card model.
- **Remove** the 1s settle timer and the tap-to-lock state machine entirely.

### D4 — Origin badges open cards (not values)
The three octagon badges (Subclass, Ancestry, Community) are **not** meant to show text values. They
should be **tappable and open the associated card**. For now: **pressing any of the three badges
shows a random card from the Arsenal/abilities deck, fullscreen.** (Wire real per-badge cards later.)
Also: fix the label collision (§3, C1) — the rhombus glyph currently sits on top of the label text
because the octagon SVG's bottom vertex lands where the letters are.

---

## 1A. D1 — Golden heart math (precise spec)

There are **always exactly 6 heart slots**. Each slot is **empty**, **red** (worth 1 HP), or
**golden** (worth 2 HP). Golden hearts are pure overflow: a slot only turns golden **after all 6 are
red** — i.e. golden hearts exist only for characters with **7+ HP**. Below 7 HP the player only ever
sees red and empty hearts.

### Rules
- HP is added/removed **in order**. Filling: empties become red left→right until all 6 are red, then
  reds become golden left→right. Losing HP reverses exactly: golden→red first (from the front), then
  red→empty (from the back).
- Capacity = `slots × 2` = **12** (six golden hearts). So `max` HP = 12 with the current 6 slots.
- The numeric tracker is **derived** from HP; it is never stored independently.

### Algorithm (pure function of current HP)
```ts
// slots = 6, hp = current hit points (0..12)
function resolveHearts(hp: number, slots = 6) {
  const golden = Math.max(0, Math.min(slots, hp - slots)); // HP above 6 → golden, front-loaded
  const red    = Math.min(slots - golden, hp - 2 * golden); // remaining HP shown as red
  const empty  = slots - golden - red;
  // visual order, left → right: [golden × golden][red × red][empty × empty]
  return { golden, red, empty, current: hp, max: slots * 2 };
}
```

### State table (slots = 6)
| HP  | Golden | Red | Empty | Hearts (L→R)            | Readout |
|-----|:------:|:---:|:-----:|-------------------------|---------|
| 0   | 0      | 0   | 6     | `· · · · · ·`           | 0 / 12  |
| 5   | 0      | 5   | 1     | `♥ ♥ ♥ ♥ ♥ ·`           | 5 / 12  |
| 6   | 0      | 6   | 0     | `♥ ♥ ♥ ♥ ♥ ♥`           | 6 / 12  |
| 7   | 1      | 5   | 0     | `★ ♥ ♥ ♥ ♥ ♥`           | 7 / 12  |
| 8   | 2      | 4   | 0     | `★ ★ ♥ ♥ ♥ ♥`           | 8 / 12  |
| 12  | 6      | 0   | 0     | `★ ★ ★ ★ ★ ★`           | 12 / 12 |

(`★` = golden ×2, `♥` = red ×1, `·` = empty.)

### Worked transition (the owner's example)
- 7 HP → `★ ♥ ♥ ♥ ♥ ♥` ("first one golden, five red"). Lose 1 HP → 6 HP → `♥ ♥ ♥ ♥ ♥ ♥` (the golden
  reverts to red, dropping the +1 it carried). Lose 1 more → 5 HP → `♥ ♥ ♥ ♥ ♥ ·`.

### Acceptance criteria
- AC1A.1 — Hearts are computed by a pure function of HP (unit-test it like `pips.ts`); no separate
  `hitPoints.current` field that can drift. Refactor `character.ts` so HP is the single source.
- AC1A.2 — Golden never appears unless all 6 are red (HP ≥ 7).
- AC1A.3 — Golden is front-loaded, empties are back-loaded; the order matches the table exactly.
- AC1A.4 — The numeric readout always equals `current / 12` and always equals the summed pip worth.
- AC1A.5 — A distinct **golden heart art** exists, clearly different from red at the smallest rendered
  size (ties to C3 spacing and R3 state-distinction).

---

## 2. Card carousel — full interaction redesign (highest priority)

Replaces the current model in `card-carousel.tsx` / `carousel-context.tsx` / `fullscreen-card.tsx`.
The docs in `docs/card-carousel-architecture.md` are now **stale** — update them to match the new
model as part of this work.

### State model (simplify)
Three states only: **compact → expanded → fullscreen**. Remove `held`, `window`, `locked`, the
`timerGen` countdown, and `armCollapse`/`setTimeout` logic.

### Gestures (new)
| From | Gesture | Result |
|---|---|---|
| Compact hand | tap **or** swipe up | Expand the hand |
| Expanded hand | **tap a single card** | That card → fullscreen/focused |
| Expanded hand | swipe up | Center card → fullscreen/focused (low threshold) |
| Expanded hand | swipe down | Collapse to compact |
| Fullscreen card | swipe down **or** device shake | Close back to the hand |
| Hand (any) | horizontal drag | Scroll the hand (keep current 1:1 feel) |

### Acceptance criteria
- AC2.1 — No timer anywhere; the hand never auto-collapses. Removing your finger leaves it where it is.
- AC2.2 — Tapping a **specific** card focuses **that** card (centers + flies it fullscreen), not just
  "toggle expand." Currently any tap toggles a lock; that's wrong.
- AC2.3 — Swipe-up-to-fullscreen triggers with a **light, natural** flick. Replace the fixed
  `FS_TRIGGER = 78` (`card-carousel.tsx:44`) with a much lower distance **and/or** a velocity trigger
  (e.g. fire on either ~24–32 design-px up or `velocityY` over a low threshold). Tune on device.
- AC2.4 — Swipe-down collapses the hand from expanded, and closes the card from fullscreen — the same
  intuitive "push it away" direction at both levels.
- AC2.5 — Device-shake closes the fullscreen card (use accelerometer; `expo-sensors` is SDK-54 safe).
  If shake proves unreliable in Expo Go, ship swipe-down as primary and gate shake behind a flag.
- AC2.6 — Discoverability: on first open of a session, show a brief, **non-text** hint that the hand
  is interactive (e.g. a one-time gentle bob/peek of the cards). The current 6px pulsing dot
  (`expand-indicator.tsx`) is sub-perceptual under the dim veil — redesign or replace it.
- AC2.7 — Fullscreen card needs a **visible close affordance** (a chevron/handle or a faint "swipe
  down" chip), not a tap-anywhere secret.
- AC2.8 — While expanded, the dimmed sheet behind the veil must not leave **dimmed-but-still-tappable**
  controls. Currently the veil is `pointerEvents="none"` so hearts/armor/badges above y≈414 stay live
  while visually disabled (`redesigned-sheet.tsx` `ExpandVeil`, `card-carousel.tsx:240`). Either block
  input under the veil or keep those controls visually fully active.

### Carousel feel notes
- Deck toggle (the black rhombus under the portrait, `redesigned-sheet.tsx:99`) currently teleports
  `rotation` with no transition and gives no indication of which deck (Abilities vs Inventory) is
  active. Animate the swap and show the active deck.

---

## 3. Critical layout / collision bugs (pixel/math-confirmed)

Each is confirmed by reading the geometry or scanning the rendered screenshot.

- **C1 — Octagon badge labels are overwritten by the frame's bottom vertex.**
  Label top = `size*0.82 = 45.9`, but the octagon SVG height = `size*1.04 = 58.2`, so the diamond
  vertex sits on the word's center → renders "SUB◆ASS / ANC◆TRY / COMM◆ITY".
  `redesigned-sheet.tsx:65-76` (`OctaBadge`). **Fix:** move the label below the full octagon (or
  shrink the frame / relocate the glyph) so text never overlaps the vertex. (Ties to D4.)

- **C2 — Character name collides with the top frame finial.**
  Name top = 14 (`redesigned-sheet.tsx:103`); `SheetFrame` paints `longBorder` **over** content
  (`:172`) and the border art has a center diamond finial + dark notch around x≈206, y≤28 — it lands
  on the name. Confirmed: foreign dark/blue pixels inside the text band at the screen's horizontal
  center. **Fix:** lower the name start, or move the finial, or render the name above the frame layer.
  Test with a long name (overflow + 2-line wrap).

- **C3 — Hearts overlap each other.**
  Row width 222 < 6 × 38 = 228 (`redesigned-sheet.tsx:137`), so `space-between` goes negative and
  hearts fuse edge-to-edge. **Fix:** widen the row or shrink the pip so 6 hearts fit with positive gaps.

- **C4 — Armor pip grid is flush to the panel and fights panel ornaments.**
  Grid right edge ≈ 395 vs panel edge 396 (`redesigned-sheet.tsx:123-130`); the `armorPanel` art's
  internal brackets pass through the shield pips ("vertical lines cutting the shields" in the shot).
  **Fix:** inset the grid; verify pips clear the panel's printed ornaments.

- **C5 — Cards draw over the bottom gold frame.**
  `CardCarousel` mounts after `SheetFrame` (`redesigned-sheet.tsx:172-175`), so compact cards cross
  the border that is meant to be topmost chrome → the bottom frame reads broken. **Fix:** restack so
  the frame stays above the compact hand (the intentional "peek under the edge" can be preserved with
  a mask/clip rather than by painting over the frame).

- **C6 — LVL/PROF panel and octagon SVGs are stretched.**
  `ProvidedFrame` defaults to `preserveAspectRatio="none"` (`frame-svgs.tsx:28-33`); the 52×148 LVL
  panel and 56×58.2 octagons distort their corner ornaments. **Fix:** use `meet` (or author boxes to
  the SVG's native aspect) for ornamental frames; reserve `none` for true panel backgrounds.

- **C7 — Two sheet corner radii + a style contradiction.**
  Body bg radius 26 (`redesigned-sheet.tsx:91`) vs `SheetBackground` radius 30 (`sheet-frame.tsx:10`),
  and **rounded corners at all** contradict the "chamfered, no rounded corners" signature. A 1px ivory
  seam is visible at the sheet's right edge behind the frame. **Fix:** unify; move the sheet edge to a
  chamfered shape consistent with the frame; kill the white bleed.

- **C8 — ExpandIndicator dot is mispositioned and sub-perceptual.**
  `box(203,701,...)` (`expand-indicator.tsx:30`) overlaps trait banner #3's right edge (banner ends
  x≈205); a 6px dot under the dim veil communicates nothing. Folds into AC2.6.

---

## 4. Resource semantics

- **R1 — Implement golden hearts + derived HP (see D1 and the precise spec in §1A).**
  Extend the pip vocabulary in `pips.ts` (currently `active | empty | depleted | locked`) and the
  heart art mapping (`redesigned-sheet.tsx:31`) with a **golden** state. Compute hearts via the §1A
  `resolveHearts(hp)` function; the numeric tracker derives from HP. Remove the independent
  `hitPoints.current` source of truth — HP is the single source. Sample data must be self-consistent
  (5 HP → 5 red + 1 empty, "5 / 12").

- **R2 — Surface the Armor score.**
  `armorScore: 4` (`character.ts:73`) is never rendered; armor shows 12 icons with no number, while HP
  shows both, and Hope/Stress show pips only — three grammars for four tracks. Decide one rule (the
  owner's documented intent is icons-first; if the score must appear for play, give it a consistent,
  small numeric slot). Acceptance: a player can read damage reduction without opening a rulebook.

- **R3 — 4-state pip language is unlabeled and the states are hard to tell apart.**
  active / empty(dashed) / depleted / locked(gray) must be inferred; at 20px, stress-depleted (dashed
  red) vs locked (gray) and the armor equivalents nearly merge. **Fix:** widen the visual distance
  between states (shape or fill, not just a 1px dash), especially at the smallest pip size.

- **R4 — Missing core Daggerheart fields.**
  No damage thresholds (Major / Severe), no weapons / Experiences / gold / features anywhere. The
  icon-first layout reserves no room for them. Not in scope to build now, but the PRD should note the
  reserved space so future additions don't force a re-layout. `quote` and `community` fields exist in
  the model but render nowhere (`character.ts:67,69`).

---

## 5. Legibility & contrast

- **L1 — Micro-type epidemic.** 6.5px octa labels & PROF, 7px LVL, 7.5px trait labels, 8px
  Evasion/Armor. On a 412-wide phone design-px ≈ device pt, so this is sub-9px for primary taxonomy,
  and SafeArea insets shrink it ~10% more on notched phones. **Fix:** raise minimum label size; if
  space is the constraint, drop or abbreviate content rather than shrink below ~9–10px.

- **L2 — `adjustsFontSizeToFit` is a no-op on react-native-web.** "KNOWLEDGE" → "KNOWLE…" in a 48px
  box at 7.5px (`trait-banners.tsx:39`). On web it ellipsizes; on native it shrinks toward the 3.75px
  floor — illegible either way. Because the owner verifies on web, **do not rely on auto-shrink to
  rescue overflow** — size text to fit natively, or shorten labels (e.g. icon-only traits, or
  AGI/STR/FIN/INS/PRE/KNO). `SheetText` is in `primitives.tsx:84`.

- **L3 — Contrast failures vs the `#FAF8F2` sheet (WCAG AA = 4.5:1 for small text):**
  - Muted `#8A857E` "Primal Origin" ≈ 3.0:1 — fail.
  - Gold `#C8923A` octa labels on white ≈ 2.4:1 — fail.
  - Red `#C81B18` 11px lines ≈ 4:1 — borderline.
  **Fix:** darken muted/gold label colors (or place them on a dark chip) to reach AA for the size used.

- **L4 — Portrait reads as empty space.** The placeholder is a pale pink sparkle on near-white and the
  frame is a hairline gold outline, so the whole top-left quadrant looks accidental. Per D2, keep the
  sparkle but add the "tap to add portrait" affordance so it reads as intentional.

---

## 6. Information design

- **I1 — Red is semantically overloaded.** Class line, domains line, HP numeral, hearts, stress, the
  HP tab frame, and the class banner are all red — red stops meaning anything. **Fix:** reserve red
  for one role (damage/health) and demote the rest (class/domain text to ink/gold).

- **I2 — Negative trait modifier isn't differentiated.** STRENGTH "−1" is styled identically to "+2"
  (`trait-banners.tsx:42`); the only negative is easy to miss on a quick scan. **Fix:** subtle
  treatment for negatives (color/weight) without breaking the banner look.

- **I3 — Three section-header grammars.** HP uses a red chamfered tab; Stress/Hope use a plain ink
  label in a thin gold box; Evasion/Armor use gold caps on the dark panel. **Fix:** one header system.

- **I4 — Accidental frame/content color pairing.** Stress box border is gold but its contents are red,
  while HP box is red/red and Hope is gold/gold — an unintended pattern break. Make the pairing a rule.

- **I5 — HP double-encoding clarity.** With D1 done, make the "5 / 12" + hearts read as one fact, not
  two denominators the player must reconcile. Show the golden vs red distinction clearly.

---

## 7. Affordances & feedback

- **A1 — The core loop is currently fake.** Hearts/stress/armor/hope pips spring on press but mutate
  nothing — `onPressPip` is never wired (`primitives.tsx:174`, no call site). Marking damage / stress
  / hope IS the job of a companion sheet. **Fix:** wire tap-to-spend/restore on each track (tap fills
  toward the tapped pip, etc.), updating the character state and the derived HP number.

- **A2 — Dead tap on the class banner.** Pressable with a spring, but `onPressClass` is never passed
  (`sheet-frame.tsx:24`, call site `redesigned-sheet.tsx:172`). Either wire it to something or remove
  the false affordance.

- **A3 — Touch targets below minimum.** Armor pips are 20px (well under the 44pt guideline), hearts
  38px (and overlapping per C3), stress 42px; no `hitSlop` anywhere. **Fix:** add `hitSlop` to small
  pips; don't let interactive targets read smaller than they are.

- **A4 — No haptics** despite an "animation-first" identity. Add light haptic feedback on
  spend/restore, card focus, and fullscreen open/close (`expo-haptics`, SDK-54 safe).

---

## 8. Accessibility (currently zero)

- **X1 — No semantics on any control.** Add `accessibilityRole` / `accessibilityLabel` /
  `accessibilityState` to every pressable; pips should announce e.g. "Hope, 5 of 6". Name and level
  should be headings.
- **X2 — Gesture-only flows are unusable by assistive tech.** The carousel and fullscreen card have no
  non-gesture path. Provide accessible actions (e.g. an a11y action to open/close a card).
- **X3 — No reduced-motion handling.** The pulse and springs ignore the OS "reduce motion" setting.
  Gate non-essential motion behind `AccessibilityInfo.isReduceMotionEnabled`.

---

## 9. Code / doc hygiene & ADR alignment

- **H1 — ADR-0001 divergence.** The ADR says the ink background + gold frame render **outside** the
  scaled stage and stretch to the device edges so "the screen always fills." In code, `SheetFrame` is
  a **child of the stage** (`redesigned-sheet.tsx:172`), so on any non-412:892 aspect (and under
  SafeArea insets, both edges, `:168`) the device edge is bare ink and the frame floats inside, scaled
  down (~0.9 on notched phones). **Fix:** either move the full-bleed frame/background outside the
  stage per the ADR, or amend the ADR to match reality. Pick one; don't leave them contradictory.
- **H2 — Stale carousel doc.** `docs/card-carousel-architecture.md` describes trait fly-off (now a
  veil), `Race(vPan,hPan)` (now a single pan), and an 18%-height / velocity-900 fullscreen trigger
  (now a fixed 78px, no velocity). Update it to the §2 model so it's an oracle again.
- **H3 — Theme hygiene.** `redesigned-sheet.tsx:23-29` redefines SHEET/INK/RED/GOLD/MUTED as raw hex
  (and `MUTED #8A857E` ≠ `Rune.muted #938E88`), violating the AGENTS rule "use the Rune palette, not
  raw hex." `theme.ts` still carries dead Expo-template `Colors`/`Fonts`/`BottomTabInset`/
  `MaxContentWidth`. `_layout.tsx:24` comment says "Cinzel" but the app loads Archivo. Clean these up.
- **H4 — Dead accent machinery.** `useAccent();` is called as a bare no-op (`redesigned-sheet.tsx:81`)
  and the multi-color picker UI was removed, but the full provider/tint system remains. Either restore
  a picker or trim to the locked-red path.
- **H5 — DesignStage first-frame blank flash.** Renders nothing until `onLayout`
  (`design-stage.tsx:46`) → a brief flash on mount. Consider a measured fallback or fade-in.

---

## 10. Verified non-issues (do **not** "fix" these)

These looked wrong but are correct/intentional — confirmed by pixel scan or owner intent. Listed so
the implementing agent doesn't waste effort or regress them.

- The sheet **is** centered. Pixel scan puts the sheet at screen x≈734–1200, center 967, vs the window
  center 968. The large black side fields at desktop aspect ratio are ADR-0001's **intended
  letterbox** (a framed sheet that scales uniformly), not a layout bug.
- Hope's gold connector line stopping at the last filled diamond is intentional (`HopeLine`).
- Compact cards peeking under the bottom edge is intentional (but must not paint over the frame — C5).
- 6 hearts (×2) + 12 armor icons with no armor number is the owner's documented AELIANA design; HP
  semantics still need the golden-heart fix (D1/R1), but the icons-first choice itself stands.

---

## 11. Suggested priority for the PRD

1. **§2 carousel redesign** + **D4 badges-open-cards** (biggest behavior change; owner's top ask).
2. **§3 collision bugs** C1–C8 (visible breakage / embarrassing text mangling).
3. **D1/R1 golden hearts + derived HP** (correctness of the core resource).
4. **§5 legibility/contrast** + **§7 affordances** (make it usable and real).
5. **§8 accessibility**.
6. **§9 hygiene/ADR** (debt; do alongside the touched files).
