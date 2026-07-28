# RuneKeep — tablet & large-screen audit (v0.21.0)

Date: 2026-07-27 · Split out of `ux-audit-v0.21.0.md` at the owner's request.
**Status: ADDRESSED in v0.23.0.** See the "What shipped" note below. This file is kept as the record
of the original findings and the reasoning behind them.

## What shipped (v0.23.0)

The strategy is **look the same, do not stretch**. A phone layout blown out to 800dp gives 760dp rows
holding a five-character name, three enormous blurry thumbnails, and 320dp dialogs marooned in the
middle; none of that is "bigger", it is just wrong at a larger size.

| Finding | Resolution |
|---|---|
| §II.2 #1 gallery locked to 3 columns | `gridColumns` adds columns instead of inflating cells, so a thumbnail stays near its native size |
| §II.2 #2 sheet frame stretched full-bleed | The gold border and the parchment matte are pinned to the **stage rect** on tablets, keeping the raster at the 0.502 aspect it was authored for |
| §II.2 #3 fixed-dp dialogs | `PopupDialog`, `OverlayShell`, `NumberKeypad` scale and cap at a share of the screen |
| §II.2 #4 everything phone-sized | `TABLET_SCALE` 1.3 on type, control heights and paddings |
| §II.2 #5 menu absolute Y | `DriftRow` positions are proportional |
| §II.2 #6/#7/#8 stretched rows, no measure cap | `AppScreen` centres a measured content column; every non-sheet screen inherits it, which also fixes the traits grid reflow |
| §II.0 orientation | Still portrait-locked. The Android 16 large-screen override remains a live risk and is NOT mitigated |

**Phone layout is provably unchanged**: below `smallestWidth 600dp` the scale is exactly 1 and
`maxContent` is `Infinity`, so every call site is a no-op. The widest phone reports ~480dp, a 25%
margin under the threshold. Unfolded foldables (~700dp) are correctly treated as tablets.

Still open: the Void class banners are tiny rasters that are **vector in the source PDFs** and could
be re-extracted, and `FullUI.svg` still stretches with `preserveAspectRatio="none"` (moderate in
portrait, fatal only in landscape, which is out of scope).

Scope agreed with the owner: **portrait only, orientation stays locked.** Landscape is not a design
target. See §II.0 — the lock does not currently hold, and that is the one item here with a deadline
attached to it, because it is a platform behaviour change rather than a design choice.

---

# PART II — Tablet, portrait

## II.0 The portrait lock does not currently hold

