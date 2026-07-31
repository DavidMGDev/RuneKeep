RuneKeep v0.27.4 - the app stops doing work the browser never did.

Players reported the web version running faster than the installed app. That should be backwards, and the reason it was not comes down to four things the app does on a phone that the browser build skips entirely.

- THE APP NO LONGER REDRAWS EVERY CARD AFTER EVERY UPDATE. Each card is drawn once and kept as a picture, which is what makes decks scroll smoothly. Since v0.24.0 those pictures were filed under the app version, so shipping any release, even one that only fixed a button, threw away every picture on your device and the phone quietly redrew your whole character one card at a time. They are filed under what a card is actually made of now: its design and its text. Change a card and it is redrawn. Ship anything else and your pictures are kept. There is a check in the build that fails if that filing ever goes out of step, so a changed card cannot be missed.
- OPENING A CHARACTER NO LONGER WAITS FOR EVERY CARD TO BE DRAWN. The opening curtain used to stay down until every card in your character had been turned into a picture. In a browser there are no pictures to make, so it opened straight away; on a phone, after an update, it was the full seven and a half second wait. There was never anything to wait for. A card that has not been drawn yet shows the live version, which is what the picture is a picture of, so you cannot tell the difference when it swaps.
- SAVING NO LONGER PAUSES THE APP. Your character and its whole history live in one file, and the app rewrote all of it, immediately and start to finish, every time anything changed: a hit point, a card turned on, an item equipped. Nothing else could happen while it did. Writes are gathered up and made once now, the way the browser has always done it. Your work still reaches storage when the app goes to the background, and reading a character always gives you the newest version whether or not it has been written yet.
- DRAWING CARDS NO LONGER RE-READS THE WHOLE FOLDER FOR EACH ONE. Making a picture of a card meant walking the entire folder of saved pictures twice, and that happened once per card, so a character's worth of cards walked it a hundred times over. It is read once now.

The first launch after this update still redraws your cards once, because their filing has changed. That is the last time an ordinary release will do it.

Nothing about how anything looks or works has changed in this release. It is entirely about the app doing less.

Hold the speaker on the main menu for the sound readout. It ends with what the speaker answered when the app asked it to start.

Sideload: enable Install unknown apps, then open the APK.
