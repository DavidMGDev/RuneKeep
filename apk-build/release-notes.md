RuneKeep v0.34.2 - Two fingers no longer close the app, the lock is a tap, and the board can paint itself into your portrait.

FIXES

- PINCHING AND ROTATING NO LONGER CLOSES THE APP. The rotation snap called an ordinary helper from the animation thread, which on Android is fatal. One finger was fine because only two fingers reach that code. This is the same fault as last version's crash, one level further in.
- THE PORTRAIT CAPTURE WORKS IN A BROWSER. It was trying to photograph the page, which gave a white rectangle or nothing at all. A browser now DRAWS the board instead: the background, then each image at its own position, size and angle. The result is exactly what you were looking at.
- THE MENU STAYS OPEN IN A BROWSER. Double tapping an image opened the wheel and closed it two frames later, because the second tap also arrived as a click and landed on the dismiss area behind it.

THE MOODBOARD

- THE LOCK IS A TAP. Tap to unlock, tap to lock. Holding for a second was a lot of ceremony for something you do every time you want to move a picture.
- AN EMPTY BOARD OPENS UNLOCKED, with an arrow pointing at the plus. There is no arrangement to protect yet, and nothing worse than a blank canvas that will not let you start.
- A NEW BUTTON CHANGES THE BACKGROUND. It walks a set of dark grounds chosen to sit under artwork, and the first tap round the loop brings back the original blue. The colour is saved with the character and is part of the portrait when the board becomes one.
- THE DOUBLE TAP MENU IS DELETE AND DUPLICATE. Front and Centre were layout choices, and layout belongs in the images list where you can see the stack.
- USE AS PORTRAIT IS A REAL SWITCH, the same one the category list uses. As a bordered panel it read like another image row.
- TOUCHING A LOCKED BOARD SAYS SO, at most once every two seconds. It used to do nothing at all, which looks the same as being broken.
- PNGs KEEP THEIR TRANSPARENCY on the board, and the saved portrait is flattened onto the background.

Sideload: enable Install unknown apps, then open the APK.
