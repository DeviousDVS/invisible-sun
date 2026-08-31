/**
 * Invisible Sun — whether an action is rolled for
 *
 * "The challenge can range from 'routine,' which means there's no real chance
 * for failure, to 'impossible'… Players roll a die to determine the success or
 * failure of an action that is between routine and impossible" (The Gate, p5),
 * and the challenge table says it outright: "0 — Routine; never requires a die
 * roll."
 *
 * The case that matters is the last suite. Routine is decided by the challenge
 * alone, and deciding it by the target instead was right whenever the venture
 * helped and wrong when it did not.
 */
import { test, describe } from "node:test";
import assert from "node:assert/strict";

import { outcomeKind } from "../../module/helpers/outcome.mjs";

describe("a routine challenge is never rolled for", () => {

  test("challenge 0, whatever the venture", () => {
    for (const venture of [0, 3, 12]) {
      assert.equal(outcomeKind({ challenge: 0, venture }), "routine", `venture ${venture}`);
    }
  });

  test("challenge 0 against a venture that hurts", () => {
    /* The bug this fixes. The Path of Suns hands out −1 and −2 freely, and a
     * challenge of 0 against a venture of −1 came to a target of 1, so the
     * system called for a roll on something the rules never roll for. */
    assert.equal(outcomeKind({ challenge: 0, venture: -1 }), "routine");
    assert.equal(outcomeKind({ challenge: 0, venture: -2 }), "routine");
  });

  test("a negative challenge is routine too", () => {
    // Nothing produces one, but nothing should have to check either.
    assert.equal(outcomeKind({ challenge: -3, venture: 0 }), "routine");
  });
});

describe("a challenge the venture has already covered", () => {

  test("is assured, not routine — they are different answers", () => {
    // "the venture is subtracted from the challenge to determine the number
    // needed on the die roll", and a die reads 0 to 9, so 0 or less is met by
    // any face. But there *was* something to beat.
    assert.equal(outcomeKind({ challenge: 5, venture: 5 }), "assured");
    assert.equal(outcomeKind({ challenge: 5, venture: 9 }), "assured");
  });

  test("one short of it is still a roll", () => {
    assert.equal(outcomeKind({ challenge: 5, venture: 4 }), "roll");
  });
});

describe("a challenge nothing can reach", () => {

  test("a target of 10 cannot be met on one die", () => {
    assert.equal(outcomeKind({ challenge: 10, venture: 0 }), "impossible");
    assert.equal(outcomeKind({ challenge: 12, venture: 2 }), "impossible");
  });

  test("more dice make it possible again", () => {
    assert.equal(outcomeKind({ challenge: 10, venture: 0, magicDice: 1 }), "roll");
    assert.equal(outcomeKind({ challenge: 10, venture: 0, sortilege: 1 }), "roll");
  });

  test("a target of 9 is merely hard", () => {
    assert.equal(outcomeKind({ challenge: 9, venture: 0 }), "roll");
  });
});
