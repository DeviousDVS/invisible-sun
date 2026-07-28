/**
 * Invisible Sun — Dice Resolution Engine
 */

/**
 * Roll a Venture/Challenge action.
 * 
 * @param {Object} options
 * @param {number} options.challenge    - GM-set challenge (0-17)
 * @param {number} options.venture      - Player's total venture (skills + bene + mods)
 * @param {number} options.magicDice    - Number of magic dice (from spells: 0-3)
 * @param {number} options.sortilege    - Sortilege enhancements used (0-1 normally)
 * @param {string} options.label        - Display name for the roll
 * @param {Actor}  options.actor        - Rolling actor (for chat speaker)
 * @returns {Object} result
 */
export async function rollVenture({challenge = 0, venture = 0, magicDice = 0, sortilege = 0, label = "Action", actor = null}) {
  const target = challenge - venture;
  
  // Auto-success
  if (target <= 0) {
    return postResult({ label, challenge, venture, target: 0, autoSuccess: true, actor });
  }
  
  // Impossible (target >= 10 and no extra dice)
  if (target >= 10 && magicDice === 0 && sortilege === 0) {
    return postResult({ label, challenge, venture, target, impossible: true, actor });
  }
  
  // Build dice pool
  const totalMagicDice = magicDice + sortilege;
  const formula = totalMagicDice > 0 ? `1d10 + ${totalMagicDice}d10` : `1d10`;
  
  const roll = await new Roll(formula).evaluate();
  
  // Parse results
  const mundaneResult = roll.dice[0].results[0].result;
  const magicResults = totalMagicDice > 0 ? roll.dice[1].results.map(r => r.result) : [];
  
  // Check for flux (0 on any magic die)
  // In IS, 0 is read as 0, not 10. Foundry's d10 rolls 1-10, where 10 is actually a 0 in game terms.
  // We need to map Foundry 10s to 0s for the rules logic.
  const mappedMundane = mundaneResult === 10 ? 0 : mundaneResult;
  const mappedMagic = magicResults.map(r => r === 10 ? 0 : r);
  
  const fluxCount = mappedMagic.filter(r => r === 0).length;
  const hasFlux = fluxCount > 0;
  
  // Check for success (any die >= target, treating 0 as 0)
  const allResults = [mappedMundane, ...mappedMagic];
  const successes = allResults.filter(r => r >= target).length;
  const success = successes > 0;
  
  // Build and post result
  return postResult({
    label, challenge, venture, target,
    mundaneResult: mappedMundane, 
    magicResults: mappedMagic,
    success, successes, hasFlux, fluxCount,
    roll, actor
  });
}

/**
 * Parse a depletion string and roll for it.
 */
export async function checkDepletion(depletionString, actor = null) {
  if (!depletionString || depletionString === "" || depletionString === "—") return null;
  
  // Parse "X-Y" or just "X" from the string
  const match = depletionString.match(/(\d+)(?:-(\d+))?/);
  if (!match) return null;
  
  const low = parseInt(match[1]);
  const high = match[2] !== undefined ? parseInt(match[2]) : low;
  
  const roll = await new Roll("1d10").evaluate();
  const rawResult = roll.dice[0].results[0].result;
  const result = rawResult === 10 ? 0 : rawResult; // Map 10 to 0
  
  const depleted = result >= low && result <= high;
  
  // Create simple chat message
  const content = `
    <div class="dice-result ${depleted ? 'failure' : 'success'}">
      <div class="roll-title">Depletion Check</div>
      <div class="dice-display"><div class="die mundane-die">${result}</div></div>
      <div class="${depleted ? 'failure-banner' : 'success-banner'}">
        ${depleted ? "DEPLETED" : "Safe"} (Range: ${low}${high !== low ? '-'+high : ''})
      </div>
    </div>
  `;
  
  await ChatMessage.create({
    speaker: actor ? ChatMessage.getSpeaker({ actor }) : {},
    content,
    rolls: [roll]
  });
  
  return { roll, result, depleted, range: `${low}-${high}`, original: depletionString };
}

/**
 * Post a formatted chat message with the dice result.
 */
async function postResult(data) {
  const templateData = { ...data, config: CONFIG.ISUN };
  const content = await renderTemplate("systems/invisible-sun/templates/chat/dice-result.hbs", templateData);
  
  await ChatMessage.create({
    speaker: data.actor ? ChatMessage.getSpeaker({ actor: data.actor }) : {},
    content,
    rolls: data.roll ? [data.roll] : [],
  });
  
  return data;
}
