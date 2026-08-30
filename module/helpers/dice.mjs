/**
 * Invisible Sun — throwing the dice
 */

import { colorsetForSun } from "./dice-so-nice.mjs";
import * as flux from "./flux.mjs";

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
 * @returns {Object} result
 */
export async function rollVenture({challenge = 0, venture = 0, magicDice = 0, sortilege = 0,
                                   experimentalDice = 0, label = "", actor = null,
                                   sources = [], sun = ""}) {
  const target = challenge - venture;

  /* Resolved here rather than as a default parameter: a default is evaluated at
   * call time, which is fine, but writing game.i18n into the signature reads as
   * though it were evaluated at module load, when i18n is not ready. */
  label = label || game.i18n.localize("ISUN.Action");

  // Auto-success
  if (target <= 0) {
    return postResult({ label, challenge, venture, target: 0, autoSuccess: true, actor, sources });
  }

  // Impossible: a die reads 0-9, so a target of 10 cannot be met without more
  // dice to try it on. Experimental dice do not count — they never succeed.
  if (target >= 10 && magicDice === 0 && sortilege === 0) {
    return postResult({ label, challenge, venture, target, impossible: true, actor, sources });
  }
  
  // Build dice pool. The experimental dice are a separate term because they
  // are read differently, not merely coloured differently.
  const totalMagicDice = magicDice + sortilege;
  const parts = ["1d10"];
  if (totalMagicDice > 0) parts.push(`${totalMagicDice}d10`);
  if (experimentalDice > 0) parts.push(`${experimentalDice}de`);

  const roll = await new Roll(parts.join(" + ")).evaluate();

  // Dice So Nice reads a term's appearance, so the magic being worked can
  // colour the dice it is worked with.
  const colorset = colorsetForSun(sun);
  if (colorset) {
    for (const term of roll.dice) {
      term.options.appearance = { ...(term.options.appearance ?? {}), colorset };
    }
  }

  // Parse results. Terms are in the order they were pushed above.
  let t = 1;
  const magicTerm = totalMagicDice > 0 ? roll.dice[t++] : null;
  const experimentalTerm = experimentalDice > 0 ? roll.dice[t] : null;

  const mundaneResult = roll.dice[0].results[0].result;
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
    roll, actor, sources
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
  if (typeof depletionString !== "string") return null;
  if (!depletionString || depletionString === "—") return null;

  /* "X" or "X–Y". The dash is the point: every ranged entry in the packs — all
   * 153 of them — is written with an en dash, and not one uses a hyphen, so a
   * pattern accepting only "-" never matched a range at all. It read "1–3" as
   * 1 and "0–1" as 0, understating depletion on every ranged item in the game.
   * Both dashes and the em dash are accepted now; the leading guard above still
   * catches a bare "—" used to mean "does not deplete". */
  const match = depletionString.match(/(\d+)\s*(?:[-–—]\s*(\d+))?/);
  if (!match) return null;
  
  const low = parseInt(match[1]);
  const high = match[2] !== undefined ? parseInt(match[2]) : low;
  
  const roll = await new Roll("1d10").evaluate();
  const rawResult = roll.dice[0].results[0].result;
  const result = rawResult === 10 ? 0 : rawResult; // Map 10 to 0
  
  const depleted = result >= low && result <= high;
  const range = low === high ? String(low) : `${low}–${high}`;

  const { renderTemplate } = foundry.applications.handlebars;
  const content = await renderTemplate(
    "systems/invisible-sun/templates/chat/depletion-result.hbs",
    {
      result, depleted, range,
      rangeLabel: game.i18n.format("ISUN.DepletionRange", { range }),
      original: depletionString
    });

  await ChatMessage.create({
    speaker: actor ? ChatMessage.getSpeaker({ actor }) : {},
    content,
    rolls: [roll]
  });

  return { roll, result, depleted, range, original: depletionString };
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