`app.json:6` sets `"orientation": "portrait"` and the generated manifest honours it with `android:screenOrientation="portrait"`. But the build targets **`targetSdkVersion="36"`** (verified from the merged manifest; it is Expo SDK 54's default). **Android 16 ignores app-declared orientation and resizability restrictions on displays with `smallestWidth ≥ 600dp`** for apps targeting SDK 36+. A 10–11" tablet is ~800 dp. The app will rotate.

Two consequences:

1. Because `configChanges` includes `orientation|screenSize|screenLayout|uiMode`, the Activity is **never recreated** on rotation. The seven components that call `Dimensions.get()` inside a render body keep their stale portrait numbers indefinitely: `gallery-screen.tsx:158, 282, 289, 372`, `menu-screen.tsx:28`, `straight-carousel.tsx:295`, `dm/adversary-detail.tsx:123`. Every one is a rotation bug on a device that can now rotate.
2. Split-screen and freeform windowing have the same staleness, and there is no `Dimensions.addEventListener` anywhere in the codebase.

**If portrait-only is the decision, it has to be defended explicitly:** add the temporary large-screen compatibility opt-out property to the manifest via a config plugin, and migrate the seven `Dimensions.get()` render-body reads to `useWindowDimensions()` as a safety net for when that opt-out expires (Google has signalled it is ignored from targetSdk 37). The migration is worth doing regardless — it is a one-line change per site and it is the prerequisite for every responsive fix below.

## II.1 Computed portrait geometry

Derived by running the app's own formulas (`stage-scale.ts:47-49`, `app-screen.tsx:12-14`, `gallery-screen.tsx:373-374`). Density assumed 2.0 for tablets, 2.625 for the reference phone.

| Device | Stage scale | Sheet rendered | Cream gutter per side | Screen that is touch-inert | Gallery cell | LOD thumb upscale |
|---|---|---|---|---|---|---|
| Phone 412×892 (reference) | 0.899 | 370 × 802 | 21 dp | 10 % | 118 dp | 1.26× |
| **Tablet 800×1280** | **1.334** | 550 × 1190 | **125 dp** | **31 %** | 248 dp | **2.64×** |
| Tablet 840×1400 (11") | 1.469 | 605 × 1310 | 117 dp | 28 % | 261 dp | 2.78× |
| Foldable open 700×1200 | 1.244 | 513 × 1110 | 94 dp | 27 % | 214 dp | 2.28× |

**The good news for portrait-only:** `DesignStage` is mathematically correct. It takes `min(availW/412, availH/892)`, scales uniformly, centres, and never distorts — verified, and unit-tested at `stage-scale.test.ts:30-34`. In portrait the sheet scales *up* to 1.33×, and the letterbox is painted parchment rather than black, so it reads as margin rather than as a bug. Most in-stage raster art has 3–8× linear headroom and survives the uplift.

**The bad news:** 31 % of the screen is decorative cream that swallows touches, because every sheet gesture lives inside the scaled 412×892 view. And the float menu's dim/tap-scrim is sized in design px (`float-menu.tsx:393`), so it does not extend into the gutters either.

## II.2 What looks bad on a tablet in portrait, ranked

| # | Problem | Measured impact | Class |
|---|---|---|---|
| 1 | **Gallery grid is hard-locked to 3 columns** (`gallery-screen.tsx:373` — `const cols = 3`) | 248 dp cells rendering 188×263 LOD thumbs = **2.64× upscale**. Three mush-blobs per row on the app's second-most-used screen. | **Easy** |
| 2 | **The sheet's gold frame is a raster free-stretched full-bleed** (`sheet-frame.tsx:38`, `contentFit="fill"` over `absoluteFill`, source `longborder-*.webp` 753×1500) | Aspect goes 0.464 → 0.662, a **+43 % horizontal smear**, plus a 2.12× resolution upscale. Directly contradicts `architecture.md:27` ("never stretch the frame"). | **Robust — asset** |
| 3 | **~20 fixed-dp dialogs become postage stamps** | 264/280/300/312/320/330/340/344/348 dp panels are 78–85 % of a phone's width but **33–43 %** of an 800 dp tablet's. Only two of ~22 have any `maxWidth` guard. | **Easy** |
| 4 | **Everything stays phone-sized.** Every `fontSize` in the app is a literal; there is no type scale keyed to viewport, and `adjustsFontSizeToFit` only ever shrinks | The whole UI reads at roughly 60 % of its intended visual weight on a 10–11" panel. This is the "feels wrong on a tablet" sensation more than any single broken element. | **Robust — code** |
| 5 | **Menu ambient rows are pinned at absolute y = 228 / 396 / 560** (`menu-screen.tsx:235-237`), title block at `marginTop: 76` | On a 1280 dp screen everything bunches into the top 44 % and the **bottom ~720 dp is empty**, while the two menu slabs stretch to 764 × 108 dp with a 24 pt label alone at the left. | **Easy** |
| 6 | **The character creator is a phone-sized ribbon in an ocean.** `FORGED_W/H = 230×322`, `CARD_SCALE = 0.70`, `SPACING = 148` are all fixed dp (`forged-card.tsx:14-15`, `straight-carousel.tsx:70-72`) | The resting card is **161 × 225 dp forever**. `REST_FRAC = 0.36` is proportional so the card floats up with the rail, but the select controls are pinned at `bottom: 56` (`create-screen.tsx:733`) — the gap between the card you're looking at and the button that selects it grows to ~500 dp. | **Robust — code** |
| 7 | **Traits step loses its intended composition.** Six 92×150 banners in a `flexWrap` row with `columnGap: 14` (`traits-tab.tsx:107,117`) | Phone (376 dp usable) gives the designed 3+3 grid. **At 800 dp all six fit on one row.** The 3×2 composition never appears on a tablet. | **Easy** |
| 8 | **No content measure cap anywhere.** `app-screen.tsx:48` is a flat `paddingHorizontal: 18` at every width; `grep maxWidth` returns six hits, none a content column | 764 dp-wide list rows for a five-character name; `Import`/`New character` as a 764 dp button pair; the encounter log "drawer" at `width: '82%'` = 656 dp. | **Easy** |
| 9 | **`FullUI.svg` renders with `preserveAspectRatio="none"`** (`app-screen.tsx:80`, verified) | The screen border on every non-sheet screen. Container aspect goes 0.502 → 0.662, so its 45° chamfers open to roughly 33°. Vector, so never blurry — but visibly re-proportioned. **Portrait-only keeps this at moderate severity; in landscape it would be 3.5× and fatal.** | **Robust — asset (see §III.2)** |
| 10 | **Void class banners are tiny rasters** (87×138 … 135×214, `assets/art/classBanners/void/*.webp`) | At create-fullscreen on a portrait tablet these upscale **3.0–4.5×** while the nine base-class banners beside them are SVG and razor-sharp. The inconsistency is more visible than the blur. | **Robust — asset, but see §III.1** |

**Runner-up:** `insets.left` / `insets.right` are read **nowhere** in the codebase, and two DM overlays substitute a hard-coded `paddingTop: 54` for insets entirely (`adversary-library-screen.tsx:179`, `encounter-log.tsx:186`). Low impact in portrait; immediate breakage if the orientation lock fails per §II.0. Also, the `48 dp` bottom inset floor — a workaround for one phone reporting 0 — steals height from the exact axis that determines the sheet's entire scale.

---

# PART III — Who fixes what

The owner's question: which robust reworks can be done by editing SVGs, and which need intervention from outside software?

## III.1 Things I can fix myself, including asset work — no external software

| Item | Why it's tractable |
|---|---|
| **Void class banners** | **They are vector in the source PDFs.** `Assassin-v1.5-The-Void.pdf` page 0 has **447 vector drawing operations and zero embedded images** (verified). They were rasterised down to 87×138 by the extraction pipeline. I can re-extract them at any resolution, or convert them to SVG outright, using PyMuPDF and the existing scripts. This one looked like an external-tooling job and is not. |
| **LOD thumbnails** | `scripts/generate_lods.py` regenerates every thumb from the full-res WebP with a two-line change (`SIZE = (188, 263)`). Bumping to 282×394 gives 1.5× and kills the gallery blur at the cost of bundle size. Gitignored build artifacts, so no repo churn. |
| **A desaturated `FullUI-dm.svg`** | The gold strokes are literal hex values (`#b88747`, `#c98a42`) in a 4 KB file. Recolouring to the DM grey is a find-and-replace. Same for a `Pop-up-dm.svg`. This is the highest-value asset edit in the report and it is trivial. |
| **Deleting dead assets** | `Square.svg`, `image-4.svg`, `image-5.svg`, `image-10.svg` are referenced in `DESIGN.md` but imported nowhere. `assets/art/gears/*.svg` (ten files) are unused at runtime — the gears ship as rasters instead. |
| **Every code-level fix in Part II** | Gallery column count by width, dialog `maxWidth` clamps, menu absolute-Y → flex composition, traits-tab wrap constraint, a viewport-aware type scale, `Dimensions.get()` → `useWindowDimensions()`, the orientation opt-out via a config plugin. |
| **Every DM feel fix in §I.4** | `dm` props on the four shared components, the type scale collapse, the spacing rule, the chamfer restoration, the empty-state poster copy-paste. |

## III.2 The genuinely hard one: `FullUI.svg` 9-slicing

The asset has **five paths**. Paths 2, 3 and 4 are already edge-localised (a left strip at x 219–235 spanning nearly the full height; a bottom strip; a small bottom-right corner nub). **Paths 0 and 1 span the entire frame** — path 0 is the ink fill with a cutout, path 1 is the main gold border outline, 40 commands over 1395 characters, carrying both the corner chamfers and the long edges in a single closed Bézier outline.

To 9-slice it properly you must cut those two outlines at corner boundaries, which is geometric surgery on Bézier paths.

**My honest assessment:** I can attempt this programmatically with `svgpathtools` and it would probably work, but it is fiddly, and a vector editor does it reliably in ten minutes by hand. **Recommendation for portrait-only scope: don't 9-slice it yet.** At 0.502 → 0.662 the distortion is a +32 % corner widening — noticeable to you, invisible to most users, and P2 at worst. Revisit only if landscape ever comes into scope, where the same asset stretches 3.5× and becomes indefensible.

A cheaper middle path I *can* do entirely in code: replace the frame with a procedurally generated `react-native-svg` path computed from the live width and height, so corners stay at a true 45° and only the edges lengthen. That guarantees correct geometry at any size, at the cost of the hand-drawn ornament in the current asset. That is a design call, not a technical one, and it is yours to make.

## III.3 Things that need outside software or better source material

| Item | Why, and what's actually needed |
|---|---|
| **The sheet's ornamental gold frame** (`longborder-658778e3.webp` + `longborder-gray.webp`, 753×1500) | Raster only, with **no vector source in the repo**. It is currently free-stretched with `contentFit: "fill"`, so it smears *and* blurs. Two-part fix: the code half (stop the free stretch) I can do; the asset half — re-authoring it as vector, or exporting it as 9-slice corner and edge pieces — needs a vector editor (Illustrator, Affinity Designer, or Inkscape). This is the clearest "you need to open a design tool" item in the report. |
| **Card art above 750×1050** | Not a tooling problem — a **source** problem. The Void print-and-play PDFs embed card faces at 875×1225 (verified), so there is ~1.17× of genuine headroom and nothing more. Everything above that would be upscaling. On a portrait tablet the gallery reader already runs the art at roughly 2× source. If sharper card art matters, it requires higher-resolution source material, which no software creates. |
| **A dedicated tablet layout** for the sheet (two-pane, or using the 125 dp gutters) | Not blocked by tooling — blocked by *design intent*. `DesignStage` is deliberately a fixed 412×892 composition and `PRODUCT.md` calls the sheet owner-approved. Any real use of tablet space is a new composition someone has to design, not a responsive rule someone can write. |

---
