import { type NfcGateFlags, nfcReceiveActive } from './nfc-gate';

const clear: NfcGateFlags = {
  floatOpen: false,
  damageOpen: false,
  cardInfoOpen: false,
  editCardOpen: false,
  emptyPanelOpen: false,
  leaveConfirm: false,
  sending: false,
  receiving: false,
  editing: false,
};

describe('nfcReceiveActive (v0.13.2 #359)', () => {
  it('is armed on the bare sheet', () => {
    expect(nfcReceiveActive(clear)).toBe(true);
  });

  it.each<keyof NfcGateFlags>([
    'floatOpen',
    'damageOpen',
    'cardInfoOpen',
    'editCardOpen',
    'emptyPanelOpen',
    'leaveConfirm',
    'sending',
    'receiving',
    'editing',
  ])('is blocked while %s is open', (flag) => {
    expect(nfcReceiveActive({ ...clear, [flag]: true })).toBe(false);
  });

  it('stays armed regardless of card view state (there is no compact/expanded/fullscreen/switching input)', () => {
    // The gate has no field for machineState or over-scroll on purpose — those never block receiving.
    expect(Object.keys(clear)).not.toEqual(expect.arrayContaining(['machineState', 'switching', 'expanded', 'compact']));
    expect(nfcReceiveActive(clear)).toBe(true);
  });
});
