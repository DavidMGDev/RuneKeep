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

export const VOID_ANCESTRIES: LibraryCard[] = [
  anc(
    'ancestry-earthkin',
    'Earthkin',
    '#5A4632',
    [
      { name: 'Stoneskin', body: 'Gain a **+1** bonus to your Armor Score and Damage Thresholds.' },
      { name: 'Immoveable', body: 'While your feet are touching the ground, you cannot be lifted or moved against your will.' },
    ],
    {
      ancestryEffectTrait: 1,
      effects: [
        { target: 'armorScore', mode: 'bonus', delta: 1, note: 'Stoneskin: +1 Armor Score' },
        { target: 'majorThreshold', mode: 'bonus', delta: 1, note: 'Stoneskin: +1 Damage Thresholds' },
        { target: 'severeThreshold', mode: 'bonus', delta: 1, note: 'Stoneskin: +1 Damage Thresholds' },
      ],
    },
  ),
  anc('ancestry-tidekin', 'Tidekin', '#2E5A6B', [
    { name: 'Amphibious', body: 'You can breathe and move naturally underwater.' },
    { name: 'Lifespring', body: 'Once per rest, when you have access to a small amount of water, you can mark 2 Stress to heal a Hit Point on yourself or an ally.' },
  ]),
  anc('ancestry-emberkin', 'Emberkin', '#7A3320', [
    { name: 'Fireproof', body: 'You are immune to damage from magical or mundane flame.' },
    { name: 'Ignition', body: 'Mark a Stress to wreathe your primary weapon in flame until the end of the scene. While ablaze, it gives off a bright light and grants a **1d6** bonus to damage rolls against targets within Melee range.' },
  ]),
  anc('ancestry-skykin', 'Skykin', '#3E5A78', [
    { name: 'Gale Force', body: 'Mark a Stress to conjure a gust of wind that carries you or an ally up to Very Far range. Additionally, you can always control the speed at which you fall.' },
    { name: 'Eye of the Storm', body: "Spend 2 Hope to grant a **+1** bonus to either your or an ally's Evasion until you next take Severe damage or you use Eye of the Storm again." },
  ]),
  anc('ancestry-aetheris', 'Aetheris', '#6B5A2E', [
    { name: 'Hallowed Aura', body: 'Once per rest, when an ally within Close range rolls with Fear, you can make it a roll with Hope instead.' },
    { name: 'Divine Countenance', body: 'You have advantage on rolls to command or persuade.' },
  ]),
  anc('ancestry-gnome', 'Gnome', '#3F5A3A', [
    { name: 'Nimble Fingers', body: 'When you make a Finesse Roll, you can spend 2 Hope to reroll your Hope Die.' },
    { name: 'True Sight', body: 'You have advantage on rolls to see through illusions.' },
  ]),
];
