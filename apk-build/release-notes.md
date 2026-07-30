RuneKeep v0.26.1 - the app stopped asking the same question a million times.

A performance release. One bug, and it was the app's own card cache.

- THE APP IS FAST AGAIN. Every card in RuneKeep is drawn once and kept as a picture, and a new release redraws all of them. While that was happening, the app asked storage where each card's picture was and then asked again from scratch every time one card finished, over and over. On a full roster that came to millions of pointless lookups, all of them holding up the screen. Worse, it never finished: a card showing the previous release's picture was treated as done, so after the first launch exactly one card was ever redrawn and the app stayed in its slowest state instead of settling out of it. It now looks once, remembers the answer, and finishes.
- A CARD THAT FAILS TO DRAW is left until next time rather than retried the instant it fails, which used to spin for as long as the sheet was open.
- SCROLLING WITH A MOUSE in the browser build got cheaper: it worked out what to scroll twice per element on every tick of the wheel.

Nothing else changed. Everything in v0.26.0 is still here.

Sideload: enable Install unknown apps, then open the APK.
