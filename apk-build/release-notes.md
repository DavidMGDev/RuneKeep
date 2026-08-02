RuneKeep v0.31.0 - the card type is a control in quick creation, cards hold far more text, bulk toggling sounds like a run instead of a pile-up, and the tablet browser stops resizing the whole app when you type.

CARDS

- QUICK CARD CAN SET THE TYPE. Tap the plaque on the card, pick from the same list the full editor offers, and the card stays the color it was. The art zone and the plaque are separate targets now, so changing the type never rerolls the art and tapping the art never opens the picker.
- YOU CAN WRITE A LOT MORE ON A CARD. Titles go to 120 characters and descriptions to 600, up from 70 and 280. The old limits were set when a card printed at one fixed size and anything longer ran off the bottom; since v0.30.0 the description picks its own size from the room left under the title, so a long one shrinks to fit. The new numbers are what stays readable, not what stays inside the box.

EDIT MODE

- THE CARD WHEEL FOLLOWS YOUR FINGER IN A TABLET BROWSER. Holding a card opened the wheel correctly and then, the moment you moved, the marker jumped to the bottom-right corner and every wedge was picked from the wrong place. The wheel's centre was measured in the app's own coordinates and your finger was not, and on a tablet the browser scales the app up, so the two disagreed by exactly that much. Dragging a card had the same offset. A phone browser draws at roughly scale 1, which is why it only showed up on the tablet; phones and the Android app were never affected.
- BULK EQUIP SOUNDS LIKE A RUN. The cards toggled 35 milliseconds apart, close enough that the clicks smeared into one noise. They are 130 apart now, and the pitch climbs a step per card as they come on and falls a step per card as they go off, so a long selection reads as one rising or falling run.
- BULK EQUIP ASKS ITS QUESTIONS, ALL OF THEM. If several cards each wanted to ask something, a spent consumable offering to be discarded or a card asking which benefit it grants, only the last question ever appeared and the rest were lost. They queue now, one after another. Unequipping four potions offers to discard four.

ELSEWHERE

- TYPING IN A TABLET BROWSER NO LONGER SHRINKS THE APP. Opening the keyboard shortened the window, the app re-magnified itself to the new height, and everything including the border jumped upward and got small, then grew back on dismiss. The magnification is held while a field has focus, so the view simply has less of it showing, the way the Android app behaves. Resizing a desktop window still rescales as before.
- THE LOSE-HP GAG IS HALF AS LIKELY, roughly one heart in twenty rather than one in ten.

Sideload: enable Install unknown apps, then open the APK.
