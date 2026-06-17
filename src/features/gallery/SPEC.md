# gallery — the card archive

**Responsibility:** browse every card in the catalog: an infinite grid of LOD thumbs with a collapsible
filter drawer (kind / domain / level) and a fullscreen card reader. Entry: `src/app/gallery.tsx` →
`GalleryScreen`. The creation flow deep-links here with filters preselected.

## Structure
- `gallery-screen.tsx` — the screen: filters, grid, and the fullscreen reader.
- `components/rune-chip.tsx` — the chamfered filter chip.

## Data / deps
Reads `CATALOG` from `src/data/catalog.ts` (thumbs in the grid, full-res `source` in the reader);
identity colours from `src/constants/identity.ts`.
