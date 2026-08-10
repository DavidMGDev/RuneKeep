---
name: runekeep_no_digital_dice
description: Core RuneKeep philosophy — the app NEVER rolls dice digitally; correct my mental model
metadata: 
  node_type: memory
  type: project
  originSessionId: 37f7bcf0-30fa-4fbb-8959-07de56b1f07d
---

**RuneKeep does NO digital dice-rolling — ever. This is engrained in the app's philosophy (owner, 2026-07-15).**
The player rolls PHYSICAL dice; the app only records/uses the results. The ONLY roll-related features are:
- the **damage calculator** (you enter the physical damage-roll result → it computes HP loss vs thresholds), and
- the **rest** roll results (you enter physical dice results).

There is **no attack roll, no duality roll, no digital RNG for gameplay**. So NEVER justify a design/deferral
with "the attack roll needs X" — that concept doesn't exist here. A weapon's `damage` string (e.g. `d8+2`) is
shown on the card and fed to the **damage calculator** (as the die to roll physically), NOT rolled by the app.

Consequence for custom equipped weapons (deferred in v0.10.3): the real reason they're not yet the equipped
PRIMARY is that the weapon-slot resolution (`weaponById` in `redesigned-sheet` weaponJobs + the damage panel)
reads the static equipment table — a custom weapon would need those to also resolve `file.libraryCards`. NOT
because of any "roll". Custom weapons already work as loose ADD-GEAR/library display cards. See [[runekeep_library_rkp]].
