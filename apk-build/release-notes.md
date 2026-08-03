RuneKeep v0.33.0 - Cards update when you edit them, dice spin when you roll them, and a character exported from the browser keeps its face.

CARDS

- EDITING A CARD ACTUALLY CHANGES THE CARD. The picture the carousel shows is cached, and the cache was keyed on the LENGTH of a card's title, text and colour rather than on what they said. A colour is always seven characters, so recolouring a card could not change the key and you kept the old card forever. Swapping a word for another the same length did the same. It is keyed on the content now. Every custom card, note, item and homebrew card redraws once after you update.
- DESCRIPTIONS SHOULD CLEAR THE FOOTER ON ANDROID. Android quietly pads every block of text out to the typeface's widest metrics whatever line height it was given, which makes a card's text about four pixels taller on a phone than the same text in a browser. Four pixels is most of the gap between the last line and the watermark. That padding is off now. If a description still reaches the footer after this update, send it to me with the card's title.
- A CHARACTER COUNT ON TITLES AND DESCRIPTIONS. It appears once a field is most of the way full, so you can see the limit coming instead of finding it when typing stops.
- HOPE AND FEAR ANCESTRIES NO LONGER FLICKER when you scroll the creator quickly. Those cards are a single printed picture, and they were being rebuilt from scratch every time the carousel moved its window rather than kept as an image like every card beside them.

DICE AND TOKENS

- ROLLING A DIE SPINS IT. One quick turn, thrown fast and eased to a stop. Roll again and it carries on from where it stopped rather than jumping back to square. Swipe it away mid-roll and it keeps turning at the speed it had.
- THROWING A TOKEN ADDS MOMENTUM TO ITS FALL instead of yanking it onto a new path. The old version changed how gravity worked the instant you swiped, so a token halfway down its drop jumped upward.
- SWIPING A DIE AWAY MAKES ONE SOUND. It was firing once per frame of the swipe.

CHARACTERS

- A CHARACTER EXPORTED FROM THE BROWSER KEEPS ITS PORTRAIT. The browser's image picker hands back a reference to one page's memory, not the picture, and that reference was what got written into the file. It also meant a portrait picked in a browser vanished the next time you reloaded the tab. The picture itself is stored now. An older export whose portrait cannot be recovered arrives empty and asks for a new one, instead of showing a white rectangle.
- THE TIMELINE SAYS WHAT A LEVEL UP WAS. Which domain card, which advancements, which traits, the multiclass, the new Experience. It used to say only which level you reached, which is the one entry worth reading.
- HOLD TO REWIND NO LONGER FIRES WHILE YOU SCROLL. The hold cancels the moment your finger moves, and takes a little longer, so scrolling past a row is just scrolling.

ELSEWHERE

- THE UPDATE PROMPT DIMS THE WHOLE SCREEN, border included, instead of laying a grey rectangle over part of it.
- A PHOTO YOU PICK IS NEVER MISTAKEN FOR A SHARED CHARACTER. Anything handed to the app was read off the disk as text and offered to you as a possible character file, including images the app's own picker had just returned. Pictures are recognised as pictures now, and nothing large is read at all.

Sideload: enable Install unknown apps, then open the APK.
