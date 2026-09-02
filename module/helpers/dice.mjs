/**
 * Invisible Sun — throwing the dice
 */

import { colorsetForSun } from "./dice-so-nice.mjs";
import * as flux from "./flux.mjs";
import { depletionRange } from "./practice.mjs";
import { outcomeKind } from "./outcome.mjs";

/**
 * Roll a Venture/Challenge action.
 * 
 * @param {Object} options
 * @param {number} options.challenge    - GM-set challenge (0-17)
 * @param {number} options.venture      - Player's total venture (skills + bene + mods)
 * @param {number} options.magicDice    - Number of magic dice (from spells: 0-3)
 * @param {number} options.experimentalDice - Experimental Dice, which only ever flux
 * @param {string} options.sun           - Colour of the magic, to tint the dice
 * @param {number} options.sortilege    - Sortilege enhancements used (0-1 normally)
 * @param {string} options.label        - Display name for the roll
 * @param {Actor}  options.actor        - Rolling actor (for chat speaker)
 * @param {string[]} options.sources     - What made up the venture, for chat
 * @param {Object} [options.practice]    - The practice used, if one was: its
 *                                         name, kind, level, colour, what it
 *                                         cost and what it does. Carried to the
 *                                         card so the table can read the effect
 *                                         without owning the item.
 * @returns {Object} result
 */
export async function rollVenture({challenge = 0, venture = 0, magicDice = 0, sortilege = 0,
                                   experimentalDice = 0, label = "", actor = null,
                                   sources = [], sun = "", practice = null}) {
  /* Resolved here rather than as a default parameter: a default is evaluated at
   * call time, which is fine, but writing game.i18n into the signature reads as
   * though it were evaluated at module load, when i18n is not ready. */
  label = label || game.i18n.localize("ISUN.Action");

  const target = challenge - venture;
  const kind = outcomeKind({ challenge, venture, magicDice, sortilege });

  /* Nothing to roll against, or nothing left to decide. `routine` is the
   * challenge being none; `assured` is the venture having covered it. Both
   * succeed without dice and the card says which. */
  if (kind === "routine" || kind === "assured") {
    return postResult({ label, challenge, venture, target: Math.max(0, target),
                        autoSuccess: true, routine: kind === "routine",
                        actor, sources, practice });
  }

  if (kind === "impossible") {
    return postResult({ label, challenge, venture, target, impossible: true,
                        actor, sources, practice });
  }
  
  // Build dice pool. The experimental dice are a separate term because they
  // are read differently, not merely coloured differently.
  const totalMagicDice = magicDice + sortilege;
  const parts = ["1d10"];
  if (totalMagicDice > 0) parts.push(`${totalMagicDice}d10`);
  if (experimentalDice > 0) parts.push(`${experimentalDice}de`);

  const roll = await new Roll(parts.join(" + ")).evaluate();

  /* Which term is which, named once. Both the appearance below and the reading
   * further down need to know, and working it out twice is how they come to
   * disagree. Terms are in the order they were pushed above. */
  const mundaneTerm = roll.dice[0];
  let t = 1;
  const magicTerm = totalMagicDice > 0 ? roll.dice[t++] : null;
  const experimentalTerm = experimentalDice > 0 ? roll.dice[t] : null;

  /* The dice on the table are blue for the mundane die and red for the magic
   * ones, so the ones on the screen are too.
   *
   * Set per term, which is the part the previous version got wrong: it painted
   * every term in the sun's colour, so the mundane die was tinted by the magic
   * being worked and the two became harder to tell apart rather than easier.
   *
   * A sun colour still overrides the red when one is given. Measured against
   * the deck, the nine suns are not a workable way to tell magic from mundane —
   * gold and invisible sit at a colour difference of 6 under a lit surface, and
   * 82% of spells land in a pair that close — but as a flourish on top of a
   * distinction already carried by red against blue, it costs nothing.
   *
   * The Experimental Die is not listed: its preset names its own colourset, and
   * it is not one of the Nine and never was. */
  const wear = (term, colorset) => {
    if (!term || !colorset) return;
    term.options.appearance = { ...(term.options.appearance ?? {}), colorset };
  };
  wear(mundaneTerm, "isun-mundane");
  wear(magicTerm, colorsetForSun(sun) ?? "isun-magic");

  const mundaneResult = mundaneTerm.results[0].result;
  const magicResults = magicTerm ? magicTerm.results.map(r => r.result) : [];
  const experimentalResults = experimentalTerm ? experimentalTerm.results.map(r => r.result) : [];
  
  // Check for flux (0 on any magic die)
  // In IS, 0 is read as 0, not 10. Foundry's d10 rolls 1-10, where 10 is actually a 0 in game terms.
  // We need to map Foundry 10s to 0s for the rules logic.
  const mappedMundane = mundaneResult === 10 ? 0 : mundaneResult;
  const mappedMagic = magicResults.map(r => r === 10 ? 0 : r);
  
  const mappedExperimental = experimentalResults.map(r => r === 10 ? 0 : r);

  // An Experimental Die "never contributes to successes, only to flux" (The
  // Nightside, p518), so its marked face counts here and nowhere else.
  const fluxCount = mappedMagic.filter(r => r === 0).length
                  + mappedExperimental.filter(r => r === 0).length;
  const hasFlux = fluxCount > 0;
  // "The GM should associate the flux intensity with the approximate number of
  // dice that are rolled" (The Way, p806) — one die minor, two major, three
  // grand. Flux happens even when the action succeeds. Using an Experimental
  // Die "increases the chance for greater flux", so it counts towards this.
  const diceCast = totalMagicDice + experimentalDice;
  const fluxIntensity = !hasFlux ? ""
    : CONFIG.ISUN.fluxByDice[Math.min(diceCast, 3)] ?? "grand";
  /* The bare value is a key fragment and a CSS class, not something to show a
   * player — the card was printing "minor" where it meant "Minor flux". */
  const fluxIntensityLabel = fluxIntensity
    ? game.i18n.localize(`ISUN.Flux${fluxIntensity.charAt(0).toUpperCase()}${fluxIntensity.slice(1)}`)
    : "";

  // Success comes from the mundane die and any magic dice — never from an
  // Experimental Die, whose other nine faces are blank.
  const allResults = [mappedMundane, ...mappedMagic];
  const successes = allResults.filter(r => r >= target).length;
  const success = successes > 0;
  
  // Build and post result
  return postResult({
    label, challenge, venture, target,
    mundaneResult: mappedMundane, 
    magicResults: mappedMagic,
    experimentalResults: mappedExperimental,
    success, successes, hasFlux, fluxCount, fluxIntensity, fluxIntensityLabel,
    roll, actor, sources, practice
  });
}

