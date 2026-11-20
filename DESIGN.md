# RuneKeep — Design system

Source of truth for look & feel. The character sheet (AELIANA mockup) established the language;
this file extends it to the whole app (menu, gallery, roster, creation flow).

## Color

Strategy: **committed on ink** outside the sheet (the dark keep), committed on parchment inside the
sheet. Red carries identity, gold is the detail, near-black/ivory are the ground.

- `ink` #0B0E13 — app background / darkest. THE surface of every non-sheet screen.
- `panelDark` #0E1116 — raised dark panels on ink (subtle step, no shadow stacks).
- `sheet` #FAF8F2 — parchment surface (warm near-white, never pure #fff). Sheet + selected/active
  fills only; on dark screens parchment is an ACCENT (a lit panel), not the ground.
- `inkText` #14110C — primary text on parchment (warm near-black, never pure #000).
- `red` #C81B18 — THE accent. Primary actions, active states, HP. **One red, no variations.**
- `gold` #C8923A / `goldDetail` #DAA249 / `goldBright` #E0B563 — filigree, frames, labels, dividers,
  selection glows. Gold = structure & honor; red = action & blood.
- `bronze` #8A6B33 — labels on parchment (AA at small sizes). `ivory` #F2EDE2 — text on ink.
- `muted` #938E88 — secondary text, disabled states.
- **Class colors exist but stay subordinate**: when a class/domain needs identity color (creation
  flow, gallery filters), sample the card art's banner hue, desaturate/darken toward ink so gold
  text stays AA on it. Never let nine saturated buttons shout at once; color appears on focus/
  selection, muted at rest.

## Shape language — the signature

- **Chamfered 45° corners, NOT rounded.** Panels, frames, buttons, chips cut corners at 45°
  (`ChamferFrame`). No `borderRadius` except genuinely circular emblems and pip dots.
- **Flat.** No decorative gradients, no glassmorphism, minimal shadow. Color blocks + gold hairlines.
- **Gold hairline = structure.** 1–1.6px gold rules divide and frame; thicker gold only on the
  full-bleed screen borders.
- Provided SVG frames (`assets/art/new/`), each with a role:
  - `FullUI.svg` — full-bleed screen border for NON-sheet screens (sharp corners, dark + gold edge).
    The sheet keeps its own ornamental `longBorder`; everything else uses FullUI.
  - `Square.svg` — square dark panel (class buttons, portrait wells, icon tiles).
  - `Pop-up.svg` — dialog/confirm frame (import/export prompts, unsaved-changes).
  - `image.svg` (chamfered panel), `image-2` (red-tab header), `image-6` (gold octagon),
    `image-7` (sunburst), `image-11/10` (dark armor panel — reusable on dark screens),
    `image-4/5` (gold dividers), `image-8/9` (side filigree). The HP bar frame (red tab) is
    sheet-only; do not reuse it elsewhere.
  - All have 0 rounded corners: use them full-bleed, or seat them inside an ink panel; never clip
    them into rounded containers.

## Typography (Archivo)

- Display/numerals: **Archivo Black**, uppercase, tight tracking — screen titles, big numerals.
- Labels: **Archivo Bold**, uppercase, +tracking — section labels, tabs, chips.
- Secondary/body: Archivo 500/Regular — descriptions, captions.
- Scale steps ≥1.25 apart; on dark screens titles run bigger (ink absorbs weight).
- Text must fit its frame; size for NATIVE glyph widths. Auto-shrink (`fit`) is opt-in and rare.

## Layout laws

- **Sheet**: one screen, no scroll, DesignStage 412×892 (unchanged, owner-approved).
- **Non-sheet screens**: normal RN flex + ScrollView/FlatList layouts (dp units, safe-area aware) —
  NOT DesignStage; these screens scroll and adapt. Full-bleed FullUI border with content inset
  inside it; top/bottom inset floors (32dp/48dp Android) carry over.
- Vary spacing for rhythm: section gaps ≥ 2× intra-block gaps. Don't wrap everything; ink itself is
  a fine ground for type.
- Tap targets ≥44dp. One primary action per screen region, in red; secondary actions are gold
  hairline outlines on ink.
- Card thumbs in grids/strips keep the 5:7 aspect, chamfer-framed, LOD assets only.

## Motion

- Outside the sheet: 150–250ms fades/slides, ease-out (quart/expo feel via Reanimated springs with
  high damping). No bounce, no elastic, no particles. One deliberate ceremony moment is allowed per
  flow (e.g. the Domains tab unlocking) — short, meaningful, skippable by reduced-motion.
