# src/components — shared UI kit

**Responsibility:** reusable presentational/primitive components used by **two or more features**.
Anything used by a single feature lives in that feature's own `components/` folder, not here.

## Files
| File | What it is |
|------|------------|
| `chamfer-box.tsx` | the chamfered-corner panel primitive (used everywhere) |
| `rune-button.tsx` | themed button |
| `app-screen.tsx` | screen scaffold + `useScreenInsets` |
| `art-image.tsx` | image wrapper (LOD/fit handling) |
| `pressable-art.tsx` | spring-on-press wrapper for interactive art (see AGENTS.md › Animation conventions) |
| `loading-screen.tsx` | full-screen loader |
| `design-stage.tsx` | the `<DesignStage>` uniform-scale responsive primitive (see docs/architecture.md) |
| `card-editor.tsx` | the custom-card authoring editor (create + sheet) |
| `effects-editor.tsx` | the card-effects field editor (used by card-editor + the modifiers sheet) |
| `card-markdown.tsx` | renders card body markdown |
| `fit-line.tsx` | single-line auto-fit text |
| `hold-to-confirm.tsx` | hold-to-confirm gesture primitive |
| `popup-dialog.tsx` | generic destructive-confirm dialog |

## Rule
Before adding a component here, confirm it's used by 2+ features. If it's feature-specific, put it in
`src/features/<feature>/components/`.