/**
 * Parse a depletion string and roll for it.
 *
 * Takes the value, not the item that holds it: the books write depletion as
 * prose — "0–1 (check each use)", "Ends automatically when the sun next sets" —
 * so the number has to be read out of a sentence, and an entry with no digits
 * in it simply does not deplete.
 */
export async function checkDepletion(depletionString, actor = null) {
  /* Reading the range is helpers/practice.mjs's, because the sheet has to ask
   * the same question to know whether the depletion is one that can be rolled
   * at all — 171 of the 541 entries end on a sunrise or a condition instead. */
  const range = depletionRange(depletionString);
  if (!range) return null;
  const { low, high } = range;
  
  const roll = await new Roll("1d10").evaluate();
  const rawResult = roll.dice[0].results[0].result;
  const result = rawResult === 10 ? 0 : rawResult; // Map 10 to 0
  
  const depleted = result >= low && result <= high;
  const rangeText = low === high ? String(low) : `${low}–${high}`;

  const { renderTemplate } = foundry.applications.handlebars;
  const content = await renderTemplate(
    "systems/invisible-sun/templates/chat/depletion-result.hbs",
    {
      result, depleted, range: rangeText,
      rangeLabel: game.i18n.format("ISUN.DepletionRange", { range: rangeText }),
      original: depletionString
    });

  await ChatMessage.create({
    speaker: actor ? ChatMessage.getSpeaker({ actor }) : {},
    content,
    rolls: [roll]
  });

  return { roll, result, depleted, range: rangeText, original: depletionString };
}

/**
 * Post a formatted chat message with the dice result.
 */
async function postResult(data) {
  const templateData = { ...data, config: CONFIG.ISUN };
  // v14 has no global renderTemplate; it lives under the handlebars namespace.
  const { renderTemplate } = foundry.applications.handlebars;
  const content = await renderTemplate("systems/invisible-sun/templates/chat/dice-result.hbs", templateData);
  
  /* A flux is flagged onto the message rather than acted on here. The roller
   * may be a player, and what a flux does — turn a Sooth card — writes a world
   * setting only a GM may write. See helpers/flux.mjs. */
  const flags = data.hasFlux
    ? { [flux.SCOPE]: { [flux.FLAG]: flux.flagFor(data) } }
    : {};

  await ChatMessage.create({
    speaker: data.actor ? ChatMessage.getSpeaker({ actor: data.actor }) : {},
    content,
    rolls: data.roll ? [data.roll] : [],
    flags
  });

  return data;
}
