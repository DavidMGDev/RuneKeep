---
name: runekeep-v0132-features
description: v0.13.2 (PRD #359, PR #360) — sheet NFC receiving + ceremony, catalog sourcing, ancestry/library fixes
metadata:
  node_type: memory
  type: project
  originSessionId: 5933d0fe-a446-4fb9-9d00-1d7dd25fc56d
---

v0.13.2 (merged 2026-07-17, PR #360, PRD issue #359) invariants:

- **Custom ancestry passive**: the "Passive on feature line" author chip is GONE. The crossed-out
  feature is ALWAYS selection-order (mixedCrossedTrait + featureSectionIndexes); the mechanical passive
  rides Feature 1 by convention. card-effects.ts effectsForCardId now gates with
  `mixedCrossedTrait(file,id) === (lib.ancestryEffectTrait ?? 1)` — a missing trait defaults to 1 (like
  Void's Earthkin). The section editor's Feature 1/2 organization is untouched.
- **Gear browser record sourcing**: gear-browser.tsx now buckets ALL globally-enabled custom-expansion
  record cards (a single `records` state → homebrew/recordAncestries/recordDomains/recordCommunities/
  recordSubclasses/recordClasses memos), merges each into its tab (domain chip names union in too), and
  the Select handler routes ANY `records.find(id)` card through onAddCustom (catalog → onAdd). Custom
  packs reach the browser via GLOBAL enablement (`!e.official`), independent of the character snapshot.
  `domain` state is now `string` (custom domain names aren't the catalog union). Transformations stay
  catalog-only (no LibraryContentType).
- **Add-card catalog parity**: redesigned-sheet passes onAcquire/onAcquireCustom UNCONDITIONALLY to
  NewCardFlow (was nulled for the 'card' entry) so the "Add Card" badge shows "Add card from catalog".
- **RuneButton** now has `adjustsFontSizeToFit minimumFontScale={0.7}` — labels shrink, never truncate.
- **NFC moved to the sheet**: library-screen lost the Receive-NFC button + NfcReceiveModal path +
  onNfcReceived + 'exp-received'. Sheet receiving = `SheetNfcReceiver` (nfc-receive-ceremony.tsx, mounted
  inside the providers by SheetBackGuard) running a persistent receiveNfc() loop, gated by the PURE
  `nfcReceiveActive(flags)` (nfc-gate.ts + test). Blocks ONLY on open interfaces (floatKind/damage/
  cardInfo/editCard/emptyPanel/leaveConfirm/sending/receiving + carousel `editing`); NEVER on machineState
  (compact/expanded/fullscreen) or switching. Softlock-proof: every flag is unwound by the device-back
  guard. Loop re-arms after each tag/close; `break`s on a card so `receiving` closes the gate.
- **Receive ceremony** (NfcReceiveCeremony, full-screen, zIndex 9600, rendered after DesignStage): confirm
  panel fades in + collapse() to compact; on Accept the card drops from the top (quartic ease-out) to
  center with a deterministic gold SPARK field (plain Animated.View, no Skia), then tucks into the hand
  (ease-in) while the commit fires UNDER the overlay (~DESCEND_MS-40) so the carousel update is
  flicker-free (Golden-Gear-Edit principle). Commit routing: `card.catalogId && cardById()` → onAcquireCard
  (real art) else onAcquireCustom (embed). Target category = current, falling back to inventory for
  wildshape/martialform/favorites. Respects useReducedMotion (skips the drop, commits+dismisses). Timing
  knobs DESCEND_MS/TUCK_MS/COMMIT_AT at the top of the file — tune on device.
- Detached release build: PID-watched via Monitor polling the UTF-16 log through powershell.exe (bash grep
  misses UTF-16); marker `===ALL DONE===`, failure = FAILED / "release step failed".

See [[runekeep-v0131-features]], [[runekeep_library_rkp]], [[runekeep_void_expansion]], [[runekeep_render_perf]].
