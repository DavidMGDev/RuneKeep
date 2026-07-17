/**
 * v0.13.2 (#359): whether the character sheet is currently LISTENING for an NFC card.
 *
 * The rule (owner spec): receiving is ALWAYS on while a player is just looking at their sheet, and is
 * suppressed only while a focused interface is open — level up, rest, add card / add gear, edit mode,
 * the incoming-damage panel, or the cards/categories panel. It is NEVER suppressed by card VIEW state
 * (compact / expanded / fullscreen), by a category over-scroll, or by any icon/rise animation.
 *
 * Every blocking flag here is React panel state that the device-back guard unwinds (or a transient
 * confirm that self-closes), so the gate can never latch — a player is never softlocked out of
 * receiving by a panel that was opened once and left in a bad state.
 */
export interface NfcGateFlags {
  /** Any float-menu interface is open (level / rest / add-card / add-gear / modifiers / cards). */
  floatOpen: boolean;
  /** The incoming-damage keypad is open. */
  damageOpen: boolean;
  /** The per-card modifier sheet is open. */
  cardInfoOpen: boolean;
  /** The edit-a-card editor is open. */
  editCardOpen: boolean;
  /** The empty-category panel is open. */
  emptyPanelOpen: boolean;
  /** The leave-confirmation dialog is up. */
  leaveConfirm: boolean;
  /** An NFC SEND is in progress (don't send and receive at once). */
  sending: boolean;
  /** A received card is already mid-ceremony (don't read a second tag over it). */
  receiving: boolean;
  /** Golden Gear Edit is active. */
  editing: boolean;
}

/** True when the sheet should be armed to receive an NFC card. Pure — trivially unit-tested. */
export function nfcReceiveActive(f: NfcGateFlags): boolean {
  return !(
    f.floatOpen ||
    f.damageOpen ||
    f.cardInfoOpen ||
    f.editCardOpen ||
    f.emptyPanelOpen ||
    f.leaveConfirm ||
    f.sending ||
    f.receiving ||
    f.editing
  );
}
