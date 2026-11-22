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
- v0.47.16: the table's sounds ship with the site. Table > Sounds offers Aggressive (the default: ~190 heavy hits,
  shots and crashes in `public/sounds/aggressive`, built by `scripts/sounds/build-aggressive.py`, credited in the
  README) and Regular (RuneKeep's own). Each Aggressive cue caps how long it rings and fades out (the Deck of Many
  Things may ring long); scrolling the hand, the colour and the deck keep only their short sounds; the Gems card is
  pitched down. The playground is calm: the cards are set out in a grid that steps round whatever stands on the
  table, nothing is spawned, and resting pieces never push one another (`collide` skips every sleeping pair). A held
  piece let go goes straight for a loose piece in reach and its first break is an impact frame (`breaker.strike`),
  and every new throw can earn one again (`brokeOnce` cleared). A carried selection bundles round the hand and
  circles it, and a group never catches fire. A carried piece stops at a Donjon cage's bars. A small chamfered arrow
  above the control dice tucks them and the deck die away (the `hidden` list). Saving a preset with dice and tokens
  lying about asks whether to keep them with it (`SavedLook.pieces`). Torn and cut copies leave real scraps
  (`CardScrap`): pushed like any piece, cut again when hit hard, fading once under an eighth of a card.
- v0.47.17: a new character on this computer (made here, or brought from the phone) and one still at the untouched
  built-in table sits down at `STARTING_LOOK`, the owner's "Spin Default" (a fanned, looping hand in the middle, gold
  hopping dice) with the dice chest; a table someone set up is kept. The dice chest is the default and stands apart
  from the supply row (material, colour, the Many Things deck), placed past its end and moved, hidden or locked on its
  own. Clicked, it first pushes the loose pieces near it outward, then fans one of every die along an arc laid out by
  each die's width (a pair side by side); clicking it again within 0.7 s does nothing, it never moves, a taken die is
  never pinned; scrolled over, it throws out a random die. Shift-click adds a piece to the selection without lifting
  it. Edit frames have a lock (`DeckLook.locked`): never lifted, never moved, a control die still answers a click. The
  corner buttons fold into a small chamfered arrow at the top of their column. Cards pass over one another (no card to
  card collisions). A throw that ends over a card keeps going; only a still hand sets a piece on a card. The hand
  takes the pointer only on its cards; between them is felt. A box selection takes physical cards too, and they ride
  along with the die carried (or carry the rest when one of them is). A carried bundle moves rigidly with the hand,
  its ring slows as the hand speeds up, and every die is thrown with a real tumble. The Selection bar has Modifiers: a
  panel under it with a flat bonus (-20 to 20), the sheet's variables and the cards' numbers, each showing what it
  comes to now, the total on the right; it is added to the roll and saved with the preset exactly as a phone preset's
  modifier (`PRESET_VARS` now lives in lib/dice-presets). Right click a card: Throw on the table, Take a copy, View (a
  large, sharp read over the dimmed table). Hover zoom never shrinks the hand (it no longer counts in `fitSize`) and a
  hovered card is drawn again at its size; up to 2.5x; "Sharp cards" keeps every card at full quality. Scraps can be
  carried by hand and burn. Many Things: the Knight gallops round the walls for 12 s; the Sun holds the loose pieces in
  orbit for 14 s and flings them; the Void pulls only loose pieces in and its mimic swallows them; on the Moon's ice
  the drag thins with the friction so things keep sliding.
- v0.47.18: the preset list starts with Default (`STARTING_LOOK`), above the ones made for a way of playing. The dice
  chest's fan spaces its dice well apart and is turned and widened until every die lands on the felt, out of the
  hand's own area and clear of what stands there (it no longer squeezes them against a wall); the control dice are
  held still while it opens, so a hopping one is never knocked into a jump. The Knight charges in straight lines,
  each at a point well across the table, so it never skims an edge. The Modifiers panel groups the sheet's variables:
  Traits, Rolls, Character, Vitals. The lit card in the hand comes to the front, so a token let go on what shows lands
  on that card, never on one behind it.
