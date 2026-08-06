RuneKeep v0.36 - Characterize, a stat wheel with nothing left to animate, and titles that stop eating their own cards.

CHARACTERIZE

- AN ADVERSARY CAN BECOME A CHARACTER. Hold an adversary or an ally in an encounter and the selection bar offers to turn it into one. The character creator opens with everything the stat block already knew, and what comes out is a real character: cards, modifiers, a sheet, a place on your roster, and its own section in the adversary library so you can bring it back in a later fight.
- IT SHOWS YOU WHAT IT IS CARRYING FIRST. A new opening step lays out everything the stat block hands over as cards you can read: the level it worked out, the damage thresholds, the hit points and stress, the standard attack as a weapon, and every passive, action and reaction with its full text. Anything you do not want, you grey out with a button, and it is not created at all. Select all clears the lot; press it again and it puts everything back.
- THE NUMBERS SURVIVE. An adversary with 8/14 thresholds reads 8/14 as a character, whatever the class, the level bonuses and the cards you pick add up to: the sheet is worked out first and the difference is carried. Same for hit points and stress. Choosing armor says so, because armor sets thresholds itself.
- A LEVEL, WORKED OUT FOR YOU. Tier sets the band and difficulty moves within it, so a tier 3 adversary does not arrive as a level 1 character. Adjust it with minus and plus, roll it, or reset it. It brings only what a level brings on its own, Proficiency and the threshold bonuses. No advancements, so nothing is chosen for you.
- EVERY STEP BUT CLASS CAN BE SKIPPED. The Skip button sits next to Random and only exists here. Skipping the inventory means no inventory: no torch, no rope, no potions. Every card goes to the Arsenal and every one is switched on, so you are looking at the true numbers rather than a character with its own gear turned off.
- TRAITS COUNT UP AND DOWN. Not the player's pool of six fixed modifiers: every trait starts at zero, a tap raises it, a double tap lowers it, and Reset puts back whatever the thing you are characterizing already had.
- TRANSFORMATIONS. A new step after Ancestry lists all six, whenever Hope and Fear is switched on in your expansions.
- IT COMES BACK TO THE FIGHT. Forge, and you land back in the encounter with the entry replaced, on the side it was already fighting on. A characterized ally offers to join the party. An adversary does not, because it is still an adversary.

THE STAT WHEEL

- FIFTH GO, AND THIS TIME IT IS NOT JAVASCRIPT. The four attempts before this each removed something genuinely wrong and the app kept dying on the same phone, so what is left is not a fault the app can see: every callback is guarded and every guard has stayed silent. One difference from the character sheet's float menu survived all four passes. That component holds the same wheel on the same phones and has never crashed, and it animates only transparency on the layer holding its artwork. This one moved and scaled that layer on every frame, which is a known failure on Android and is invisible to anything the app can catch. The wheel is placed once now and only fades in. The pie looks exactly the same.

CARDS

- A LONG TITLE NO LONGER EATS ITS OWN DESCRIPTION. A name that ran to two lines pushed the text down and the last lines were cut off the bottom of the card. Titles are now sized before they are drawn, into a band one line tall: a long name shrinks to fit one line, a very long one shrinks until two lines fit in the same space. The description starts at the same height on every card, and a browser and a phone finally agree, which they never did.
- CARDS YOU ARE CARRYING STAY VISIBLE. Dragging a card a long way used to make it vanish in mid-air, leaving only the landing ghost, until you let go. It stays drawn wherever the row scrolls to.

THE DM'S SCREENS

- AN ENCOUNTER THAT HAS NOT STARTED LOOKS LIKE IT. Everything that is not a way to start or prepare the fight fades back. Start Encounter, Log, Library, NPC and Adversary stay bright. Expanding a combatant fades it up so you can read it, and closing it fades it down again.
- THE PARTY AT A GLANCE. The party sheet opens with every member as a portrait and their hit points, four to a row, however many there are. Tap one to jump to them, hold one to open their modifiers.
- CONFIGURE SCROLLS. The panel for adversaries and NPCs would not scroll for the first few seconds and stopped again at the bottom: its scroller and the panel behind it were fighting over the same touch. Nothing is fighting now.
- THE SELECTION BAR MAKES SENSE. Delete is red. Toggle present only appears when everything selected is a player character. The count and the way out are on one line and the things you can do are on another, so nothing moves around as the count changes.
- SESSIONS SAY WHAT IS IN THEM. Each one lists its encounters underneath, greyed once finished.

Sideload: enable Install unknown apps, then open the APK.
