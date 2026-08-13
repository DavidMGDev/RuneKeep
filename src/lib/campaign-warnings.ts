/**
 * When a campaign's rules make a character IMPOSSIBLE (v0.42.5, owner).
 *
 * "Implement warnings for the user if they disable all classes since the characters will not be able
 * to be created, same if they disable all subclasses for a currently enabled class or all the
 * available domain cards for a currently enabled class (remember classes are combinations of two
 * domains, check both to see if they have at least 2 cards, if not then add a warning). Remember that
 * no warnings should be issued for any other step since they can all be disabled and it will cause
 * them to be skipped."
 *
 * That last sentence is the whole rule, and it is why this module is short. Almost every step can be
 * emptied and simply skipped: no ancestry, no community, no gear, and the creator moves on. THREE
 * things cannot, because a character is built out of them:
 *
 *   1. a class, which decides the numbers and everything downstream
 *   2. a subclass FOR THE CLASS YOU PICKED, which is chosen at level one
 *   3. two domain cards at level one, taken from the two domains that class grants
 *
 * The third is the subtle one. A class grants two domains, and the player takes TWO cards between
 * them, so it is the PAIR that has to hold two: a class with one card in each domain is fine, and a
 * class with one card in one domain and none in the other is not.
 *
 * Warnings, not errors: a DM may be halfway through and about to turn something back on. Nothing here
 * blocks anything. It says what a player would run into.
 */

import { isOptionOn, optionKey, type CampaignSettings } from './campaign-settings';

/** The shape this module needs of a class on offer. */
export interface CampaignClass {
  /** The option id the creator uses for this class, e.g. `class-bard`. */
  id: string;
  label: string;
  /** The two domains it grants, by key. */
  domains: string[];
}

/** A subclass on offer, and the class it belongs to. */
export interface CampaignSubclass {
  id: string;
  /** The class id it belongs to, matching `CampaignClass.id`. */
  classId: string;
}

/** A level-one domain card on offer. */
export interface CampaignDomainCard {
  id: string;
  /** Its domain, by key. */
  domain: string;
}

/** What the DM is told, in the order it matters. */
export interface CampaignWarning {
  /** Which step it is about, so the UI can put it where it belongs. */
  deck: 'class' | 'subclass' | 'domains';
  text: string;
}

const on = (cs: CampaignSettings, deck: string, id: string) => isOptionOn(cs, deck, id);
const key = (s: string | undefined) => (s ?? '').trim().toLowerCase();

/**
 * Everything a player would be unable to do under these rules.
 *
 * Empty means a character can be built. The order is the order the creator asks the questions in, so
 * the first warning is the first wall a player would hit.
 */
export function campaignWarnings(
  cs: CampaignSettings | undefined,
  content: { classes: CampaignClass[]; subclasses: CampaignSubclass[]; domainCards: CampaignDomainCard[] },
): CampaignWarning[] {
  if (!cs?.on) return [];
  const out: CampaignWarning[] = [];

  const liveClasses = content.classes.filter((c) => on(cs, 'class', c.id));
  if (content.classes.length && !liveClasses.length) {
    out.push({ deck: 'class', text: 'Every class is removed, so nobody can make a character at all. Leave at least one available.' });
    // Nothing below can be said usefully once there is no class to say it about.
    return out;
  }

  for (const c of liveClasses) {
    const mine = content.subclasses.filter((s) => s.classId === c.id);
    if (mine.length && !mine.some((s) => on(cs, 'subclass', s.id))) {
      out.push({ deck: 'subclass', text: `${c.label} has no subclass left. A character of that class cannot be finished, so either restore one or remove ${c.label} as well.` });
    }

    /**
     * The PAIR has to hold two (owner). A player takes two level-one cards from the two domains their
     * class grants, so one card in each is fine and two in one is fine; fewer than two between them
     * is a class nobody can complete.
     */
    const wanted = c.domains.map(key).filter(Boolean);
    const available = content.domainCards.filter((d) => wanted.includes(key(d.domain)) && on(cs, 'domains', d.id));
    if (wanted.length && available.length < 2) {
      const which = c.domains.filter(Boolean).join(' and ');
      out.push({
        deck: 'domains',
        text: `${c.label} has ${available.length === 0 ? 'no' : 'only one'} level 1 domain card left between ${which}. A character takes two, so restore ${2 - available.length} or remove ${c.label}.`,
      });
    }
  }

  return out;
}

/** The keys a warning is about, so the UI can point at the step that fixes it. */
export const warningStepKeys = (w: CampaignWarning): string => optionKey(w.deck, '');
