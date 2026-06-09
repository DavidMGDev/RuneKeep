# Adapt export → Expo (React Native)

This folder is a responsive design exported from Ligma's Adapt surface.
Screens: `Screen 1`. Base design ("100%"): 412×892.

## ⚠️ Do NOT read layout.json directly
`layout.json` is machine data — minified and often **multiple MB** (hundreds of
layers × ~20 keyframe resolutions). Reading it whole wastes the whole context.
Instead run the bundled distiller and read its small output:

```sh
python simplify.py            # compact digest: component tree + responsive intent
python simplify.py layout.json --layer <id>   # full record for ONE layer
```

The digest prints, per layer (indented by tree depth):
`Name [kind]  x:<anchor> w:<sizing> | y:<anchor> h:<sizing>  <appearance>`
where **anchor** ∈ start|center|end|lerp and **sizing** ∈ fixed(px)|fluid — the
inferred responsive behaviour (it resolves the keyframes at the screen's smallest
and largest viewport with the real interpolator). `grp` = a non-painting container
(a frame); `bp:N` = N breakpoints. That digest is what you translate from.

To pull one layer's raw keyframes without loading the file in an editor, use the
`--layer` mode above, or `jq`:
```sh
jq '.screens[0].root | .. | objects | select(.name=="Hero")' layout.json
jq -c '.screens[].root | .. | objects | {name,kind} | select(.name)' layout.json  # all names
```

## Files
- `simplify.py` — the distiller above. **Start here.**
- `layout.json` — full data (minified). The layer TREE: names, kinds, responsive
  keyframes, breakpoints, semantic appearance. Coords are SCREEN-RELATIVE (screen
  top-left = 0,0), NOT parent-relative (flat-world model — the tree is for grouping).
- `*.html` — one self-contained page per screen. Pixel-EXACT preview; open it and
  use the browser device toolbar to test any resolution. The **ground-truth oracle**
  (absolute-positioned, so not RN source).
- `assets/` — PNG images, referenced by `layout.json` + the HTML.

## How responsiveness is encoded
A keyframe records a layer's geometry at a 2D viewport. **`x`/`w` vary with viewport
WIDTH; `y`/`h` with HEIGHT.** Linear between keyframes, clamped outside; same-axis
collisions resolve by nearest other-axis. `origin` is the canonical/base design;
`geometry.base` is the fallback when a layer has no keyframes.

## Translate, don't transliterate
1. Build the component tree from the digest + node **names** (keep names as component
   + StyleSheet keys — lossless). `grp` layers are containers.
2. Map the inferred intent to flex — do NOT reproduce absolute pixels or port the runtime:
   - sizing `fluid` → `flex:1` / `%` width|height; `fixed(px)` → fixed.
   - anchor `start` → left/top; `end` → right/bottom; `center` → centered;
     `lerp` → it genuinely moves, approximate with flex + margins, then verify.
3. `breakpoints` → render a variant component past that size.
4. Images → `Image source={require('./assets/<file>')}`.
5. Responsiveness: `useWindowDimensions()`; breakpoints = the DISTINCT resolutions the
   digest lists.
6. **Verify**: open the screen's `.html` at each resolution and match your RN layout
   within a few px. Go screen by screen: tree → StyleSheet → responsive rules → verify.
