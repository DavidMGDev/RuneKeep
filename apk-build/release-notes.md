RuneKeep v0.30.0 - cards print their own details, no card text lands on the footer any more, sharing works without NFC, and the file extension is .rune.

CARDS

- TEXT NEVER PRINTS OVER THE FOOTER. On the Katana the word "range." sat on top of the "RuneKeep" watermark, and only on a phone. The feature was never too long; the STAT BLOCK above it was too tall. Nothing set a line height on those rows, so each was as tall as the font itself made it, and Android draws them noticeably taller than a browser does: about a line's worth across the four rows, taken out of the bottom of the card. The rows are pinned now, so the card is laid out the same on both and the Katana simply fits at the size it was designed at.
- AND IF TEXT REALLY IS TOO LONG, IT SHRINKS RATHER THAN SPILLING. Card text works out its own size from the text itself, shrinking only as far as it has to, never cutting a word. Armor and long homebrew descriptions get the same treatment. A card that already fits is untouched.
- THE DETAILS YOU FILL IN GO ON THE CARD. Authoring homebrew asks for a lot: a weapon's trait, range, damage and burden, which domain and level a card is, which tier a subclass card is. All of it was collected and then went nowhere you could read it. The form now writes itself into the description as markdown, laid out the way the printed cards lay the same facts out, so you can check what you filled in and so can anyone you send the card to.
- YOU CAN EDIT THAT BLOCK, AND IT ASKS BEFORE OVERWRITING IT. Changing a detail rewrites the whole block. If you have typed in it, you are asked first, and keeping your text is one of the two answers. Reopening a card never quietly rewrites what you wrote.
- WEAPONS AND ARMOR LEAVE IT OFF, because their stat block already prints those exact rows and printing them twice would be worse than not printing them at all.

SHARING

- SHARE WORKS WITHOUT NFC. Every send panel can EXPORT the card as a file. Where there is no NFC radio, which is every browser and some phones, the panel says so plainly and puts the export button in the middle, because there it is the whole point rather than a fallback.
- THE SHARE OPTION IS BACK IN EDIT MODE IN A BROWSER. It only ever appeared on hardware with an NFC radio, so the web build had no way to share a card at all. It is always there now, named for what your device can actually do.
- THE CARD ARCHIVE AND THE CARD LIBRARY SHARE THE SAME WAY. Holding a card in the archive no longer refuses when there is no radio.
- ADD CARD CAN IMPORT A FILE. Under Advanced options: pick a file holding one card or a whole stack, and choose which deck they land in. Anything exported anywhere in the app can come back in this way. A system card comes back as the real card, art and all, not a flat copy of its text.

FILES

- THE EXTENSION IS .RUNE. Everything writes .rune from now on, and Android opens them from WhatsApp, a file manager, Gmail or a download the same as before. Files you were sent as .rkp still open, and a .rune exported here still opens on a phone that has not updated yet, so nothing at your table has to upgrade in step.

ELSEWHERE

- ANDROID TABLETS ARE OFFERED THE INSTALL AGAIN. Chrome asks for desktop sites on a large screen, so a Galaxy Tab reports itself with no "Android" in it anywhere and was read as a desktop, on the device with the most browser chrome to lose. Desktops are still left alone: a touchscreen laptop is not a tablet, and the browser can tell you which one it is.
- THE FLOAT MENU'S BOTTOM WEDGE IS EXIT, with a doorway glyph. "Characters" was too long and clipped to "Charac...".
- CREATED BY KOY AND DAVID, on the main menu.

Sideload: enable Install unknown apps, then open the APK.
