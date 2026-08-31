/**
 * Invisible Sun — whether an action is rolled for at all
 *
 * On its own, and not in dice.mjs, because it is a rule rather than a roll and
 * ought to be testable without one. dice.mjs reaches the chat card, which
 * reaches the Path of Suns, which reaches Foundry's application classes at
 * module scope — so importing it in Node loads half the system to ask a
 * question about two numbers.
 */

/**
 * Whether an action is rolled for at all, and if not, why not.
 *
 * "The challenge can range from 'routine,' which means there's no real chance
 * for failure, to 'impossible'… Players roll a die to determine the success or
 * failure of an action that is between routine and impossible" (The Gate, p5).
 * The challenge table says it flatly: "0 — Routine; never requires a die roll."
 *
 * So routine is decided by the challenge alone. It was decided by the target —
 * challenge minus venture — which is right whenever the venture helps, and
 * wrong when it does not: a challenge of 0 against a venture of −1, which the
 * Path of Suns hands out freely, came to a target of 1 and called for a roll
 * for something the rules say is never rolled for.
 *
 * A target of 0 or less is still automatic, but for the other reason given:
 * "the venture is subtracted from the challenge to determine the number needed
 * on the die roll", and a die reads 0 to 9, so a number of 0 or less is met by
 * any face. Told apart because they are different answers — one is "there was
 * nothing to beat", the other "you brought more than enough".
 *
 * @returns {"routine"|"assured"|"impossible"|"roll"}
 */
export function outcomeKind({ challenge = 0, venture = 0, magicDice = 0, sortilege = 0 }) {
  if (challenge <= 0) return "routine";

  const target = challenge - venture;
  if (target <= 0) return "assured";
  /* A die reads 0 to 9, so a target of 10 cannot be met on one — and only more
   * dice give another chance at it. An Experimental Die is not one of them: it
   * never contributes a success. */
  if (target >= 10 && magicDice === 0 && sortilege === 0) return "impossible";
  return "roll";
}