- Loading states: ink screen + gold chamfered emblem pulse (opacity 0.4→1 loop) + label; ambient
  LOD card drift where it fits (menu). Never a bare ActivityIndicator on white.
- The sheet keeps its richer motion system (charge/particle/carousel) untouched.

## Components (canonical)

- `ChamferFrame` — chamfered outline/fill panel (any size).
- `SheetText` — fixed-box text primitive (alignment, uppercase, tracking).
- `GoldRule` / `GoldRuleV` — hairline dividers.
- Chips: 20–28dp tall chamfered fills (red = active/selected, gold outline = available).
- `CardThumb` / `Card` — the two-LOD card image pair; reuse everywhere cards render.
- New shared pieces should land in `src/components/` when used by 2+ screens.

## The desktop play table (v0.47.0, reworked v0.47.1 and v0.47.3)

- Everything right of the desktop sheet is one table seen from above: ink felt (`public/table/felt.webp` plus
  `weave.png`, rendered in Blender by `scripts/blender/make_table.py`, graded by `grade_table.py`). The felt colour
  never changes. No drawer: the hand lies on the same felt, marked off by a faint hairline, a soft shade or nothing.
- The table's edge is a setting: a gold hairline, a 3D stone wall, a 3D brass rail, or nothing drawn.
- Dice are seen through an orthographic camera tipped 0.32 rad: no perspective skew anywhere, but tops and fronts
  both read. Sharp bevels (Blender, `make_dice.py`). Finishes: resin, stone, metal for rolled dice; obsidian,
  gilded, ivory for control dice. Control dice carry their glyph on two opposite faces and always rest on one.
- Control dice: State, Cards, Sort and the deck die (a d6 at least; thrown or rolled, the face it lands on picks the deck). Characters, Rest and Level up live on the
  port under the traits. A roll's result is a pop-up on the port, accepted with OK, never under the dice.
- Panels on the table are DOM: 45° chamfers by clip path, 1.2 px gold hairlines, red for the one primary action,
  Archivo Bold capitals for labels. No selection bars: a chosen item is filled red, a hovered one is lit whole.
- v0.47.3 (round four): input priority is the table's buttons, then pieces, then cards. No dice bar and no Roll or
  Tokens die: the control dice are Cards, State and Sort deck (top right by default); the supply (top left) is a
  token (wheel: wood, bone, iron), a colour token (wheel: colour), a die (wheel: d4 to d20, Hope and Fear, d100)
  and the Deck of Many Things. A click throws out a copy towards the open table, a drag pulls one, a held right
  click on a spawner throws copies faster and faster. v0.47.5: right click anywhere else opens the table menu (on a
  die, with Roll this die); a token or die held still shakes and launches itself, pushing what it hits harder for
  five generations; fresh copies push a little harder too and pass through the spawners, so the supply never silts
  up. Supply pieces can be knocked about; Reset sends them home, Tidy
  (above Reset) puts every loose piece and rolled die back.
- Pieces dropped on a card are anchored: physics never moves them, only the card or the hand. A card can be made
  physical (its menu): a box body knocked by dice that carries its anchored pieces, which are locked to it (none
  added or taken) until it is ordinary again, when it stands upright. The hand draws a card's tokens
  flat, the table stands them up in 3D, from the same list; pressing one on a hand card pops it off.
- Drag on the empty felt to select; the selection bar (top centre) rolls the dice in it, saves them as a preset or
  puts them back. Presets live in the table menu under Roll dice, each with a delete that asks first.
- The Deck of Many Things: 22 cards (names and SRD text from the booklet via `scripts/extract-domat.py`; the art is
  shipped from v0.47.4). The deck is the size of the die spawner and gives one card a minute (its label counts down).
  A drawn card waits on the table; let go after a drag it is consumed and its effect reaches the whole table from
  there (push, pull, whirl, shatter, ice, gems, rewind...), its pushes chained five generations deep; a right click
  gets rid of it. Effects are DOM light over the felt plus engine fields and impulses; hard hits shake the table.
- Layout is part of the look (`ctlX/ctlY/ctlDir`, `supX/supY/supDir`, `catX/catY`, `handMode`): while settings are
  open every row goes home and can be dragged or stood on end. Six whole tables made for ways of playing
  (Storyteller, Dice goblin, Tactician, Archivist, Showman, Duelist) and four drawn by `randomTables` and kept,
  scored by `tableScore` (rows on the table, out of the hand, clear of each other). Share is a code (`RK1:`, read
  forgivingly wherever it sits in what was pasted) or a .rune table file (`tableFile`, the whole look, marked
  `runekeep-table` so it is never taken for a character), first on the Presets tab. No links (v0.47.9, owner).
