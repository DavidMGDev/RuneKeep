/**
 * The Void expansion's 6 ancestries as STRUCTURED cards (v0.12.3). Authored "from scratch" as
 * `LibraryCard`s (two `sections` each) rather than opaque webp catalog cards, so they flow through the
 * generic custom-ancestry path: live forged rendering, markdown, mixed-ancestry TEXT strike-through, and
 * `ancestryEffectTrait`-gated stat effects. Bundled onto the official Void expansion record (off-by-default,
 * gated by `enabledExpansionIds`) — see src/lib/expansions.ts `seedOfficialExpansions`.
 *
 * Feature text is verbatim from the publisher's Heritage sheet. Ids REUSE the former catalog ids so any
 * existing reference (`ancestryCardId` / `mixedAncestry`) keeps resolving; the 6 image rows were removed
 * from the catalog. Only Earthkin/Stoneskin is a permanent stat passive — the rest are abilities.
 */
import type { LibraryCard, CardSection } from '@/lib/library';

/** Compose the plain `text` fallback (simple renderers) from the structured sections. */
const composeText = (sections: CardSection[]): string =>
  sections.map((s) => (s.name ? `**${s.name}:** ${s.body}` : s.body)).join('\n\n'); // colon lead (v0.13.0 typeset)

const anc = (id: string, title: string, color: string, sections: CardSection[], extra?: Partial<LibraryCard>): LibraryCard => ({
  id,
  contentType: 'ancestry',
  title,
  text: composeText(sections),
  imageUri: null,
  color,
  sections,
  ...extra,
});

/**
 * v0.21.0 (items 1/2): the illustrated ancestry art, cropped from HOPEANDFEAR_Cards.pdf. Ancestries are
 * STRUCTURED text cards (so mixed-ancestry strike-through + the Earthkin passive keep working), so they
 * carry no `imageUri`; instead LibraryForgedCard looks the art up BY ID here and paints it in the card's
 * art band (via ForgedCard's `fallbackArt`), matching the illustrated communities. Keyed by ancestry id;
 * a bundled `require()` module number — deliberately NOT stored on the serializable LibraryCard.
 */
export const VOID_ANCESTRY_ART: Record<string, number> = {
  'ancestry-earthkin': require('../../assets/extracted_cards/Void/Ancestry/earthkin.webp'),
  'ancestry-tidekin': require('../../assets/extracted_cards/Void/Ancestry/tidekin.webp'),
  'ancestry-emberkin': require('../../assets/extracted_cards/Void/Ancestry/emberkin.webp'),
  'ancestry-skykin': require('../../assets/extracted_cards/Void/Ancestry/skykin.webp'),
  'ancestry-aetheris': require('../../assets/extracted_cards/Void/Ancestry/aetheris.webp'),
  'ancestry-gnome': require('../../assets/extracted_cards/Void/Ancestry/gnome.webp'),
};

/** The italic line above the two features on the printed card. Never a feature, so never struck out. */
const flavour = (body: string): CardSection => ({ body });

/**
 * v0.24.0: every one of these was transcribed from a pre-release sheet and had since been reprinted.
 * Two ancestries had the WRONG SECOND FEATURE entirely (Aetheris had "Divine Countenance" instead of
 * Celestial Wings, Gnome had "True Sight" instead of Flicker Step) and the other four had reworded
 * mechanics, several of which changed what the feature actually does: Tidekin's Lifespring went from
 * "mark 2 Stress to heal" to "mark a Stress to clear", and Emberkin's Ignition dropped its Melee
 * restriction. Retranscribed from the printed faces (DH HF 025-030/063).
 *
 * Each card now leads with its flavour line, matching the print. `featureSectionIndexes` resolves the
 * two `feature`-flagged sections wherever they sit, so mixed-ancestry strike-through and Earthkin's
 * stat passive keep pointing at the right blocks.
 */
export const VOID_ANCESTRIES: LibraryCard[] = [
  anc(
    'ancestry-earthkin',
    'Earthkin',
    '#5A4632',
    [
      flavour('Earthkin are humanoids whose bodies are made of flesh and earth.'),
      { name: 'Stoneskin', body: 'Gain a permanent **+1** bonus to your Armor Score and damage thresholds at character creation.', feature: true },
      { name: 'Immovable', body: "While you're touching the ground, you can't be lifted or moved against your will.", feature: true },
    ],
    {
      ancestryEffectTrait: 1,
      effects: [
        { target: 'armorScore', mode: 'bonus', delta: 1, note: 'Stoneskin: +1 Armor Score' },
        { target: 'majorThreshold', mode: 'bonus', delta: 1, note: 'Stoneskin: +1 damage thresholds' },
        { target: 'severeThreshold', mode: 'bonus', delta: 1, note: 'Stoneskin: +1 damage thresholds' },
      ],
    },
  ),
  anc('ancestry-tidekin', 'Tidekin', '#2E5A6B', [
    flavour('Tidekin are humanoids whose bodies are made of flesh and water.'),
    { name: 'Amphibious', body: 'You can breathe and move naturally underwater.', feature: true },
    { name: 'Lifespring', body: 'Once per rest when you have access to a small amount of water, you can **mark a Stress** to clear a Hit Point on yourself or an ally within Very Close range.', feature: true },
  ]),
  anc('ancestry-emberkin', 'Emberkin', '#7A3320', [
    flavour('Emberkin are humanoids whose bodies are made of flesh and fire.'),
    { name: 'Fireproof', body: 'You are immune to damage from magical or mundane flame.', feature: true },
    { name: 'Ignition', body: '**Mark a Stress** to wreathe your primary weapon in flame until the end of the scene. While the weapon is ablaze, it gives off a bright light, and you gain a **1d6** bonus to damage rolls with that weapon.', feature: true },
  ]),
  anc('ancestry-skykin', 'Skykin', '#3E5A78', [
    flavour('Skykin are humanoids whose bodies are made of flesh and air.'),
    { name: 'Gale Force', body: '**Mark a Stress** to conjure a gust of wind that carries you or a Very Close ally up to Very Far range. Additionally, you can always control the speed at which you fall.', feature: true },
    { name: 'Eye of the Storm', body: '**Spend 2 Hope** to grant you or an ally within Melee range a **+1** bonus to Evasion until you take Severe damage or you use this feature again.', feature: true },
  ]),
  anc('ancestry-aetheris', 'Aetheris', '#6B5A2E', [
    flavour('Aetheris are humanoids most easily recognized by their wings and sacred markings.'),
    { name: 'Hallowed Aura', body: 'Once per long rest when an ally within Close range rolls with Fear, you can change it into a roll with Hope instead.', feature: true },
    { name: 'Celestial Wings', body: 'You have wings that allow you to fly. Once per scene while flying, you can **spend a Hope** instead of marking an Armor Slot.', feature: true },
  ]),
  anc('ancestry-gnome', 'Gnome', '#3F5A3A', [
    flavour('Gnomes are typically small humanoids with conical heads and the ability to teleport short distances.'),
    { name: 'Nimble Fingers', body: 'When you make a Finesse Roll, you can **spend 2 Hope** to reroll your Hope Die.', feature: true },
    { name: 'Flicker Step', body: 'Once per scene, you can teleport to another point you can see within Far range.', feature: true },
  ]),
];
