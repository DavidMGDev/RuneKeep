RuneKeep v0.34.5 - The dice crash is fixed, the Toggle is on every card that earns it, and the greys have real names.

DICE

- PLACING THE HOPE AND FEAR DICE NO LONGER CLOSES THE APP. The pair's animation called an ordinary helper from the animation thread, which is fatal on Android and fine in a browser, which is how it shipped. Third time this fault has landed, and the rule is now written down where the next one would go.
- THE TWO DICE STAND LEVEL, side by side and a quarter further apart, instead of one sitting behind the other.
- THE SECOND DIE ROLLS 300ms AFTER THE FIRST, up from 50. You can see it go now, which is the point of them being two dice.
- DOUBLES ARE A CRITICAL: both dice swell, rattle apart and flash white. Nothing can interrupt it, and nothing can start a new roll underneath it.
- A TAP NEVER ROLLS THE PAIR. It is a hold, always. Tapping one die of a pair used to step its number, which read as the pair rolling itself again.

DICE ON THE WEB

- A ROLL NO LONGER FREEZES IN MID-AIR. The face was written to your character the moment the roll started, which put a whole-character save and a full re-render in the middle of the animation. It is written when the dice land instead.
- A DIE'S FACE IS NOT A MOMENT IN YOUR STORY. Every roll and every tap used to file a complete snapshot of the character into the timeline and then write all of it out again, so it got slower with every roll. Placing and removing a token are still recorded; what a die is showing is not.
- THE ROSTER IS READ ONCE, not re-parsed on every save.

CARDS

- THE TOGGLE IS ON EVERY CARD THAT CARRIES A MODIFIER, not only domain cards. Ancestries, communities and subclasses never get one: those are not things you switch off.
- THE "#" BUTTON APPEARS WHEREVER IT SHOULD. Both buttons were built from the character's slots rather than from the cards actually on screen, so a card that arrived any other way lost them.
- HALVED MODIFIERS ROUND UP EVERYWHERE. Untouchable was worth one number until you opened its modifiers and saved, and a different number afterwards, because the two paths disagreed about rounding.

COLOUR

- THE GREYS HAVE THEIR OWN NAMES. Every dark or washed-out colour used to answer "Dark Slate Gray" whatever hue it was, because nearest-match cannot tell them apart down there. They are described now: Deep Green Gray, Muted Blue Gray, Near Black Violet Gray.
- THE SHADE LADDER REACHES A REAL BLACK at the bottom.
- ROLLING A RANDOM COLOUR SAYS ITS NAME, fading up over the art for a moment. Quick cards, the full editor and card editing.

ELSEWHERE

- EXPERIENCE TITLES SIT WHERE THEY SHOULD during character creation, centred in the card rather than pinned to the top.

Sideload: enable Install unknown apps, then open the APK.
