RuneKeep v0.33.1 - The expansion ancestries stop blinking, and the browser stops freezing when you place a token.

FIXES

- EXPANSION ANCESTRIES NO LONGER FLICKER IN THE CREATOR. v0.33.0 gave those cards a pair of image layers meant for two different files, and the second one was mounted and torn down again every card you scrolled past, on the very same picture. They are one image now, held for as long as the card is on the deck. This was a fault introduced in v0.33.0 and it got worse rather than better, which is why it started happening at any speed.
- PLACING A TOKEN IN A BROWSER IS IMMEDIATE. Saving a character in a browser was reading every character back out of storage, parsing them, and writing all of them again, on every single save. A save happens each time you drop a token or tap a die. The app has coalesced its writes since v0.27.4; the browser does now too.
- TAPPING AND ROLLING DICE IN A BROWSER IS IMMEDIATE, for the same reason, plus two more. History was keeping a full copy of your portrait in every one of its snapshots, so a browser character was carrying the same picture up to a hundred and twenty times and rewriting all of it on every save. And dropping a token was rebuilding every card in the deck, which costs nothing much on a phone and a great deal in a browser, where cards are drawn live rather than from a saved picture.
- REWINDING NO LONGER CHANGES YOUR PICTURES. That is the trade for the above: the timeline records what your character was, not copies of its artwork. Everything else about rewinding is unchanged.
- NOTHING IS LOST WHEN YOU CLOSE THE TAB. Browser saves now wait a moment before writing, so they are also flushed when you switch tabs or close the page.

Sideload: enable Install unknown apps, then open the APK.
