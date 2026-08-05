RuneKeep v0.35.1 - The two crashes, printed cards that look like cards, and the DM's card panel rebuilt.

CRASHES

- DRAGGING A CARD in the float menu's Cards panel no longer kills the app on Android, and no longer lets go of itself on the web. The gesture was being rebuilt while it was still running, every single time, because the panel rebuilds its handlers the moment a drag starts.
- HOLDING A STAT on a DM screen no longer crashes. The wheel used to be built the instant you held, and taken apart again while it was still animating away; it stays up now, at nothing, and the wedges are plain shapes again instead of animated ones that were never animated.

PRINTING

- THE PICTURES COME OUT. On a phone every card printed as a broken-image glyph on a beige rectangle: the sheet inlines every card into one document, and now that every card is a real bitmap that document was too big for the print engine to read. Each card is re-encoded at print size, so a full page is under two megabytes and still 300 DPI.
- APP-DRAWN CARDS LOOK LIKE THEMSELVES. In the browser they were being enlarged by stretching the page before the picture was taken, which mangled them and left most class-feature pages blank. The picture is taken at a higher resolution instead, and the card is untouched.
- A MULTI-CARD PRINT PRINTS EVERY CARD. Only the first was ever really drawn; the rest quietly timed out and fell back to a plain proxy.
- A PROGRESS BAR, counting card by card, with a Cancel. Back asks before it leaves, and leaving really does stop the job.
- THE FILE HAS A NAME. "Auren 9 cards.pdf" rather than whatever the print engine felt like calling it. The browser's Save as PDF picks up the same name.

THE DM'S SCREEN

- THE CARD PANEL IS REBUILT. It was the float menu's management grid, which was the wrong thing entirely. It is the level-up panel now: the same bordered shell, a rail of deck tabs across the top, and a real carousel you can open a card from and read. It asks which deck you want before it opens.
- AN ADD BUTTON INSIDE EACH OPEN GROUP in the modifiers panel, so filling a group does not mean adding at the bottom and filing it afterwards.
- DOWNED PLAYERS ARE VISIBLY DOWN: at zero hit points their portrait goes grey and dark.
- HOLDING TO SELECT REACHES MODIFIERS. One character selected offers theirs; the whole party selected offers the party's. Any other number offers neither, because there is no such thing as the modifiers of three people.
- "COMPLETE" IS "FINISH ENCOUNTER" now, and everything that said complete says finish.
- MODIFIERS ARE FROZEN WITH THE FIGHT. Finishing an encounter records the modifiers everyone was under, and rolling back to that snapshot puts them back.
- THE CARD ARCHIVE BUTTON IS AN OPEN BOOK, not a bookmark, and the party sheet sits beside it in an encounter.
- THE PARTY SHEET'S CORNER BUTTON is a pair of sliders instead of the shape that was there before.

FIXES

- MAX HOPE IS NOT A MODIFIER. Six is six; the only thing that ever changes it is a scar taking a slot away. Any card that claimed otherwise is ignored.
- THE RESTART ENCOUNTER DIALOG had two Cancel buttons side by side.

Sideload: enable Install unknown apps, then open the APK.
