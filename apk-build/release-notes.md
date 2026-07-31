RuneKeep v0.28.0 - the browser build learns to behave, the first run warms itself up, and being down looks like it.

FIRST RUN

- THE APP WARMS ITSELF UP ONCE, UP FRONT. Everything expensive used to be built while you were already using the app: sounds decoded on the first tap that wanted one, card pictures fetched as each card scrolled into view, expansions prepared on the way into the creator. Small things, all landing at once, which is why the first few minutes felt worse than every session after them. There is a short load screen on a fresh install now that does all of it with a progress bar, and you never see it again. What it warms was measured rather than guessed: sound is the single largest thing the app fetches on a first run, larger than the app's own code.
- ARRIVAL SOUNDS WAIT FOR THE SCREEN THEY ANNOUNCE. A tour covers the screen it is teaching, so a chime playing underneath belonged to something you could not see yet. They are held back rather than dropped, so they land the moment you dismiss the tour.

THE CAROUSEL, EVERYWHERE

- TAPPING NO LONGER LEAVES THE CARDS STREWN ACROSS THE SCREEN. Touching the deck cancels whatever throw is in flight, because your finger has taken over. But a tap is not a drag, and the step that settles the deck onto a card only ran for drags, so a tap mid-scroll froze the deck between cards: two or three of them scattered with nothing in the middle. Tapping a card showed it worst, because the card opened over the mess and revealed it on the way out. It bites hardest with a mouse, which moves no pixels at all.
- DRAWN CARDS NO LONGER LEAVE HOLES. Armour, weapons and class cards are drawn by the app rather than scanned, and they were being dropped three cards from the middle while the scanned ones stayed visible further out, so the hand had gaps in it. My mistake, from the last release: a scanned card can be dropped early because a small copy of it is still underneath, and a drawn card has nothing underneath at all.
- CARDS NO LONGER FLICKER WHILE SCROLLING FAST. The window that decides which cards to draw followed the settled position, which deliberately stops updating during a fast gear scroll. It follows the live one now.
- A CARD ADDED FROM THE CATALOG LANDS IN ITS PLACE. A deck with an even number of cards has no middle card, and the hand was being parked exactly halfway between the two that straddle it, which is a resting position no card actually sits at, so everything ended up slightly tilted and offset. Adding a card flips a deck between odd and even, which is why it showed up there.

THE BROWSER

- THE GOLDEN GEAR CONTROLS ARE BACK, EDIT MODE INCLUDED. They were never missing. They were drawn, the right size, and on top of everything, but whether a touch counts as "on the gear" is worked out by arithmetic, and in a browser those numbers arrive in a different scale than the one the app measures in. So the gear responded at exactly one window size and was inert at every other. The same mistake, in the same place, is why the halves of a card that turn its pages were wrong.
- CLASS CARDS TURN THEIR PAGES AGAIN. On top of the above, the browser was rendering page one as a flat picture and never building the pager at all, because a card that has not been drawn to a picture yet carries both a live version and its pages, and the live one was winning. Turning a page still ran, found nothing to turn, and left a latch set, so after one attempt every tap and swipe was ignored too.
- KEYBOARD CONTROL FEELS LIKE CONTROL. Left and right fan the hand open as they move, down bundles it back up when nothing is open, and pressing a direction twice quickly now goes two cards instead of staggering (each press was measuring from a deck in mid-flight, so it kept aiming at the card it was leaving). Moving with the keyboard and then touching the mouse no longer snaps you back to where you started.
- SPACEBAR EQUIPS THE CARD YOU ARE LOOKING AT. It was acting on the last card you opened full screen, which is usually scrolled well off the side, so it played its sound and applied its effects to a card you could not see. That is why it seemed to do nothing.
- THE SHEET TOUR ACTUALLY APPEARS. It was being scheduled and then cancelled a moment later, every single time, on every route into the sheet.

EVERYWHERE

- THE DOMAIN CHIPS HAVE NO SEAMS. The little red plates that say BONE or VALOR are built from five separate pieces, and every place two pieces met, the background bled back through as a hairline.
- THE CATALOG ADDS CARDS INSTEAD OF SELECTING THEM. The button says ADD CARD and closes the catalog. If you want several, turn on MULTI-CARD MODE at the bottom and it stays open. Opening the catalog from the card editor still takes you back to the editor when you close it.
- AT 0 HIT POINTS THE SHEET GOES COLD. The same colourless treatment a fully scarred character wears, with two exceptions: your hit points panel keeps its colour so the way back up is legible, and so does your portrait.

Sideload: enable Install unknown apps, then open the APK.
