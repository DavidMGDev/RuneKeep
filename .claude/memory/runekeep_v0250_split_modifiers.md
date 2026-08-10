---
name: runekeep_v0250_split_modifiers
description: "v0.25.0 split the official pack into Hope and Fear + The Void, added permanent/chosen modifiers, and re-cut all 63 HF card faces"
metadata: 
  node_type: memory
  type: project
  originSessionId: 1859e40f-c67c-40af-8dd0-8ad1cbbfa612
  modified: 2026-07-30T18:14:51.746Z
---

Shipped 2026-07-30 on branch `v0.25.0-web-parity-void-split` (PRD = GitHub issue #386).

**TWO official expansions now.** `VOID_EXPANSION_ID = 'void'` is still Hope and Fear (id kept for
back-compat, only the display name ever changed) and `THE_VOID_EXPANSION_ID = 'thevoid'` is the beta.
Blood Hunter + Summoner, their 5 subclasses, and all 21 Blood domain cards moved to The Void. Ids
never change, only the `expansion` tag, and `src/lib/expansion-membership.ts` tops up a character's
`enabledExpansionIds` on load so a pre-split Blood Hunter does not lose its class. Never decide the
split by hand: run `scripts/audit_expansion_vs_pdf.py`.

**Two audit traps worth remembering.** Judging a domain by its NAME is wrong: the Cards book runs
"BLOOD DOMAIN" down two page edges as a rotated label while printing no Blood card at all (all 21
domain cards it prints are Dread). And "Summoner" appears once in the Adversaries book inside a
creature description, which reads as proof the class is in the book unless the search is scoped to
the Classes PDF.

**PERMANENT and CHOSEN modifiers** are new `CardEffect` fields. `permanent: true` keeps an effect
applying whether or not the card is equipped, ending only when the card is deleted from every
category (`unequippedPermanentSources` + `heldCardIds` in card-effects.ts). `option: n` ties an effect
to one entry of a `CardChoice` (src/data/card-choices.ts); the player's pick lives on the character
file as `cardChoices`, which is what makes history undo work with no replay logic. Vitality
(`blade-05-2`) uses both and is exempt from the 5-domain-card cap.

**The Elf's Celestial Trance is a modifier now** (`restMoves` target), not a hard-coded rule in
rest.ts. `restMoveLimit(bonus)` takes a number. The Elf is therefore no longer a passive-free
ancestry, and `ANCESTRY_EFFECT_TRAIT` gained `'ancestry-elf': 2`.

**Card crops were a point out in both axes**, putting a sliver of the neighbouring card down every
left edge. The true grid is COL_X [36.4, 215.9, 395.4], ROW_Y [18.4, 270.4, 522.4], card 179.5 x 252,
flush in both directions, and it is owned by `scripts/extract_hf_cards.py` (which `ancestry_marker.py`
imports rather than repeating). Re-cutting moved the ancestry strike marks, so those were recomputed.

**Audio on web needs waking, not creating.** A browser will not let a page make noise before user
interaction; a context built at load starts suspended and every later play is a silent no-op with
nothing in the console. `sfx.ts` wakes it on every play and on the first pointer/key event.

Related: [[runekeep_hf_pdf_facts]], [[runekeep_void_expansion]], [[runekeep_modifier_system]],
[[runekeep_web_platform_gotchas]]