- v0.47.7: control dice can hop instead of roll (`ctlMotion`, on in Tactician and Showman): thrown or knocked they
  jump upright to where they would have slid and only turn when the deck changes; every hop carries on from its height
  when redirected, so dragging rows in settings never stutters. While settings are open the hand has a grip to drag it
  up or down (`areaY`) and its cards still scroll. The centre card shrinks to fit its area (`fitSize`) and the glow
  stays inside it. With controls hidden a corner button shows them in a column on the left. A held arrow steps faster
  and faster, its scroll sound climbing two octaves. A physical card is caught where it is the moment it is pressed.
- v0.47.8: `clickPull` (on by default): a click on any card in the hand takes a copy out to lay on the table; off, a
  click centres it and only the card menu's Lay a copy takes one out. The card menu can also Throw on the table: a
  physical copy flung towards the middle. The Many Things label is small and shows no count, only the minute's wait.
- v0.47.10: control dice charge like tokens when held, and a click no longer lifts them (only a drag does); a click
  glints instead. Held twice as long as the full shake, a token, die or control die catches the Forge button's fire
  (`lib/fire-shader`, shared) and goes off on its own, pushing far harder, burning until it rests. The deck die has
  small arrows either side for the deck before and after, and its menu shows three decks at a time with marks for
  more and a New category row (the Cards panel opens on its form). Control dice and deck die sizes are settings.
  With controls hidden, the corner button shows the supply too, in one column with them. Ready-made tables are a
  dropdown with a real screenshot of each (`public/table/presets`); ready-made hands head the Hand tab. Desktop's
  catalogue is a full-window page like Level Up (`desktop-catalog.tsx`): categories left, a card grid, the picked card
  large on the right. The Forge button's flames rise from its chamfered outline, never over its corners.
