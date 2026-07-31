RuneKeep v0.29.0 - the creator answers the keyboard, mixed ancestry can be reversed, and being down looks like being down.

NEW

- MIXED ANCESTRY CAN BE REVERSED. A small button on the ancestry step swaps which ancestry gives its first feature and which gives its second. It stays greyed out until you have picked both, because until then there is no pair to reverse. Giant and Faerie keeps Giant's extra Hit Point slot; press reverse and it is Faerie and Giant, Giant's slot is gone and its second feature is the one you have. Everything follows from that one swap: the modifiers, the lines struck through each card, and which card sits first on your sheet.

CHARACTER CREATION

- THE KEYBOARD WORKS IN THE CREATOR. It only ever worked on the character sheet, which meant the one screen where you look through a hundred cards was the one screen you had to drag through with a mouse. Left and right move, W and S open and close a card, Space picks the one in the middle, Shift with up or down crosses between sections. Same keys as the sheet, because they are the same list of keys.
- A FOCUSED CARD NO LONGER FLIES OFF THE TOP OF THE SCREEN. One measurement in the maths that positions an opened card was in physical pixels while everything around it was in the app's own units, so on any window the app magnifies, which is every desktop browser, the card was placed well above where it should be.
- THE LOADING SCREEN COMES FIRST. It was appearing over a creator that had already finished loading and was fully visible underneath, then fading, which looked like a flash for no reason. The creator is now hidden until the loading screen lifts, and it is the lift that reveals it.

THE CHARACTER SHEET

- 0 HIT POINTS ACTUALLY DESATURATES NOW. What shipped last release was not a desaturation at all. It was a flat grey slab with two rectangles cut out of it, which is my fault: the effect only works when the layer can see the sheet underneath it, and I had put it inside a wrapper that hid the sheet from it. Same mistake would have shown on the phone. The sheet loses its colour properly now, and the hit points panel and your portrait keep theirs.
- THE CARDS PANEL SHOWS YOUR CARDS. Most of them were drawing as a gold placeholder. That placeholder was correct back when it only ever stood in for the gold card, but since the browser build a card that has not been drawn to a picture yet carries itself along instead, and in a browser that is nearly every card. So class features, weapons, armour, experiences, notes, loot and your whole inventory all showed up as GOLD.
- UP AND DOWN DO NOTHING IN EDIT MODE. Edit mode is a flat row being rearranged: there is no card to open and no hand to bundle, so those keys were leaving it in a state it has no drawing for. Sideways still moves along the row, and both keys come back the moment you leave edit mode.

SOUND AND ONBOARDING

- THE BROWSER IS QUIETER. Everything on web plays at about a third of the volume it did. A phone speaker held at arm's length and a pair of desktop speakers a foot from your face are not the same thing.
- THE TOUR NO LONGER CLICKS TWICE. Next was making the sound itself and the button was making it too, in the same instant.
- THE KEYBOARD PAGE IS READABLE. It was two loose columns of text, and because a couple of the descriptions ran onto a second line the two columns drifted out of step, so working out which key did what meant tracing across the gap with a finger. Every key is drawn as a key now, on its own row.
- LEAVING THE TOUR NO LONGER FLASHES. The last page warns you that the sheet is bright, and the handover fades instead of cutting.

Known: at 0 hit points the cards in your hand keep their colour. They sit above the sheet rather than on it, and reaching over them would put colour windows through a card you had opened full screen. Say if you want them included.

Sideload: enable Install unknown apps, then open the APK.
