RuneKeep v0.26.0 - the browser build catches up with the app, and the rest of the list.

Most of this release is about the web version being as good as the installed one, on a phone or on a desktop. Several of the faults turned out to be one cause wearing different masks.

- TEXT FIELDS WERE NOT GREYED OUT: typing a character name produced letters the same colour as the box they sat in, so the field looked disabled and looked like it never took what you typed. The value was there the whole time, buried under its own background: panels draw their fill as an overlay, and a browser paints that above a text field rather than behind it. The same cause washed out icons and made pop-up backgrounds look offset from their borders. All three are gone.
- THE CREATOR NO LONGER THROWS YOU OUT: on Firefox, opening character creation and dismissing its tour dropped you back on the character list, which is empty for a new player, so making a character looked like it had failed. Firefox merges two history entries created in the same instant; the tour now waits a frame before opening.
- SOUND, ON A PHONE BROWSER: a browser will not let a page make noise before you touch it, and the app only ever asked once at startup, which is the one moment it cannot work.
- THE KEYBOARD: a phone browser shrinks the page when the keyboard opens, and the app reserved space for it as well, so the card scrolled off the top. Fields are scrolled into view now instead.
- FIREFOX DRAGGING: dragging a card produced a ghost of the artwork instead of scrolling, so lists looked frozen. The fix Chrome uses relies on a property Firefox never implemented.
- PICTURES SURVIVE AN UPDATE: portraits vanished from the character list after updating. The picker hands back a path into a cache the system is free to clear; pictures are copied somewhere the app owns before that path is saved. Card artwork is also kept and shown while its replacement is being redrawn, rather than disappearing for the first few minutes after a release.
- BUTTON LABELS FIT: they used to truncate to an ellipsis in the browser, because the shrink-to-fit the app asks for does nothing there.
- SHORT SCREENS: on a phone browser with the address bar showing, the creation card overlapped the step tabs above it. It shrinks to fit now.
- A LOADING SCREEN AT LAST: opening the site showed a blank page and then the whole interface at once. There is a proper one now, on screen with the first byte.
- KEYBOARD CONTROLS ON A DESKTOP: arrows or WASD move along the cards, shift moves two, up and down open and close a card, space equips, E is edit mode, Enter confirms, Escape backs out. The welcome tour explains them, and only where there is a keyboard.

And the rest of the list:

- TRAITS: the pool holds two +1s and two 0s, and tapping the second lit up the first.
- INVENTORY AT CREATION asks its two questions separately, Choice 1 and Choice 2, like primary and secondary weapons. Each offers "No items / Custom" for when you do not need it or your GM agreed something of your own. Potions arrive as consumables rather than generic items.
- ARMOR IS EQUIPPED when you make a character, so a new sheet is not quietly missing its own Armor Score. The tour explains Select All then Equip for everything else, and moving the gear to Inventory afterwards.
- SELECT ALL sits in edit mode where Deselect All does.
- EXPERIENCES are made with the same quick flow as cards, Advanced still one tap away. Enter walks the whole flow: name, then description, then done.
- MODIFIERS: the controls are laid out down the panel instead of crammed into a row, and a modifier can be marked permanent, kept whether or not the card is equipped and lost only by deleting the card everywhere.
- THE FORGE BUTTON stays dim until the hero is finished.
- FOCUSED CARDS sit in the middle of the screen rather than near the top.
- NFC is a checkmark naming the deck, not a second and a half of animation.
- ONBOARDING: the wheel page shows the portrait it sits under, pages fade and swipe, and the demos teach what the sheet actually does.

Sideload: enable Install unknown apps, then open the APK.
