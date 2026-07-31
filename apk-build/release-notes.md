RuneKeep v0.27.3 - the creator stops seizing up, sound comes back, and the browser stops fighting your fingers.

THE CREATION SCREEN

- THE CREATOR NO LONGER LOCKS UP AFTER A LOT OF SCROLLING. This is the one that mattered. The carousel rebuilt its entire gesture setup every time a card finished drawing and again on every card you scrolled past, and swapping a drag handler in the middle of a drag means the old one never finds out the drag ended. The gear grind was left switched on forever, and while it is on the app deliberately stops publishing which card is centred. That single stuck flag is all three symptoms you described: the middle card keeps its low resolution preview because nothing tells it that it is the middle card, and SELECT and RANDOM act on whatever card was centred when it froze. It never recovered because nothing else turns that flag off. The gestures are now built once, and a leftover grind is unwound the next time you touch the screen.
- SWITCHING SECTIONS IS FAST AGAIN. Tapping Ancestry used to queue behind about ninety card snapshots for decks you were not even looking at, including every weapon and every armour from expansions you had not picked. Only the deck on screen is prepared now. Coming back to a deck re-prepares nothing.
- SCROLLING IS SMOOTHER. Every card that finished drawing handed all the visible slots new work and rebuilt their touch handling. It does not now.
- A HALF FINISHED SECTION SWITCH CANNOT STRAND THE SCREEN. If the fade between decks was interrupted, nothing cleared the flag that says a switch is in progress, so every later tap on a section did nothing and the loading pulse stayed up with the controls faded out. The switch now completes either way.
- THE GOLDEN GEAR SITS ABOVE THE BUTTONS. The SELECT and RANDOM cluster moves down a little and the gear rises a little, which is about eight points of clearance. It costs roughly two points of the headroom above the card that the last release added.

SOUND

- ANDROID. Your readout said suspended with nothing failing, which was the clue. On Android the audio system starts asleep and one wake-up call opens the speaker. A change in v0.25.0 made the app send that call before every single sound, on the assumption that Android never sleeps. It does. Android refuses a second start on a speaker that is already starting, the audio library remembers that refusal, and from then on it plays silence while still reporting itself asleep. The app was the thing breaking its own sound. It asks once now and believes the answer. The readout also reports what the answer was.
- IN THE BROWSER, MOST SOUNDS WERE SILENT. Buttons, the carousel tick, the float menu and the second stage of a filling or draining icon all set a small pitch variation before playing. In the browser the audio library hands back a stand-in object that does not carry the pitch control, so setting it threw an error, and the error was caught somewhere that discarded it, before the sound was ever asked to play. The one sound you could hear, entering the character sheet, is one of the few that plays at a flat pitch. All of them play now.

THE BROWSER

- THE PAGE NO LONGER SCROLLS OFF THE APP. Parts of the app are drawn deliberately outside the phone frame, so the page had somewhere to scroll to. Anything that moved the page, such as focusing a text field, could slide the whole app away and leave you looking at the background.
- HOLDING AN ICON NO LONGER OFFERS TO SAVE THE PICTURE. Holding is how you equip a card, spend a token and open the float menu, but the browser saw an image and offered its own menu. Text fields keep theirs, which is where paste lives.
- HOLDING A CARD SURVIVES A SLIGHT WOBBLE. Two pixels of movement used to hand the touch to the scroller, which on a mouse is less than holding still. It takes ten now, still under the point where a hold gives up.
- THE READY STEP SHOWS THE CARD. Filling in a field scrolls the page to centre it, and nothing put the page back, so the card you were being asked to approve sat above the top of the window.

CHARACTERS AND HISTORY

- REWINDING NO LONGER DESTROYS THE REST OF YOUR HISTORY. The panel told you that later changes stay listed until you change something else. That was true, and then the app changed something itself: it saves when the sheet opens, when a resource settles and when you leave, and every one of those counted as an edit even when nothing was different. A save that wrote nothing is no longer a change.
- YOU CAN GO FORWARD AGAIN. Holding a greyed out entry did nothing at all, which is the opposite of what the message promised. It takes you there.
- TIMELINE ENTRIES SHOW THE HOLD. They grow while you hold and settle back if you let go, so you can see how far along you are.
- DELETING A FOLDER NO LONGER HIDES EVERYONE. Its characters move to Ungrouped, and if Ungrouped happened to be shut they arrived already hidden. Worse, deleting your last folder removes the Ungrouped heading entirely, so there was nothing left to tap to open it. Characters are never tipped into a shut pile, and a group with no heading can no longer hide anything.

Hold the speaker on the main menu to see the sound readout. It now ends with what the speaker answered when the app asked it to start.

Sideload: enable Install unknown apps, then open the APK.
