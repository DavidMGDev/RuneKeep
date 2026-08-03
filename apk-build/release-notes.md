RuneKeep v0.32.2 - Frenzy gives its Severe bonus, armor equips without closing the app, homebrew lives inside the category it belongs to, and the armor row is five shields again.

FIXES

- FRENZY GRANTS +8 TO YOUR SEVERE DAMAGE THRESHOLD. It had the Armor Slots half of its rule and not the other half.
- EQUIPPING ARMOR NO LONGER CLOSES THE APP. The armor track's shield count became dynamic in v0.32.0, and nothing had ever changed it before, so an animating shield could outlive the slot it was drawn in. Reaching for a slot that was no longer there threw during a render, which on Android closes the app outright. Frenzy made it easy to hit, because it takes your Armor Score to zero. Any track can shrink safely now.
- THE ARMOR ROW IS FIVE SHIELDS, NOT HOWEVER MANY YOU HAVE. v0.32.1 read the request backwards and showed only the shields you owned. At five or fewer it is the SECOND ROW that goes: five shields on one line, scaled up to use the space both rows used to take, spaced to line up with the twelve-shield row exactly. Six or more is the two rows of twelve, unchanged.

CARDS

- HOMEBREW IS A FILTER INSIDE EACH CATEGORY, NOT A CATEGORY OF ITS OWN. Three custom weapons now appear under Weapons, with a Homebrew chip beside the tier tabs to narrow to them. Everything else gets an Official and a Homebrew chip; with neither lit you see both, which is the default. Weapons and Armor need only the Homebrew chip, because their tiers already separate the published gear.
- THE CARD ARCHIVE SHOWS YOUR EXPANSIONS. It only ever listed the bundled cards, so a homebrew card was invisible there however you filtered. Installed expansions now file under the type their content belongs to, and the archive has the same Source filter.
- CARD DESCRIPTIONS SHOULD NO LONGER REACH THE FOOTER ON ANDROID. The description was measured one way and drawn another: the size was worked out in code, and then the platform's own auto-shrink was also switched on, but only on the phone. Two mechanisms deciding one layout is one too many, so the auto-shrink is gone and both platforms now draw from the same calculation. Six pixels above the watermark are also kept clear, and the line spacing never goes below what the typeface itself asks for, which v0.32.0 allowed.

ELSEWHERE

- THE CARDS PANEL OPENS ON CATEGORIES, and the word Categories fits inside its button instead of reading "Catego".

Sideload: enable Install unknown apps, then open the APK.
