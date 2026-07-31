RuneKeep v0.27.2 - your folders stay shut, the pop-ups line up, and the archive stops rendering a thousand cards at once.

- YOUR FOLDERS STAY CLOSED. Collapse a folder and it stays collapsed, through leaving the screen, opening a character, closing the app and updating it. The setting was being saved correctly the whole time and simply never read back, so the roster opened everything again on arrival and then saved that over your choice. Deleting one folder also used to re-open all the others; it does not now.
- POP-UPS LINE UP WITH THEIR BORDERS. The gold frame was one piece of artwork stretched over the panel, and the background behind it was a separate rectangle inset by a fixed amount. Those two never agreed: the frame's edge sat at a percentage of the panel, so there was a see-through moat inside the border that changed size with every dialog, and the square background cut across the frame's angled corners. The frame is drawn now, the same way the buttons are, so the outline and the fill are literally the same shape.
- THE CARD ARCHIVE IS FASTER. The grid was building roughly ten screens of cards in every direction over a list of a thousand, and every cell re-rendered whenever anything on the screen changed, including opening the filter drawer. It builds what it needs now.
- THE FILTERS ARE READABLE. Four labelled bands, Type, Domain, Level and Tier, each one line you can scroll sideways, instead of nine unlabelled ragged rows that pushed the cards off the bottom of the screen. Levels are numbers under "Level" rather than "L1", tiers under "Tier".
- THE CREATION CAROUSEL HAS ROOM ABOVE IT. Trimmed the stack above and moved the resting card down a fraction, which is the half that actually shows.
- CARDS LOAD WITHOUT DRAGGING THE APP DOWN. A card that has not been drawn yet renders itself live, which is what put the missing cards back in the browser. On a phone that meant a whole deck of them at once during the first load of a character. Now only the ones near the middle do, exactly as the pictures already worked.
- CHARACTER CREATION: homebrew and inventory cards were being rebuilt on every card that finished drawing. They are not now.
- "SOUND OFF" FITS ITS BUTTON.

SOUND ON ANDROID: your readout said suspended, which means the app opened its audio output once at startup, that failed, and nothing ever re-opened it. It now notices and builds a fresh one, up to three times, asking for a different sample rate each try. Hold the speaker again: if it says running, you have sound; if it still says suspended, the line now includes the rate it asked for, and that tells me the next thing to try.

Sideload: enable Install unknown apps, then open the APK.
