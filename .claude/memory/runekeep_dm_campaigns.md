---
name: runekeep-dm-campaigns
description: v0.41.4 - Parties became CAMPAIGNS (the stored entity was deliberately NOT renamed and the route kept its path); the Active flag is gone; migration is a tolerant READ in the stores, never a one-shot rewrite; a shared DmIdentity with a DERIVED initial is what made every old record identifiable for free; LinearTransition on an entry IS what stretches its text
metadata:
  type: project
---

For [[project-runekeep-overview]], shipped 2026-08-10 as v0.41.4 (PR #445, PRD issue #444).

**THE STORED ENTITY WAS NOT RENAMED, AND THE ROUTE KEPT ITS PATH.** A campaign IS the party record
plus its sessions. Renaming `Party` would have touched every DM screen for no user-visible gain and
put a migration in the way of a migration; renaming `/parties` would break the back stack of any
installed build. The user-facing word is Campaign everywhere it is read, and nothing else moved.
`enabled` survives on the record and means nothing (migration forces it true) so an older build still
reads a well-formed party.

**MIGRATION IS A TOLERANT READ, NOT A ONE-SHOT REWRITE** (`lib/dm-migrate`). A rewrite has a moment
where the old data is gone and the new is not yet written, and an app that dies in that moment takes
the campaign with it. A read has no such moment, repairs the same record every time until something
writes it back, and survives SKIPPING versions because there is no chain of migrations to walk. Both
DM stores now map every read through it. Rules: unknown fields are preserved in both directions (an
older build writing a store a newer one reads is a real case here), a record that cannot be repaired
is dropped, and one that THROWS while being repaired is skipped, so one bad encounter costs that
encounter and never the night.

**A DERIVED INITIAL IS WHY ITEM 9 WAS FREE.** `lib/dm-identity` gives campaigns, sessions and
encounters one identity: image beats colour beats the first letter of the title. The letter is never
stored, so every record that already existed was identifiable the moment this shipped without touching
a single one. Design rule worth keeping: when a fallback can be DERIVED from data you already have,
derive it rather than backfilling it.

**`LinearTransition` ON A LIST ENTRY IS WHAT STRETCHES ITS TEXT.** The owner's "it morphs all of the
text vertically" was the entry's own layout transition interpolating its FRAME while React Native laid
the children out afresh at each interpolated height. There is no way to keep the glide and lose the
morph, because the morph IS the glide. Remove the layout animation and fade the expanded detail
instead; neighbours then reflow at once, which is the smaller loss. It also removes anything racing a
ScrollView's own measurement.

**Counters, corrected** (v0.41.3 built them, v0.41.4 fixed the rules). A countdown only counts DOWN;
`canStep` and `isSpent` put that in the model so the control draws what is possible rather than
deciding. A non-looping countdown at zero turns its minus into an X that FELLS the entry, and
`recover` restarts every countdown (a resource is a supply, not a timer, and is left alone).
`setStart` is the right rule while typing (it moves only an untouched counter); `commitStarts` on Save
is the deliberate commit and moves it regardless.

**Encounters copy as well as move.** `copyEncounterToSession` is prepared, clones its combatants and
KEEPS its name, where `duplicateEncounter` renames itself "Encounter #n" (right in the session it came
from, wrong in one it was deliberately copied into). The picker leads with the current campaign's
sessions expanded and folds every other campaign shut.

READ before any DM campaign/session/encounter work, DM data migration, list-entry expand animation,
counter rules, or "how do I show something for records that predate the field" work.