- v0.47.11: pieces share one texture and set of materials per look, flat tokens cast no shadow, and resin dice lost
  their transmission (it drew the whole table twice a frame); a clearcoat and a faint glow of their own colour read
  the same. Putting a hundred pieces away runs at a steady 60 fps. Fire is `piece-fire.ts`: one canvas over the table,
  a noise flame wrapping each burning piece, burning at a level, so a held piece smoulders early in its charge, is
  alight by 1.3 (let go then and it goes burning) and goes off by itself at 2. Swung round fast while held, a piece
  shakes and catches fire too, and flies on harder when let go. A charged throw breaks loose pieces (two at most
  unlit; burning, it passes through pieces and breaks all it meets till it slows, with a 110 ms impact frame and a
  burst on the first); a hit never leaves its target faster than 85% of the striker, so energy always runs down.
  Hope and Fear (any pair) are lifted together and thrown together. The supply spaces each slot by what sits in it.
  The selection's Roll charges and burns when held. Roll results are a banner across the top of the table that
  closes itself. The hand has a gold dot past each end (a setting, on by default). A taken card leaves from the card
  as drawn, trails the pointer, and its original dims. Rows of control dice or supply split into pieces placed one by
  one (the link on a row's frame while settings are open) and join back. Tables are kept per character; imported
  ones land in Your tables. The Deck of Many Things keeps a stock (one card per 200 s, ten at most) shown under it
  with the wait; a drag off it pulls a card into the hand; a carried card shakes, and calms after three seconds held
  still, to be set down without striking.
- v0.47.12: landed dice answer their roll as the phone's tray does, in 3D (`engine.wash`): a highest face washes
  white, swells 38% and wobbles; a 1 flushes red and jerks; Hope's winner glows gold and sways, Fear's glows violet
  and jerks. Hope equal to Fear is a critical: both dice blaze and swell 76%, the table stops 140 ms, and a blast
  throws every loose piece and physical card away while the two dice, the supply and the control dice are pinned;
  the table flashes gold, a shockwave and a rune circle run out, CRITICAL slams down and the table shakes. The result
  is a tight plaque at the top: Hope and Fear either side of the total (winner larger and lit), other dice as
  octagon badges in their colours, the total counting up and popping (harder high, smaller low, red under a 1).
  Table rolls are thrown towards the middle so they never land under it. The Presets tab loads first (preview above
  a list that opens over what is below, ready-made and your own together, then a code or a file), then your
  presets, then sharing, then start over. A physical card keeps its angle as it comes to rest (it used to be
  wrapped into 0 to 360, and its transition spun it round).
- v0.47.13: physical cards break like any loose piece, by how they are hit (`CardBreak`): a hard throw tears one in
  two along a ragged line, a very fast one cuts it clean along its path with a slash of light, a burning one burns
  it away from the struck point (a glowing front, char and embers), a blast (the Comet, the Skull) blows it into
  shards; they answer `state`, `toss` and `home` like dice, so every Many Things card moves them too. A burning
  throw's first hit holds the thrower and its target where they met for 1.5 s (the whole table with them when it is
  strong, darkened round a star of light and leaning in), then the target breaks, a gust throws what is near and the
  thrower goes on 1.6 times faster; shards share one geometry and one material per colour, compiled at start (the
  first hit used to hang while a dozen materials were built). The supply and control dice go back to their places a
  moment after they are knocked away (a setting, on in most presets). One Reset button puts everything loose back,
  the table's cards back into the hand, and undoes every lasting Many Things effect. The Playground (a corner
  button) lets the hand go as physical cards fanned across the table, lets the supply out as one of every die and
  token plus three colours, leaves the control dice as plain dice without words, and keeps only its own button and
  the Deck of Many Things. The Deck's cards now mostly last: a tipping table, a cage, stone, locks, Card-Jitsu
  elements (fire beats ice beats water beats fire; the loser is thrown off and turns), small pieces, backwards
  throws, pieces chasing the pointer, ice for 30 s, a galloping knight, a thief that pockets what it touches, every
  die on its best face, and the Void's mimic: a chest (modelled in Blender, `scripts/blender/make_mimic.py`) that
  swallows what the whirlpool brings, breathes, and spits it all out on a right click. A second, cuter chest is a
  setting, and the supply's die can be a dice chest: a click and it fans out one of every die, held still; grab one
  (or a selection) to keep it and the rest dissolve. Selected dice carried and thrown together count as a roll. The
  engine no longer queues a second frame from inside a frame (picking up Hope and Fear doubled the frames every
  frame: the duality lag). Roll and Forge burn with one continuous sheet of the pieces' flame round the whole
  button, from behind it (the Forge's plate is drawn over the fire, Roll's face is cut out of it), from one shared
  context ready before the first press; Roll fills a bar and says Charging, Hotter, Ablaze as it is held. With a
  selection, its bar stays at the top and a roll's plaque sits under it at the same width, the Many Things row
  under both. The hand's end dots sit behind the
  cards.

- v0.47.14: every sound on the table is a named cue (`table-sound.ts`). Two schemes under Table > Sounds: RuneKeep
  (the app sounds, exactly as before) and ULTRAKILL, which gives about ninety cues files of their own, several per
  cue and never the same one twice running, knocks included. RuneKeep does not ship those files: the player picks
  their own folder once, the files it uses are kept in IndexedDB in that browser only, and a missing one falls back
  to the RuneKeep sound. Each file is levelled when decoded (`normalGain`: its loudest 50 ms brought to one RMS, never clipping, boost capped at 6x), so none is much louder than the rest. The reset's ticks vary in pitch instead of climbing. Leaving the playground resets the
  whole table. Nothing still burning settles onto a card. The preset picker has arrows either side for the next or
  previous preset. In edit mode each row, and each piece split off one, has an eye: hidden, it leaves the table and
  shows (dimmed frame, red eye) only while editing (`DeckLook.hidden`).
- v0.47.15: ULTRAKILL files are levelled when decoded (`normalGain`). The edit frames' arrows, link and eye always
  show, so nothing moves under the pointer. The presets were laid out again: every row of pieces sits on a band
  along the top or bottom edge (left, centre, right, clear of the corner buttons), every hand is whole on screen,
  the middle of the felt stays open. Storyteller is one card centre stage; Dice goblin has everything along the top
  and a mimic for a dice box; Tactician and Archivist keep their pieces along the bottom; Duelist has the deck die
  above the shelf and the rest below. The four wild tables keep their drawn looks with hand-placed pieces
  (`WILD_LAYOUT`). Every preset picture was retaken. Reset with the deck laid out (Tactician) glides every card of it back into its
  grid, physical ones too. Entering the playground no longer flings the hand: the cards glide into a centred grid on
  the whole table (sized to fit, clear of the corner buttons and any control die) and rest there as physical cards,
  with one of every die and token set out in two rows above them, past the Deck of Many Things.