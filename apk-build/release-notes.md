RuneKeep v0.34.1 - The moodboard stops crashing, the menu you could not see is visible, and the board can be your portrait.

FIXES

- DRAGGING AN IMAGE NO LONGER CLOSES THE APP. The drag was calling an ordinary function from the animation thread, which on Android is fatal. That is why an image could be added and then never touched again.
- THE IMAGE MENU IS VISIBLE. Double tapping an image opened a wheel that was drawn at zero opacity and still took taps, so you saw nothing, pressed where a button would be, and the image was deleted. It no longer fades in at all, so it cannot act while it cannot be seen.
- HOLDING THE LOCK WORKS IN A BROWSER. The hold filled halfway and reset, because the browser's own long-press behaviour cancelled it. The lock is a proper gesture now rather than a plain button, which also fixes the release being read as a second tap.
- DRAGGING STARTS IMMEDIATELY. Every drag was waiting for the double tap to rule itself out first. They tell each other apart by movement now, so an image follows your finger from the first pixel.

THE MOODBOARD

- YOUR BOARD CAN BE YOUR PORTRAIT. In the images panel, turn on Use as portrait: every time you leave the board it saves a picture of it over your character's portrait. The capture is a PNG taken from the images alone, so it keeps its transparency. In a browser the capture is opaque, which is a limit of how a browser takes a picture of a page.
- LESS SNAPPING, AND LESS BUZZING. Position snapping is gone entirely; only rotation snaps, and only to right angles. Once you turn deliberately out of a snap, that turn will not snap again. Let go and start turning again to get it back.
- THE IMAGES PANEL IS ONE ROW OF BUTTONS. Send to back is gone, which is what lets Centre, Front, Copy and Delete fit on a single line, and deleting asks first.
- THE ADD BUTTON IS SMALLER AND SITS CLEAR of the navigation bar it was bleeding into. The top buttons no longer have a band of empty space above them.
- THE EMPTY BOARD PROMPT NO LONGER READS THROUGH the images panel.
- LEAVING THE BOARD FADES rather than cutting straight to a half-built character sheet.

Sideload: enable Install unknown apps, then open the APK.
