---
name: runekeep_web_stacking_firefox
description: "The ChamferBox stacking bug that caused \"greyed\" text fields, washed icons and offset panels, plus the Firefox history-collapse that threw players out of the creator"
metadata: 
  node_type: memory
  type: reference
  originSessionId: 1859e40f-c67c-40af-8dd0-8ad1cbbfa612
  modified: 2026-07-30T20:27:58.137Z
---

Found v0.26.0 (2026-07-30) by adding Firefox to the browser check. Several separate-looking web
reports were ONE cause.

**ChamferBox draws its panel as an absolutely positioned overlay, and CSS paints positioned elements
above in-flow ones regardless of source order.** React Native views are `position: relative` so they
were unaffected; a plain `<input>` and a `react-native-svg` element are NOT positioned, so the panel
fill painted straight over them. Symptoms: text fields that looked greyed out and looked like they
never accepted typing (the value was there, the same colour as its own background), washed-out icons,
and pop-up fills that looked offset from their borders. Fix: `zIndex: -1` on the overlay. **Zero is
not enough** — only a negative index drops below in-flow content.

Diagnosing this needs PIXELS, not computed style: `getComputedStyle` reported rgb(250,248,242) while
the painted pixels were (38,40,44). Sample the screenshot.

**Firefox collapses two history entries created in the same tick.** Every tour is pushed from a mount
effect on the screen it explains, so `router.back()` from the tour went back PAST that screen and
landed on the (empty) character list, making character creation look like it had failed. Chrome kept
both entries. Fix: defer the push by a frame (`setTimeout(..., 0)`), which keeps `back()` and so keeps
the creator's state. Do NOT "fix" it with `router.replace(from)` — that remounts the creator and
re-asks the expansion picker.

**Other web-only traps confirmed here:**
- `adjustsFontSizeToFit` is a NO-OP in react-native-web, so it silently degrades to truncation.
- An SVG sized by width/height attributes inside a CSS transform needs an explicit `viewBox`, or
  engines disagree about when it rasterises.
- A phone browser shrinks the page itself when the keyboard opens; reserving keyboard space as well
  double-counts (`src/lib/web-keyboard.ts` has the rule).
- `expo-image-picker` returns a path into the CACHE directory, which an OS update clears; copy it
  somewhere owned first (`src/lib/owned-image.ts`).
- The first `<input>` in the DOM is the hidden file input the picker creates, not your field. Filter
  by `getBoundingClientRect().width > 10`.

**`scripts/web-probe.mjs` drives Firefox with `RK_FIREFOX=1`** (puppeteer `browser: 'firefox'`,
`protocol: 'webDriverBiDi'`). A check that only drives Chrome cannot see the faults being reported.

Related: [[runekeep_web_platform_gotchas]], [[runekeep_web_deploy]], [[runekeep_v0250_split_modifiers]]