- v0.47.18, second batch: a token or die on a card (in the hand, laid, physical or in the playground) comes before the
  card: a click rolls a copy of a die out from it (with the die's own modifier, `PlacedToken.mod`, set from its right
  click menu, the same shape as a preset's); held, a ring fills and it breaks; dragged, it comes off into the hand.
  Held still, a piece now freezes instead of catching fire (frost fumes, `uCold` in the flame), sooner, and goes for one
  of the three nearest pieces with an ice-blue impact frame; swung fast it still burns. A whole card never burns: fire
  or a held strike breaks it into five pieces, frost into eight; only scraps burn, in from their edges, and frost breaks
  them smaller. The gust after a held hit, and cards' pieces, leave the control dice alone. Hope winning (and a highest
  face) swells and blooms in light instead of shaking. A carried bundle holding Hope and Fear (or a d100) keeps the
  pair side by side in the middle with the rest circling both. The dice chest and the Vizier pin the control dice and
  the Many Things deck; the Vizier is a storm (three more dice, a whirl of only the loose pieces, nine rounds of throws,
  then the roll). The Roll button keeps one width, no bar, never pressed in. View grows the card out of where it was and
  back (its veil had reused a keyframe that faded out at its end: the flicker). Board changes are patches applied to
  the board as last set, so two in a row never put a card back where it was.
- v0.47.18, third batch: Ctrl+A selects every loose die, token and physical card (never a control die). A selected
  bundle swung hard gathers lightning on its dice (the flame's `uSpark`: fast crackling yellow); let go charged, each
  die is thrown its own way and keeps its speed (`Body.zap`), bouncing off the walls with none lost and breaking what
  it meets (never the other dice of its throw), until after two to five seconds it stops dead where it is, spinning,
  slams down (a 'pound': a yellow shock and a small gust) and lands on whatever face comes up; the group's result shows
  once all are down. The chest's pairs stand a little apart (a die's width and 16 px) so they never land on each other.
  Sounds: a held hit and a critical use only the long heavy impacts (a critical's sound once, with its blast); Hope and
  Fear always their short sound, Fear quieter. Hope's bloom is smaller, well under a critical. Desktop: the level up
  advancements are larger; leaving the character asks over the whole window, dimmed, in a larger dialog.
- v0.47.19: the chest lays its dice out by their real size (it read them while they were still popping in at a third
  of it): a pair's centres just clear of touching (0.86 of a die and 14 px), kinds a die and 40 px apart. Its mouth
  stays open while its dice are out; clicked again before one is taken, it eats them back, one after another, each
  arcing to its mouth and shrinking in, then shuts (a selected one is kept). Dragging a pair, both halves roll with the
  hand. A die grabbed alone is as good as selected: swung, it charges with lightning (never fire, which is for tokens
  and the control dice) and its zap counts as a roll. Charged dice show bolts (a 2D layer over the flames: jagged paths
  round each and between charged dice near each other). Sounds: a sound longer than its cap was stopped before it was
  started, which the browser refuses, so it never played; now started first (whole pools had seemed to hold empty
  files). Zapped dice knock the walls softly. Tokens: small and large wood, bone and iron, copper and gold, and four
  elements (desktop supply only, the phone shows them): ice slides as on the Moon, fire burns a physical card it comes
  near (no impact frame), water off a wall sends a wave across the table, lightning arcs to the three nearest loose
  pieces when it knocks into something and they jump. Each element glows while it lies loose.
- v0.47.20: fire, frost and lightning only glow a little while a charge builds (at most 0.16, lightning 0.1) and are
  cranked to the max the moment they catch, with their sound: `FireLayer.spike` jumps the level to full and flares the
  quad 1.8x and the bolts past it, settling back in about half a second. A lightning token flares the same way as it
  arcs. The chest eats its dice back with one short pip per die, each higher, and shuts without a sound of its own. A
  token pulled off a hand card leaves the card at once as a flat stand-in under the cursor; its 3D piece is made a
  frame later where the cursor is and takes over (making it stalled the first frames of the drag).
- v0.47.21: Delete or Backspace puts the selected dice and tokens away (selected cards stay selected). Putting away is
  the tidy's flight home, never a break: `TableDiceHandle.putAway(bases)` sends just those pieces arcing into their
  supply (`stow`, shared with the tidy), then drops them from the loose list. The selection bar's Put back and a
  loose piece dropped on the supply use it too.
- v0.47.22: a scrap carried by hand is drawn under the cursor as it goes (physics skips a held card, so it stayed put
  till let go). Put back and Delete take selected scraps too (they fade away). An element token's charge is its own
  element, swung or held: ice and water frost, lightning crackles, fire burns. A die dragged more than 14 px by the hand
  joins the selection on release (both halves of a pair; never a token, never one bumped). The supply and the control
  dice also look for being off their spot every 1.5 s (one shoved while asleep never came to rest again, so it stayed
  off), and push aside whatever lies in their spot as they come back. The playground keeps the supply and the chest.
  Ruin is now a bolt that flies from piece to piece, breaking every loose die and token (pieces added meanwhile too),
  each hit held a beat, faster with each, until none is left. The chest's dice are painted and compiled once the table
  is up (`engine.warm`), and a look no die wears is kept (up to 40) instead of thrown away, so opening the chest no
  longer recompiles. Reset sends drawn Many Things cards back into the deck and the stock counts them again. The
  service worker no longer keeps an image the host answered with the app's page (a card drawn before its art shipped
  kept showing its letter for good).
