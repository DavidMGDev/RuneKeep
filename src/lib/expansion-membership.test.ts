import { THE_VOID_EXPANSION_ID, VOID_EXPANSION_ID } from '@/constants/identity';
import { CATALOG } from '@/data/catalog';

import { classExpansion, expansionsNeededBy, withRequiredExpansions } from './expansion-membership';

/** A real card id from each pack, so the test breaks if the retag is undone rather than passing on a
 *  fabricated id that no longer exists. */
const bloodCard = CATALOG.find((c) => c.expansion === THE_VOID_EXPANSION_ID && c.kind === 'domain')!.id;
const dreadCard = CATALOG.find((c) => c.expansion === VOID_EXPANSION_ID && c.kind === 'domain')!.id;

describe('which expansions a character needs', () => {
  it('needs nothing for a base-game character', () => {
    expect(expansionsNeededBy({ className: 'warrior', domainCardIds: [] })).toEqual([]);
  });

  it('needs Hope and Fear for its classes', () => {
    expect(expansionsNeededBy({ className: 'assassin' })).toEqual([VOID_EXPANSION_ID]);
  });

  it('needs The Void for the two classes the book left out', () => {
    expect(expansionsNeededBy({ className: 'bloodhunter' })).toEqual([THE_VOID_EXPANSION_ID]);
    expect(expansionsNeededBy({ className: 'summoner' })).toEqual([THE_VOID_EXPANSION_ID]);
  });

  it('needs the pack a referenced card belongs to, even when the class is base game', () => {
    expect(expansionsNeededBy({ className: 'warrior', domainCardIds: [bloodCard] })).toEqual([THE_VOID_EXPANSION_ID]);
    expect(expansionsNeededBy({ className: 'warrior', domainCardIds: [dreadCard] })).toEqual([VOID_EXPANSION_ID]);
  });

  it('needs both when a multiclass straddles the split', () => {
    const need = expansionsNeededBy({ className: 'assassin', multiclassName: 'bloodhunter' });
    expect(new Set(need)).toEqual(new Set([VOID_EXPANSION_ID, THE_VOID_EXPANSION_ID]));
  });

  it('ignores ids it does not recognise, since embedded homebrew is not in the catalog', () => {
    expect(expansionsNeededBy({ className: 'warrior', domainCardIds: ['custom-abc'] })).toEqual([]);
  });
});

describe('topping up a saved character', () => {
  // The reason this module exists: before the split a Blood Hunter stored only 'void', and after it
  // every Blood Hunter card is tagged 'thevoid'. Without the top-up the class stops resolving.
  it('adds the pack a pre-split character is missing', () => {
    expect(withRequiredExpansions({ className: 'bloodhunter', enabledExpansionIds: [VOID_EXPANSION_ID] })).toEqual([
      VOID_EXPANSION_ID,
      THE_VOID_EXPANSION_ID,
    ]);
  });

  it('never drops an expansion the player enabled but has not used yet', () => {
    const enabled = [VOID_EXPANSION_ID, 'some-homebrew'];
    expect(withRequiredExpansions({ className: 'warrior', enabledExpansionIds: enabled })).toEqual(enabled);
  });

  it('returns the same array when nothing is missing, so callers can skip a write', () => {
    const enabled = [THE_VOID_EXPANSION_ID];
    expect(withRequiredExpansions({ className: 'bloodhunter', enabledExpansionIds: enabled })).toBe(enabled);
  });

  it('is idempotent', () => {
    const once = withRequiredExpansions({ className: 'summoner', enabledExpansionIds: [] });
    expect(withRequiredExpansions({ className: 'summoner', enabledExpansionIds: once })).toEqual(once);
  });

  it('copes with a character that has no list at all', () => {
    expect(withRequiredExpansions({ className: 'bloodhunter' })).toEqual([THE_VOID_EXPANSION_ID]);
  });
});

describe('classExpansion', () => {
  it('leaves base-game classes untagged', () => {
    expect(classExpansion('wizard')).toBeUndefined();
  });
});
