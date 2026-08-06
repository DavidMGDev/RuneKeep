RuneKeep v0.35.3 - The DM sees the same cards the player does, and the stat wheel has nothing left to blame.

THE DM'S CARD VIEW

- EVERY CARD THE PLAYER HAS. Default inventory was missing entirely: the starting kit comes from your class rather than from your saved file, so a screen that read the file could never find it. Both screens now build their decks from the same list, so a card on the character sheet is a card the DM can see, drawn the same way, in the same order, respecting anything the player deleted, moved, copied or dragged into place.

THE STAT WHEEL

- FOURTH GO AT THE ANDROID CRASH. Both of the wheel's UI-thread reactions are gone: they re-registered themselves on every highlight change and each one called across to JavaScript twice, once into React and once into the audio engine, in the middle of a live gesture. Which wedge the finger is on is decided in plain JavaScript now, and the wheel is left holding nothing the character sheet's float menu does not hold, which is the one component of this kind that has never crashed.
- IF IT STILL GOES, IT WILL SAY SO. Every step of the wheel is guarded, and anything that fails while drawing it now names itself in a message instead of taking the app with it. A crash with no message left after this is not a JavaScript fault, which is worth knowing.

DOWNLOADS

- ONE HOP FEWER. The in-app download went to the site, which redirected to GitHub, which redirected again to a signed link that expires. A browser resuming a 90MB download near the end went back through all of it and asked for a fresh signature. It goes straight to the file now, and the update prompt offers the release page as a second route when a download will not finish. This is not a proven cure: a download that stalls at 99% is stalling in the browser or at the CDN, where the app cannot reach.

Sideload: enable Install unknown apps, then open the APK.