- v0.47.23: a click on any card in the hand views it by default (`centreClick: 'view'`); taking a copy on click is
  the `clickTake` switch, off by default, renamed from `clickPull` so every saved table takes the new default once. A
  fixed piece (the dice chest) is stepped while it flies home: physics skipped fixed bodies whole, so once out of
  place the chest never went back, whatever reset it.
- v0.47.24: the dice chest's wheel: down throws out a die (as before), up takes two dice off the table, any two, into
  its open mouth (`putAwayRef` with `mouth`, shared with Put back). Right click on it swallows every die on the table,
  one after another with rising pips, and spits out one d20 rolled across the table and read as a roll, bigger the more
  it ate (`TokenInfo.big`: 1 + 0.17 a die, up to 3.5 times a die; kept with the loose piece). The playground's supply
  takes the wheel too.
- v0.47.25: the physical carousel (`physCarousel`, on by default and so in every template): the hand's cards are an
  obstacle for dice and tokens only (`Obstacle.only: 'pieces'`, a named moving obstacle, `engine.setObstacle`); each
  knock flashes them red and shoves the hand towards the nearer edge of the table (about 0.12 of the hit's speed, off
  the table after a handful of hard ones), and 0.7 s after the last it creeps back. Cards ignore it (the tray area
  keeps them out, `only: 'cards'`). A swung physical card gathers speed as a die does (no fire, frost or lightning):
  let go, it flies up to 2.5 times as fast and hits harder. A selected card hides its rotate and size grips. Dice
  thrown together (a selection swung, zapped or rolled from the bar) spare each other (`breaker.spare`). Pieces
  flying into the chest or the supply are kept off the loose list's re-sync and out of hit tests (the stored dice
  flickered back for a frame, and a second scroll over the chest caught a die flying into it). Dice from the chest's
  wheel and its giant d20 come out in front of it, never from inside it. Every sound played is named in a small log in
  the bottom right corner (its file, then its cue).
- v0.47.26: the physical carousel is heavy: a charged hit (`Impact.charged`: a breaker or a zap) pushes it 0.02 of its
  speed, a plain one 0.006 of what is over 700 px/s, a soft one not at all. As it moves it slides resting pieces out
  of its way in the same frame (`setObstacle` moves them, still asleep, and reports them rested once it stops), so they
  ride it smoothly instead of being knocked loose. A selection's tokens catch when it is swung, each its own way (fire,
  or its element), and go burning or frozen when let go. Element tokens at rest give off particles only
  (`FireLayer.aura`: embers, frost, drops, sparks on a 2D layer); the flames, frost and bolts are for a charge. The
  sound log gives each file a short id (FNV-1a), and a click copies the id and file. A selected scrap carries the rest
  of the selection.
- v0.47.27: the critical, staged (3.3 s): the table stops (`engine.stage`: only the pair moves, everything else holds
  mid-flight and carries on after), the pair flies to the middle of the table over everything, faces kept; dark but a
  spotlight, the camera pushes in (scale on the table root, the shake on its parent so the two never fight); 1.5 s of
  building (trembling dice, a gold halo, light streaking in, a shake growing to 14 px); dead still, CRITICAL slams in
  for half a second; the blast (a white-out, rings, sparks, a rune, the camera snaps back, the dark lifts) and the
  shockwave. The result plaque waits for the blast. Testing: Roll a crit, first in the Many Things picker (rigged
  faces through `roll`). The physical carousel's hitbox is each card (one moving obstacle per card), and a hit glows
  red on that card alone.
- v0.47.28: every roll is read once. Rolls waiting for their dice are a set (`pending`), not one slot: a second throw
  used to take the slot, and the first then timed out nine seconds later and was announced again, critical and all.
  A die thrown again now ends any earlier roll it was in, which comes back empty and shows nothing; only one critical
  sequence plays at a time. Every throw and roll hops (drawn only, the dice still never pass over each other) as high
  as it was thrown hard, and spins about an axis of its own as fast as it was thrown, the throw's direction only a
  third of it (`throwSpin`), so no throw can be steered.
- v0.47.29: even a soft throw spins up well (18 rad/s and up, plus 0.022 of the speed) and hops (340 px/s and up). A
  carried selection circles the hand in rings: the first hugs it, and once a ring is full the rest go round it in the
  next, every other ring turning the other way (40 dice stay within about 180 px). Taken out of the sound pools and
  the app at the owner's call: the process and window-close interface blips, crowdaww, the creaking door, mp-thyend2,
  ui-startup, the autobots shutdown (Playground off now powers down with dark-ui-power-on-off-dark-02), the metallic
  double alert, gab-taunt6, chainsawthrown, dronehurt and door-2-open.
- v0.47.30: railcannonfull taken out (the critical's voice keeps batterycharged and harpooncharged). The sound log
  and the testing button (draw any Many Things card, Roll a crit) show only in development.
- v0.47.31: the selection bar's Roll leaps the dice where they lie (`engine.leap`, `Body.air`): straight up, spinning
  hard about any axis, drifting 40 to 100 px whatever the hang time. In the air a die has no friction, keeps its spin and
  cannot settle; landing, it loses 70% of the spin. Pressed once: up 760 px/s, falling at 3200, spinning 34 rad/s and up.
  Held: higher, slower, faster. Held to the full: light fire, falling at 620 (about four seconds up), spinning about
  120 rad/s, the fire out as it lands. It no longer breaks anything.
- v0.47.32: a die's height shows on screen by exactly sin(TILT), not 0.4, so the fire and every effect stay on a die
  in the air. The Roll button's leap is set by its peak and hang time (tap 300 up for 0.6 s; full hold 760 for 3.4 s),
  the peak never higher than keeps the die on screen (the full leap went off the top, fire and all).
- v0.47.33 (Koy's playtest): a homebrew subclass's Spellcast trait shows on creation's trait step; "Write one" opens
  over the class card editor (it opened behind it); a card with a counter is live in the desk's card viewer; a class's
  pages fall back to the class card's own banner, as its feature cards already did.
- v0.48.0: Campaigns on desktop. `/parties` is a desktop page, in the top bar and third on the desktop menu. Laid out
  like the roster: the campaigns in a list, the selected one's pane beside it (badge, Open sessions, New session, Edit
  cast, Edit details, Delete with its two asks; the cast with who is away; the sessions newest first, each saying how
  many encounters and which is running). A click selects and a second click opens; Up, Down and Enter as on the roster.
  Sessions, a session, the cast editor and encounters still open in the phone frame.

## v0.48.1: fonts on the live site, and the campaign screens' loose ends

- Fonts are the repo's own files in `assets/fonts`. Never import a bundled asset from a package: Cloudflare Pages drops `node_modules` folders from the upload, and the site answers with the app's page (cached for a year by `/assets/*`).
- A desktop page's toast drops in under the top bar. A tour page with no illustration is one column.
- Under 1500px the campaign pane's buttons take their own row under the badge and name; the name is never cut.

## v0.49.0: the DM screen and sticky notes

- A session on a desktop window is the DM screen (`/session`, `features/dm/desk`): the sheet's shape, a port and the
  play table. The port shows the phone's own DM screens (encounters, encounter, party sheet, cast, library); never
  write a second one of any of them. A screen hands the table its handlers with `useDeskApi`; panels that are full
  screen on a phone open beside the port through `DmSide`.
- DM controls are seven control dice (Screen, Encounter, Party, Foes, Log, Cards, Tools), each opening the deck die's
  menu. A new DM control is a row in `desk/dm-controls.ts`, not a button in the port.
- The table takes any host (`table/table-host.ts`) and any number of control dice. The seven find their own room on
  every table (`seatControls`, tested against each ready-made table at four sizes), in two rows where they must.
- The DM's decks: Adversaries, Party, Allies, Encounters, My adversaries, and the DM's own. Table, notes, Fear and
  presets are the campaign's, so they carry from one session to the next. No grids, maps or game-running tools; the
  Fear tracker is the one optional extra (Tools).
- Sticky notes are on both tables: square board cards with writing. Physical ones tear, are cut and leave scraps that
  burn, as cards do; pinned ones are passed by. Breaking only marks a note torn: Reset brings back what it said, and
  only Delete loses it. One storage key to each table (`runekeep.notes.<owner>`).
- Sessions, the cast, the party sheet and the adversary library are desktop pages. Nothing DM is left in the phone
  frame on a desktop window.
- Colours used only by the table go in `constants/table-tints.ts`: editing `theme.ts` re-forges every card on every device.
